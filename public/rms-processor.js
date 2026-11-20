const TARGET_RATE = 16000;

class RmsMeter extends AudioWorkletProcessor {
  constructor() {
    super();
    this.window = Math.round(sampleRate * 0.1);
    this.buf = new Float32Array(this.window + 1024);
    this.sum = 0;
    this.count = 0;
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel) {
      if (this.count + channel.length > this.buf.length) {
        const next = new Float32Array(this.count + channel.length + 1024);
        next.set(this.buf.subarray(0, this.count));
        this.buf = next;
      }
      for (let i = 0; i < channel.length; i++) {
        const s = channel[i];
        this.sum += s * s;
        this.buf[this.count++] = s;
      }
    }
    if (this.count >= this.window) {
      const ratio = sampleRate / TARGET_RATE;
      const outLen = Math.round(this.count / ratio);
      const pcm = new Float32Array(outLen);
      for (let i = 0; i < outLen; i++) {
        const start = Math.floor(i * ratio);
        const end = Math.min(this.count, Math.ceil((i + 1) * ratio));
        let acc = 0;
        for (let j = start; j < end; j++) acc += this.buf[j];
        pcm[i] = acc / Math.max(1, end - start);
      }
      this.port.postMessage(
        { rms: Math.sqrt(this.sum / this.count), time: currentTime, pcm },
        [pcm.buffer],
      );
      this.sum = 0;
      this.count = 0;
    }
    return true;
  }
}

registerProcessor('rms-meter', RmsMeter);
