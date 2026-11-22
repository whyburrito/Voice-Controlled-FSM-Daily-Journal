import { encodeWav } from './wav';

const SAMPLE_RATE = 16000;
const PRE_ROLL_CHUNKS = 5;
const PAUSE_FRAMES = 7;
const MIN_VOICE_FRAMES = 3;
const MAX_UTTERANCE_SAMPLES = SAMPLE_RATE * 6;
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/audio/transcriptions';
const WHISPER_PROMPT =
  'Hey Journal, start note. Save note. Cancel note. Hashtag, tag as, priority high, medium, low.';
const SOUND_TAG_RE = /\s*(?:\[[^\]]*\]|\([^)]*\))\s*/g;
const HALLUCINATION_RE = /^(?:thank you\.?|thanks for watching!?|you\.?|.)$/i;

function mergeChunks(chunks: Float32Array[], totalSamples: number): Float32Array {
  const out = new Float32Array(totalSamples);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

export class GroqSpeechEngine {
  onUpdate?: (final: string, interim: string) => void;
  onError?: (message: string) => void;
  onClearError?: () => void;
  onActivity?: () => void;

  private active = false;
  private apiKey = '';
  private preRoll: Float32Array[] = [];
  private chunks: Float32Array[] = [];
  private samples = 0;
  private voiceFrames = 0;
  private silenceFrames = 0;
  private speaking = false;

  private finalText = '';
  private busy = false;
  private queue: Float32Array[] = [];
  private flushResolvers: (() => void)[] = [];

  start(apiKey: string): void {
    const trimmed = apiKey.trim();
    if (!trimmed) {
      throw new Error('Please paste your free Groq API key (gsk_…) in the control bar first.');
    }
    this.apiKey = trimmed;
    this.active = true;
    this.resetAudio();
    this.queue = [];
    this.finalText = '';
  }

  stop(): void {
    this.active = false;
    this.resetAudio();
    this.queue = [];
    this.finalText = '';
    this.resolveFlushes();
  }

  feed(pcm: Float32Array, rms: number, threshold: number): void {
    if (!this.active) return;
    const isVoice = this.speaking ? rms > threshold * 0.6 : rms > threshold;
    const copy = new Float32Array(pcm);

    if (isVoice) {
      this.onActivity?.();
      if (!this.speaking) {
        this.speaking = true;
        this.silenceFrames = 0;
        this.voiceFrames = 0;
        this.chunks = [...this.preRoll];
        this.samples = this.preRoll.reduce((acc, c) => acc + c.length, 0);
        this.preRoll = [];
      } else {
        this.silenceFrames = 0;
      }

      this.chunks.push(copy);
      this.samples += copy.length;
      this.voiceFrames += 1;

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
    if (!this.busy && this.queue.length === 0) return;
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
      this.queue.push(audio);
      void this.drainQueue();
    } else if (!this.busy && this.queue.length === 0) {
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
  }

  private async drainQueue(): Promise<void> {
    if (this.busy || !this.active) return;
    const next = this.queue.shift();
    if (!next) {
      this.resolveFlushes();
      return;
    }
    this.busy = true;
    try {
      const text = await this.transcribe(next);
      if (!this.active) return;
      this.onClearError?.();
      if (text) {
        this.onActivity?.();
        this.finalText += `${text} `;
        this.onUpdate?.(this.finalText, '');
      }
    } catch (e) {
      if (this.active) {
        this.onError?.(`Groq speech error: ${e instanceof Error ? e.message : String(e)}`);
      }
    } finally {
      this.busy = false;
      if (this.active && this.queue.length > 0) {
        void this.drainQueue();
      } else {
        this.resolveFlushes();
      }
    }
  }

  private async transcribe(samples: Float32Array, attempt = 0): Promise<string> {
    const wav = encodeWav(samples, SAMPLE_RATE);
    const form = new FormData();
    form.append('file', wav, 'speech.wav');
    form.append('model', 'whisper-large-v3-turbo');
    form.append('language', 'en');
    form.append('temperature', '0');
    form.append('prompt', WHISPER_PROMPT);

    let res: Response;
    try {
      res = await fetch(GROQ_ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey}` },
        body: form,
      });
    } catch (err) {
      if (attempt < 1) {
        await new Promise((r) => setTimeout(r, 350));
        return this.transcribe(samples, attempt + 1);
      }
      throw err;
    }

    if (!res.ok) {
      if ((res.status === 429 || res.status >= 500) && attempt < 1) {
        await new Promise((r) => setTimeout(r, 400));
        return this.transcribe(samples, attempt + 1);
      }
      if (res.status === 401) {
        throw new Error('Invalid Groq API key (401). Check your gsk_… key.');
      }
      const errText = await res.text().catch(() => res.statusText);
      throw new Error(`HTTP ${res.status}: ${errText.slice(0, 120)}`);
    }

    const data = (await res.json()) as { text?: string };
    const cleaned = (data.text ?? '').replace(SOUND_TAG_RE, ' ').replace(/\s+/g, ' ').trim();
    if (HALLUCINATION_RE.test(cleaned)) return '';
    return cleaned;
  }

  private resolveFlushes(): void {
    if (this.flushResolvers.length === 0) return;
    const resolvers = this.flushResolvers;
    this.flushResolvers = [];
    resolvers.forEach((r) => r());
  }
}
