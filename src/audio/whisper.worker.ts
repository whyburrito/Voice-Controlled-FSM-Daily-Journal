import { env, pipeline, type ProgressInfo } from '@xenova/transformers';

env.allowLocalModels = false;
env.useBrowserCache = true;

const MODEL_ID = 'Xenova/whisper-tiny.en';
const SOUND_TAG_RE = /\s*(?:\[[^\]]*\]|\([^)]*\))\s*/g;

type Transcriber = (audio: Float32Array, options?: Record<string, unknown>) => Promise<{ text?: string }>;

type InMessage =
  | { type: 'init' }
  | { type: 'transcribe'; id: number; audio: Float32Array; isFinal: boolean };

let loader: Promise<Transcriber> | null = null;

function ensureModel(): Promise<Transcriber> {
  if (!loader) {
    loader = pipeline('automatic-speech-recognition', MODEL_ID, {
      quantized: true,
      progress_callback: (info: ProgressInfo) => {
        if (info.status === 'progress' && info.file?.endsWith('.onnx') && typeof info.progress === 'number') {
          self.postMessage({
            type: 'progress',
            text: `Loading local speech model (${Math.round(info.progress)}%)…`,
          });
        } else if (info.status === 'initiate' && info.file?.endsWith('.onnx')) {
          self.postMessage({ type: 'progress', text: 'Downloading local speech model…' });
        }
      },
    }).catch((err) => {
      loader = null;
      throw err;
    });
  }
  return loader;
}

self.onmessage = async (e: MessageEvent<InMessage>) => {
  const msg = e.data;
  if (msg.type === 'init') {
    try {
      self.postMessage({ type: 'progress', text: 'Initializing local speech model…' });
      await ensureModel();
      self.postMessage({ type: 'ready' });
    } catch (err) {
      self.postMessage({
        type: 'error',
        message: `Local speech model failed to load: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
    return;
  }

  if (msg.type === 'transcribe') {
    try {
      const transcriber = await ensureModel();
      const res = await transcriber(msg.audio);
      const cleaned = (res.text ?? '').replace(SOUND_TAG_RE, ' ').replace(/\s+/g, ' ').trim();
      self.postMessage({ type: 'result', id: msg.id, text: cleaned, isFinal: msg.isFinal });
    } catch (err) {
      self.postMessage({
        type: 'error',
        message: `Local speech recognition error: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }
};
