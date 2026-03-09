export interface SttResult {
  text: string;
  confidence: number;
  language: string;
}

export interface SttProviderEvents {
  onRecognizing: (sessionId: string, text: string) => void;
  onRecognized: (sessionId: string, result: SttResult) => void;
  onError: (sessionId: string, message: string) => void;
}

export interface SttStartOptions {
  dualLanguageStrategy?: "parallel" | "fallback-on-low-confidence";
}

export interface SttProvider {
  prewarm?(): Promise<void>;
  start(
    sessionId: string,
    language: string,
    phrases: string[],
    events: SttProviderEvents,
    options?: SttStartOptions,
  ): Promise<void>;
  stop(sessionId: string): Promise<void>;
  writeAudio(sessionId: string, chunk: Buffer): void;
  close(): void;
}
