export type Chime = 'start' | 'saved' | 'cancel';

const CHIMES: Record<Chime, number[]> = {
  start: [660, 880],
  saved: [523, 659, 784],
  cancel: [440, 330],
};

function audioConstraints(deviceId?: string): MediaTrackConstraints {
  return {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
  };
}

export class AudioMonitor {
  onLevel?: (rms: number, time: number, pcm?: Float32Array) => void;

  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private node: AudioWorkletNode | null = null;

  get now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  get running(): boolean {
    return this.ctx !== null;
  }

  async start(deviceId?: string): Promise<void> {
    if (this.ctx) return;
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints(deviceId) });
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
    this.source = source;
    this.node = node;
  }

  async switchDevice(deviceId?: string): Promise<void> {
    if (!this.ctx || !this.node) return;
    const nextStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints(deviceId) });
    this.source?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = nextStream;
    this.source = this.ctx.createMediaStreamSource(nextStream);
    this.source.connect(this.node);
  }

  stop(): void {
    this.source?.disconnect();
    this.node?.port.close();
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.ctx?.close();
    this.ctx = null;
    this.source = null;
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
