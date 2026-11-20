declare module '@xenova/transformers' {
  export const env: {
    allowLocalModels: boolean;
    useBrowserCache: boolean;
  };
  export type ProgressInfo = {
    status: string;
    file?: string;
    progress?: number;
  };
  export function pipeline(
    task: 'automatic-speech-recognition',
    model: string,
    options?: {
      quantized?: boolean;
      progress_callback?: (info: ProgressInfo) => void;
    },
  ): Promise<(audio: Float32Array, options?: Record<string, unknown>) => Promise<{ text?: string }>>;
}
