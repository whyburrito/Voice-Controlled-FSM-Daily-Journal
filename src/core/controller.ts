import { AudioMonitor, type Chime } from '../audio/audioMonitor';
import { GroqSpeechEngine } from '../audio/groqSpeech';
import { LocalSpeechEngine } from '../audio/localSpeech';
import { SpeechEngine } from '../audio/speech';
import { SILENCE_SECONDS, STATE_STEP_MS } from '../config';
import { db } from '../db/db';
import { TranscriptCursor } from './cursor';
import { JournalFSM, type State, type Transition } from './fsm';
import { isValidEntry, parseEntry, type ParsedEntry } from './parser';
import { updateTabIndicator } from './tabIndicator';

export type EngineMode = 'groq' | 'browser' | 'local';

export interface MicDevice {
  deviceId: string;
  label: string;
}

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
  groqApiKey: string;
  speechSupported: boolean;
  devices: MicDevice[];
  selectedDeviceId: string;
  sensitivity: number;
  voiceThreshold: number;
}

type Listener = () => void;

const STORAGE_KEY = 'voice_journal_groq_key';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function loadGroqKey(): string {
  const envKey = (import.meta.env.VITE_GROQ_API_KEY as string | undefined) ?? '';
  if (typeof localStorage === 'undefined') return envKey;
  return localStorage.getItem(STORAGE_KEY) || envKey;
}

function sensitivityToRms(sensitivity: number): number {
  const clamped = Math.max(1, Math.min(100, sensitivity));
  const pct = Math.max(6, Math.min(65, Math.round(68 - clamped * 0.58)));
  return (pct / 250) ** 2;
}

export class JournalController {
  readonly fsm = new JournalFSM();

  private audio = new AudioMonitor();
  private speech = new SpeechEngine();
  private localSpeech = new LocalSpeechEngine();
  private groqSpeech = new GroqSpeechEngine();
  private mic = new TranscriptCursor();
  private sim = new TranscriptCursor();
  private simText = '';
  private owner: TranscriptCursor | null = null;

  private lastVoice = 0;
  private level = 0;
  private starting = false;
  private flushingSilence = false;
  private processToken = 0;

  private snap: Snapshot;
  private listeners = new Set<Listener>();
  private levelListeners = new Set<Listener>();

  constructor() {
    const initialSensitivity = 75;
    this.snap = {
      state: this.fsm.state,
      live: '',
      idleHeard: '',
      stageRaw: '',
      stageEntry: null,
      error: null,
      modelStatus: null,
      micEnabled: false,
      engineMode: 'groq',
      groqApiKey: loadGroqKey(),
      speechSupported: SpeechEngine.supported(),
      devices: [],
      selectedDeviceId: '',
      sensitivity: initialSensitivity,
      voiceThreshold: sensitivityToRms(initialSensitivity),
    };

    updateTabIndicator(this.fsm.state);
    this.fsm.subscribe((t) => this.onTransition(t));

    this.speech.onUpdate = (final, interim) => {
      this.lastVoice = this.audio.now;
      this.mic.update(final, interim);
      this.scan(this.mic);
    };
    this.speech.onRestart = () => {
      if (this.fsm.state === 'ACTIVE_RECORDING') this.lastVoice = this.audio.now;
      this.mic.restart(this.owner === this.mic);
    };
    this.speech.onError = (message) => this.patch({ error: message });
    this.speech.onClearError = () => {
      if (this.snap.error?.startsWith('Speech')) this.patch({ error: null });
    };

    this.localSpeech.onUpdate = (final, interim) => {
      this.lastVoice = this.audio.now;
      this.mic.update(final, interim);
      this.scan(this.mic);
    };
    this.localSpeech.onError = (message) => this.patch({ error: message });
    this.localSpeech.onClearError = () => {
      if (this.snap.error?.startsWith('Local speech')) this.patch({ error: null });
    };
    this.localSpeech.onStatus = (modelStatus) => this.patch({ modelStatus });

    this.groqSpeech.onUpdate = (final, interim) => {
      this.lastVoice = this.audio.now;
      this.mic.update(final, interim);
      this.scan(this.mic);
    };
    this.groqSpeech.onActivity = () => {
      this.lastVoice = this.audio.now;
    };
    this.groqSpeech.onError = (message) => this.patch({ error: message });
    this.groqSpeech.onClearError = () => {
      if (this.snap.error?.startsWith('Groq speech')) this.patch({ error: null });
    };

    this.audio.onLevel = (rms, time, pcm) => this.onLevel(rms, time, pcm);

    if (typeof navigator !== 'undefined' && navigator.mediaDevices) {
      void this.refreshDevices();
      navigator.mediaDevices.addEventListener?.('devicechange', () => void this.refreshDevices());
    }
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

  setGroqApiKey(groqApiKey: string): void {
    const trimmed = groqApiKey.trim();
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, trimmed);
    }
    this.patch({ groqApiKey: trimmed, error: null });
  }

  async refreshDevices(): Promise<void> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return;
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      const devices: MicDevice[] = list
        .filter((d) => d.kind === 'audioinput' && d.deviceId !== '' && d.deviceId !== 'default')
        .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Microphone ${i + 1}` }));
      const validSelected =
        this.snap.selectedDeviceId && devices.some((d) => d.deviceId === this.snap.selectedDeviceId)
          ? this.snap.selectedDeviceId
          : '';
      this.patch({ devices, selectedDeviceId: validSelected });
    } catch {
      // Ignore enumerateDevices failures before mic permission is granted
    }
  }

  async setDevice(deviceId: string): Promise<void> {
    this.patch({ selectedDeviceId: deviceId, error: null });
    if (!this.snap.micEnabled) return;
    try {
      await this.audio.switchDevice(deviceId || undefined);
    } catch (e) {
      this.patch({ error: e instanceof Error ? e.message : String(e) });
    }
  }

  setSensitivity(value: number): void {
    const sensitivity = Math.max(1, Math.min(100, Math.round(value)));
    this.patch({ sensitivity, voiceThreshold: sensitivityToRms(sensitivity) });
  }

  async start(useMic = true): Promise<void> {
    if (this.fsm.state !== 'OFFLINE' || this.starting) return;
    this.starting = true;
    try {
      this.patch({ error: null });
      if (useMic) {
        if (this.snap.engineMode === 'groq') {
          this.groqSpeech.start(this.snap.groqApiKey);
        }
        await this.audio.start(this.snap.selectedDeviceId || undefined);
        await this.refreshDevices();
        if (this.snap.engineMode === 'local') {
          await this.localSpeech.start();
        } else if (this.snap.engineMode === 'browser') {
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
      this.groqSpeech.stop();
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
    this.groqSpeech.stop();
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
    const isVoice = rms > this.snap.voiceThreshold;
    if (isVoice) this.lastVoice = time;

    if (this.snap.micEnabled && pcm) {
      if (this.snap.engineMode === 'groq') {
        this.groqSpeech.feed(pcm, rms, this.snap.voiceThreshold);
      } else if (this.snap.engineMode === 'local') {
        this.localSpeech.feed(pcm, isVoice);
      }
    }

    if (
      this.fsm.state === 'IDLE_MONITORING' &&
      !isVoice &&
      this.snap.micEnabled &&
      this.snap.engineMode === 'browser' &&
      !this.snap.idleHeard
    ) {
      this.speech.refreshIfIdle();
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
      if (this.snap.engineMode === 'groq') {
        await this.groqSpeech.flush();
      } else if (this.snap.engineMode === 'local') {
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
      const tags = entry.tags.length ? ` [${entry.tags.map((t) => `#${t}`).join(' ')}]` : '';
      this.notify('✅ Note Saved', `${entry.body}${tags}`);
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
    updateTabIndicator(t.to);
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
    if (t.to === 'ACTIVE_RECORDING') {
      this.lastVoice = this.audio.now;
      this.notify('🔴 Recording Started', 'Speak your note now. Say "Save note" or pause 5s to finish.');
    } else if (
      t.to === 'IDLE_MONITORING' &&
      (t.event === 'CANCEL' || t.event === 'INVALID' || t.event === 'REJECT' || t.event === 'RESET')
    ) {
      this.notify('⚪ Note Cancelled', 'Recording stopped without saving. Returned to idle monitoring.');
    }
  }

  private notify(title: string, body: string): void {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    new Notification(title, {
      body: body.slice(0, 140),
      tag: 'voice-journal-state',
      silent: true,
    });
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
