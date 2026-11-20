export type Chime = 'start' | 'saved' | 'cancel';

const CHIMES: Record<Chime, number[]> = {
  start: [660, 880],
  saved: [523, 659, 784],
  cancel: [440, 330],
};

// Keeps the microphone stream and AudioContext alive so the tab is never suspended,
// and reports RMS levels from the audio thread, which is not subject to timer throttling.
export class AudioMonitor {
  onLevel?: (rms: number, time: number, pcm?: Float32Array) => void;

  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private node: AudioWorkletNode | null = null;

  get now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  get running(): boolean {
    return this.ctx !== null;
  }

  async start(): Promise<void> {
    if (this.ctx) return;
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    const ctx = new AudioContext();
    await ctx.audioWorklet.addModule(`${import.meta.env.BASE_URL}rms-processor.js`);

    const source = ctx.createMediaStreamSource(this.stream);
    const node = new AudioWorkletNode(ctx, 'rms-meter');
    const mute = ctx.createGain();
    mute.gain.value = 0;
    node.port.onmessage = (e: MessageEvent<{ rms: number; time: number; pcm?: Float32Array }>) =>
      this.onLevel?.(e.data.rms, e.data.time, e.data.pcm);
    source.connect(node).connect(mute).connect(ctx.destination);

    if (ctx.state === 'suspended') await ctx.resume();
    this.ctx = ctx;
    this.node = node;
  }

  stop(): void {
    this.node?.port.close();
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.ctx?.close();
    this.ctx = null;
    this.node = null;
    this.stream = null;
  }

  chime(kind: Chime): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t0 = ctx.currentTime;
    CHIMES[kind].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = t0 + i * 0.12;
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.15, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.25);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.3);
    });
  }
}
