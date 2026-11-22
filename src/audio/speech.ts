import { SPEECH_LANG } from '../config';
import { CANCEL_RE, STOP_RE, WAKE_RE } from '../core/parser';

const FATAL_ERRORS = new Set(['not-allowed', 'service-not-allowed', 'language-not-supported']);
const IGNORED_ERRORS = new Set(['no-speech', 'aborted']);
const MAX_ALTERNATIVES = 5;
const IDLE_MAX_AGE_MS = 25000;
const IDLE_QUIET_MS = 4000;

function getCtor(): SpeechRecognitionCtor | undefined {
  return window.SpeechRecognition ?? window.webkitSpeechRecognition;
}

const isCommand = (s: string) => WAKE_RE.test(s) || STOP_RE.test(s) || CANCEL_RE.test(s);

function pickTranscript(result: SpeechRecognitionResultLike): string {
  for (let i = 0; i < result.length; i++) {
    if (isCommand(result[i].transcript)) return result[i].transcript;
  }
  return result[0].transcript;
}

export class SpeechEngine {
  onUpdate?: (final: string, interim: string) => void;
  onRestart?: () => void;
  onError?: (message: string) => void;
  onClearError?: () => void;

  private rec: SpeechRecognitionInstance | null = null;
  private active = false;
  private startedAt = 0;
  private lastResultAt = 0;
  private errorCount = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  static supported(): boolean {
    return typeof window !== 'undefined' && getCtor() !== undefined;
  }

  start(): void {
    if (!getCtor() || this.active) return;
    this.active = true;
    this.errorCount = 0;
    this.startedAt = 0;
    this.lastResultAt = 0;
    this.clearTimer();
    this.spawn();
  }

  stop(): void {
    this.active = false;
    this.errorCount = 0;
    this.startedAt = 0;
    this.lastResultAt = 0;
    this.clearTimer();
    const rec = this.rec;
    this.rec = null;
    if (rec) {
      rec.onstart = null;
      rec.onresult = null;
      rec.onerror = null;
      rec.onend = null;
      rec.abort();
    }
  }

  refreshIfIdle(): void {
    if (!this.active || !this.rec || this.retryTimer) return;
    const now = Date.now();
    if (now - this.startedAt >= IDLE_MAX_AGE_MS && now - this.lastResultAt >= IDLE_QUIET_MS) {
      this.startedAt = now;
      try {
        this.rec.stop();
      } catch {
        // Ignore if already stopping
      }
    }
  }

  private spawn(): void {
    const Ctor = getCtor();
    if (!Ctor || !this.active) return;

    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = MAX_ALTERNATIVES;
    rec.lang = SPEECH_LANG;

    rec.onresult = (e) => {
      this.errorCount = 0;
      this.lastResultAt = Date.now();
      this.onClearError?.();
      let final = '';
      let interim = '';
      for (let i = 0; i < e.results.length; i++) {
        const result = e.results[i];
        const text = pickTranscript(result);
        if (result.isFinal) final += `${text} `;
        else interim += text;
      }
      this.onUpdate?.(final, interim);
    };

    rec.onerror = (e) => {
      if (IGNORED_ERRORS.has(e.error)) return;
      if (FATAL_ERRORS.has(e.error)) {
        this.active = false;
        this.clearTimer();
        this.onError?.(`Speech recognition: ${e.error}`);
        return;
      }
      this.errorCount += 1;
      this.onError?.(
        e.error === 'network'
          ? 'Speech service unreachable (network). Retrying automatically…'
          : `Speech recognition: ${e.error}. Retrying…`,
      );
    };

    rec.onend = () => {
      if (!this.active || this.rec !== rec) return;
      this.onRestart?.();
      if (this.errorCount === 0) {
        this.spawn();
      } else if (this.errorCount === 1) {
        this.scheduleSpawn(200);
      } else {
        this.scheduleSpawn(Math.min(2000, 400 * this.errorCount));
      }
    };

    this.rec = rec;
    this.startedAt = Date.now();
    try {
      rec.start();
    } catch {
      this.errorCount += 1;
      this.scheduleSpawn(Math.min(2000, 400 * this.errorCount));
    }
  }

  private scheduleSpawn(delay: number): void {
    this.clearTimer();
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (this.active) this.spawn();
    }, delay);
  }

  private clearTimer(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }
}
