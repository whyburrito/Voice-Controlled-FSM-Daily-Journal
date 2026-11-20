import { AudioMonitor, type Chime } from '../audio/audioMonitor';
import { LocalSpeechEngine } from '../audio/localSpeech';
import { SpeechEngine } from '../audio/speech';
import { MIN_VOICE_RMS, NOISE_FLOOR_RATIO, SILENCE_SECONDS, STATE_STEP_MS } from '../config';
import { db } from '../db/db';
import { TranscriptCursor } from './cursor';
import { JournalFSM, type State, type Transition } from './fsm';
import { isValidEntry, parseEntry, type ParsedEntry } from './parser';

export type EngineMode = 'local' | 'browser';

export interface Snapshot {
  state: State;
  live: string;
  idleHeard: string;
  stageRaw: string;
  stageEntry: ParsedEntry | null;
  error: string | null;
  modelStatus: string | null;
  micEnabled: boolean;
  engineMode: EngineMode;
  speechSupported: boolean;
}

type Listener = () => void;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class JournalController {
  readonly fsm = new JournalFSM();

  private audio = new AudioMonitor();
  private speech = new SpeechEngine();
  private localSpeech = new LocalSpeechEngine();
  private mic = new TranscriptCursor();
  private sim = new TranscriptCursor();
  private simText = '';
  private owner: TranscriptCursor | null = null;

  private lastVoice = 0;
  private noiseFloor = MIN_VOICE_RMS / NOISE_FLOOR_RATIO;
  private level = 0;
  private starting = false;
  private flushingSilence = false;
  private processToken = 0;

  private snap: Snapshot;
  private listeners = new Set<Listener>();
  private levelListeners = new Set<Listener>();

  constructor() {
    this.snap = {
      state: this.fsm.state,
      live: '',
      idleHeard: '',
      stageRaw: '',
      stageEntry: null,
      error: null,
      modelStatus: null,
      micEnabled: false,
      engineMode: 'local',
      speechSupported: SpeechEngine.supported(),
    };

    this.fsm.subscribe((t) => this.onTransition(t));

    this.speech.onUpdate = (final, interim) => {
      this.mic.update(final, interim);
      this.scan(this.mic);
    };
    this.speech.onRestart = () => this.mic.restart(this.owner === this.mic);
    this.speech.onError = (message) => this.patch({ error: message });
    this.speech.onClearError = () => {
      if (this.snap.error?.startsWith('Speech')) this.patch({ error: null });
    };

    this.localSpeech.onUpdate = (final, interim) => {
      this.mic.update(final, interim);
      this.scan(this.mic);
    };
    this.localSpeech.onError = (message) => this.patch({ error: message });
    this.localSpeech.onClearError = () => {
      if (this.snap.error?.startsWith('Local speech')) this.patch({ error: null });
    };
    this.localSpeech.onStatus = (modelStatus) => this.patch({ modelStatus });

    this.audio.onLevel = (rms, time, pcm) => this.onLevel(rms, time, pcm);
  }

  // Store bindings
  subscribe = (fn: Listener) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = () => this.snap;
  subscribeLevel = (fn: Listener) => {
    this.levelListeners.add(fn);
    return () => this.levelListeners.delete(fn);
  };
  getLevel = () => this.level;

  setEngineMode(engineMode: EngineMode): void {
    if (this.fsm.state !== 'OFFLINE' || this.starting) return;
    this.patch({ engineMode, error: null });
  }

  async start(useMic = true): Promise<void> {
    if (this.fsm.state !== 'OFFLINE' || this.starting) return;
    this.starting = true;
    try {
      this.patch({ error: null });
      if (useMic) {
        await this.audio.start();
        if (this.snap.engineMode === 'local') {
          await this.localSpeech.start();
        } else {
          this.speech.start();
        }
        if ('Notification' in window && Notification.permission === 'default') {
          void Notification.requestPermission();
        }
      }
      this.patch({ micEnabled: useMic, modelStatus: null });
      this.fsm.send('START');
    } catch (e) {
      this.speech.stop();
      this.localSpeech.stop();
      this.audio.stop();
      this.patch({
        modelStatus: null,
        error: e instanceof Error ? e.message : String(e),
      });
    } finally {
      this.starting = false;
    }
  }

  shutdown(): void {
    this.processToken += 1;
    this.flushingSilence = false;
    this.speech.stop();
    this.localSpeech.stop();
    this.audio.stop();
    this.mic.restart(false);
    this.sim.restart(false);
    this.simText = '';
    this.owner = null;
    this.fsm.send('SHUTDOWN');
    this.setLevel(0);
    this.patch({
      live: '',
      idleHeard: '',
      stageRaw: '',
      stageEntry: null,
      micEnabled: false,
      modelStatus: null,
      error: null,
    });
  }

  forceReset(): void {
    this.processToken += 1;
    this.flushingSilence = false;
    this.owner?.release();
    this.owner = null;
    this.fsm.send('RESET');
    this.patch({ live: '', idleHeard: '', stageRaw: '', stageEntry: null });
  }

  simulate(text: string): void {
    if (!text.trim()) return;
    this.simText += `${text.trim()} `;
    this.sim.update(this.simText, '');
    this.scan(this.sim);
  }

  private scan(cursor: TranscriptCursor): void {
    if (this.fsm.state === 'IDLE_MONITORING') {
      const detected = cursor.detectWake();
      if (!detected) {
        this.patch({ idleHeard: cursor.peekIdle() });
        return;
      }
      this.owner = cursor;
      this.patch({ idleHeard: '' });
      this.fsm.send('WAKE');
    }
    if (this.fsm.state !== 'ACTIVE_RECORDING' || this.owner !== cursor) return;

    const note = cursor.readNote();
    if (note.cancelled) {
      this.endRecording();
      this.fsm.send('CANCEL');
    } else if (note.stopped) {
      this.endRecording();
      void this.process(note.text, 'STOP');
    } else {
      this.patch({ live: note.text });
    }
  }

  private onLevel(rms: number, time: number, pcm?: Float32Array): void {
    this.setLevel(rms);
    const threshold = Math.max(MIN_VOICE_RMS, this.noiseFloor * NOISE_FLOOR_RATIO);
    const isVoice = rms > threshold;
    if (isVoice) this.lastVoice = time;
    else if (this.fsm.state === 'IDLE_MONITORING') this.noiseFloor = this.noiseFloor * 0.95 + rms * 0.05;

    if (this.snap.micEnabled && this.snap.engineMode === 'local' && pcm) {
      this.localSpeech.feed(pcm, isVoice);
    }

    if (
      this.fsm.state === 'ACTIVE_RECORDING' &&
      this.owner === this.mic &&
      !this.flushingSilence &&
      time - this.lastVoice >= SILENCE_SECONDS
    ) {
      void this.handleSilence();
    }
  }

  private async handleSilence(): Promise<void> {
    this.flushingSilence = true;
    try {
      if (this.snap.engineMode === 'local') {
        await this.localSpeech.flush();
      }
      if (this.fsm.state !== 'ACTIVE_RECORDING' || this.owner !== this.mic) return;
      const note = this.mic.readNote();
      this.endRecording();
      if (note.cancelled) {
        this.fsm.send('CANCEL');
      } else {
        await this.process(note.text, 'SILENCE');
      }
    } finally {
      this.flushingSilence = false;
    }
  }

  private endRecording(): void {
    this.owner?.release();
    this.owner = null;
    this.patch({ live: '' });
  }

  private isStep(token: number, expected: State): boolean {
    return token === this.processToken && this.fsm.state === expected;
  }

  private async process(raw: string, trigger: 'STOP' | 'SILENCE'): Promise<void> {
    if (!this.fsm.send(trigger)) return;
    const token = ++this.processToken;

    // PROCESSING_TEXT
    this.patch({ stageRaw: raw.trim(), stageEntry: null });
    await sleep(STATE_STEP_MS);
    if (!this.isStep(token, 'PROCESSING_TEXT')) return;

    if (!raw.trim()) {
      this.patch({ stageRaw: '', stageEntry: null });
      this.fsm.send('INVALID');
      return;
    }

    const entry = parseEntry(raw);
    this.patch({ stageEntry: entry });
    this.fsm.send('PARSED');

    // CONFIRMATION
    await sleep(STATE_STEP_MS);
    if (!this.isStep(token, 'CONFIRMATION')) return;

    if (!isValidEntry(entry)) {
      this.patch({ stageRaw: '', stageEntry: null });
      this.fsm.send('REJECT');
      return;
    }

    this.fsm.send('CONFIRM');

    // SAVED
    try {
      await db.entries.add({ ...entry, createdAt: Date.now() });
      this.notifySaved(entry.body);
      await sleep(STATE_STEP_MS);
      if (!this.isStep(token, 'SAVED')) return;
      this.patch({ stageRaw: '', stageEntry: null });
      this.fsm.send('DONE');
    } catch (e) {
      this.patch({
        error: `Failed to save entry: ${e instanceof Error ? e.message : String(e)}`,
        stageRaw: '',
        stageEntry: null,
      });
      this.fsm.send('RESET');
    }
  }

  private onTransition(t: Transition): void {
    void db.transitions.add(t);
    this.patch({ state: t.to });

    const chime: Chime | null =
      t.to === 'ACTIVE_RECORDING'
        ? 'start'
        : t.to === 'SAVED'
          ? 'saved'
          : t.to === 'IDLE_MONITORING' && t.event !== 'DONE' && t.event !== 'START'
            ? 'cancel'
            : null;
    if (chime) this.audio.chime(chime);
    if (t.to === 'ACTIVE_RECORDING') this.lastVoice = this.audio.now;
  }

  private notifySaved(body: string): void {
    if (!document.hidden || !('Notification' in window) || Notification.permission !== 'granted') return;
    new Notification('Journal entry saved', { body: body.slice(0, 120), silent: true });
  }

  private patch(p: Partial<Snapshot>): void {
    this.snap = { ...this.snap, ...p };
    this.listeners.forEach((fn) => fn());
  }

  private setLevel(rms: number): void {
    this.level = rms;
    this.levelListeners.forEach((fn) => fn());
  }
}

export const controller = new JournalController();
