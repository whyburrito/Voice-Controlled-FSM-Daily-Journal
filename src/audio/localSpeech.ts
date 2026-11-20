const SAMPLE_RATE = 16000;
const PRE_ROLL_CHUNKS = 4;
const PREVIEW_MIN_VOICE_FRAMES = 4;
const PREVIEW_INTERVAL_SAMPLES = Math.round(SAMPLE_RATE * 1.4);
const MAX_UTTERANCE_SAMPLES = SAMPLE_RATE * 12;
const PAUSE_FRAMES = 6;
const MIN_VOICE_FRAMES = 3;

type WorkerOut =
  | { type: 'progress'; text: string }
  | { type: 'ready' }
  | { type: 'result'; id: number; text: string; isFinal: boolean }
  | { type: 'error'; message: string };

function mergeChunks(chunks: Float32Array[], totalSamples: number): Float32Array {
  const out = new Float32Array(totalSamples);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

export class LocalSpeechEngine {
  onUpdate?: (final: string, interim: string) => void;
  onError?: (message: string) => void;
  onClearError?: () => void;
  onStatus?: (status: string | null) => void;

  private worker: Worker | null = null;
  private ready = false;
  private initPromise: Promise<void> | null = null;
  private active = false;

  private preRoll: Float32Array[] = [];
  private chunks: Float32Array[] = [];
  private samples = 0;
  private voiceFrames = 0;
  private silenceFrames = 0;
  private lastPreviewSamples = 0;
  private speaking = false;

  private finalText = '';
  private interimText = '';

  private nextId = 1;
  private busy = false;
  private finalQueue: Float32Array[] = [];
  private flushResolvers: (() => void)[] = [];

  async start(): Promise<void> {
    this.active = true;
    this.resetAudio();
    this.finalText = '';
    this.interimText = '';
    await this.ensureWorker();
  }

  stop(): void {
    this.active = false;
    this.resetAudio();
    this.finalQueue = [];
    this.finalText = '';
    this.interimText = '';
    this.onStatus?.(null);
    this.resolveFlushes();
  }

  restart(keepText: boolean): void {
    if (!keepText) {
      this.finalText = '';
      this.interimText = '';
    }
  }

  feed(pcm: Float32Array, isVoice: boolean): void {
    if (!this.active || !this.ready) return;
    const copy = new Float32Array(pcm);

    if (isVoice) {
      if (!this.speaking) {
        this.speaking = true;
        this.silenceFrames = 0;
        this.voiceFrames = 0;
        this.lastPreviewSamples = 0;
        this.chunks = [...this.preRoll];
        this.samples = this.preRoll.reduce((acc, c) => acc + c.length, 0);
        this.preRoll = [];
      } else {
        this.silenceFrames = 0;
      }

      this.chunks.push(copy);
      this.samples += copy.length;
      this.voiceFrames += 1;

      if (
        !this.busy &&
        this.finalQueue.length === 0 &&
        this.voiceFrames >= PREVIEW_MIN_VOICE_FRAMES &&
        this.samples - this.lastPreviewSamples >= PREVIEW_INTERVAL_SAMPLES
      ) {
        this.lastPreviewSamples = this.samples;
        this.sendPreview(mergeChunks(this.chunks, this.samples));
      }

      if (this.samples >= MAX_UTTERANCE_SAMPLES) {
        this.finalizeUtterance();
      }
      return;
    }

    if (!this.speaking) {
      this.preRoll.push(copy);
      if (this.preRoll.length > PRE_ROLL_CHUNKS) this.preRoll.shift();
      return;
    }

    this.chunks.push(copy);
    this.samples += copy.length;
    this.silenceFrames += 1;
    if (this.silenceFrames >= PAUSE_FRAMES) {
      this.finalizeUtterance();
    }
  }

  async flush(): Promise<void> {
    if (this.speaking) this.finalizeUtterance();
    if (!this.busy && this.finalQueue.length === 0) return;
    await new Promise<void>((resolve) => {
      this.flushResolvers.push(resolve);
    });
  }

  private finalizeUtterance(): void {
    const audio =
      this.voiceFrames >= MIN_VOICE_FRAMES && this.samples > 0
        ? mergeChunks(this.chunks, this.samples)
        : null;
    this.resetAudio();
    if (audio) {
      this.finalQueue.push(audio);
      this.drainQueue();
    } else if (!this.busy && this.finalQueue.length === 0) {
      this.resolveFlushes();
    }
  }

  private resetAudio(): void {
    this.speaking = false;
    this.preRoll = [];
    this.chunks = [];
    this.samples = 0;
    this.voiceFrames = 0;
    this.silenceFrames = 0;
    this.lastPreviewSamples = 0;
  }

  private sendPreview(audio: Float32Array): void {
    if (!this.worker || this.busy || !this.active) return;
    this.busy = true;
    const id = this.nextId++;
    this.worker.postMessage({ type: 'transcribe', id, audio, isFinal: false }, [audio.buffer]);
  }

  private drainQueue(): void {
    if (this.busy || !this.active) return;
    const next = this.finalQueue.shift();
    if (!next) {
      this.resolveFlushes();
      return;
    }
    if (!this.worker) {
      this.resolveFlushes();
      return;
    }
    this.busy = true;
    const id = this.nextId++;
    this.worker.postMessage({ type: 'transcribe', id, audio: next, isFinal: true }, [next.buffer]);
  }

  private resolveFlushes(): void {
    if (this.flushResolvers.length === 0) return;
    const resolvers = this.flushResolvers;
    this.flushResolvers = [];
    resolvers.forEach((r) => r());
  }

  private ensureWorker(): Promise<void> {
    if (this.ready) return Promise.resolve();
    if (this.initPromise) return this.initPromise;

    const worker = new Worker(new URL('./whisper.worker.ts', import.meta.url), { type: 'module' });
    this.worker = worker;

    this.initPromise = new Promise<void>((resolve, reject) => {
      let settled = false;
      worker.onmessage = (e: MessageEvent<WorkerOut>) => {
        const msg = e.data;
        if (msg.type === 'progress') {
          this.onStatus?.(msg.text);
        } else if (msg.type === 'ready') {
          this.ready = true;
          this.onStatus?.(null);
          this.onClearError?.();
          if (!settled) {
            settled = true;
            resolve();
          }
        } else if (msg.type === 'result') {
          this.busy = false;
          if (!this.active) {
            this.resolveFlushes();
            return;
          }
          this.onClearError?.();
          if (msg.isFinal) {
            if (msg.text) this.finalText += `${msg.text} `;
            this.interimText = '';
            this.onUpdate?.(this.finalText, '');
          } else if (this.speaking) {
            this.interimText = msg.text;
            this.onUpdate?.(this.finalText, this.interimText);
          }
          this.drainQueue();
        } else if (msg.type === 'error') {
          this.busy = false;
          this.onStatus?.(null);
          this.onError?.(msg.message);
          if (!settled) {
            settled = true;
            this.initPromise = null;
            worker.terminate();
            this.worker = null;
            reject(new Error(msg.message));
          } else {
            this.drainQueue();
          }
        }
      };

      worker.onerror = (err) => {
        const message = `Local speech worker error: ${err.message || 'unknown error'}`;
        this.busy = false;
        this.onStatus?.(null);
        this.onError?.(message);
        if (!settled) {
          settled = true;
          this.initPromise = null;
          worker.terminate();
          this.worker = null;
          reject(new Error(message));
        } else {
          this.resolveFlushes();
        }
      };

      worker.postMessage({ type: 'init' });
    });

    return this.initPromise;
  }
}
