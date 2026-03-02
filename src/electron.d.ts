export {};

export type DictionaryTerm = {
  id: string;
  term: string;
  hintPt?: string;
  enabled: boolean;
  createdAt: string;
};

export type HotkeyMode = "hold" | "toggle-primary" | "toggle-fallback" | "unavailable";

export type RuntimeInfo = {
  hotkeyLabel: string;
  hotkeyMode: HotkeyMode;
  holdToTalkActive: boolean;
  holdRequired: boolean;
  captureBlockedReason?: string;
};

export type CanonicalTerm = {
  from: string;
  to: string;
  enabled: boolean;
};

declare global {
  interface Window {
    voiceNoteAI: {
      listDictionary: () => Promise<DictionaryTerm[]>;
      addDictionaryTerm: (payload: { term: string; hintPt?: string }) => Promise<{ ok: boolean; term: DictionaryTerm }>;
      updateDictionaryTerm: (payload: {
        id: string;
        term?: string;
        hintPt?: string;
        enabled?: boolean;
      }) => Promise<{ ok: boolean; term: DictionaryTerm }>;
      removeDictionaryTerm: (id: string) => Promise<{ ok: boolean }>;
      startStt: (payload: { sessionId: string; language?: string }) => Promise<{ ok: boolean }>;
      sendAudio: (sessionId: string, pcm16kMonoInt16: ArrayBuffer) => void;
      stopStt: (sessionId: string) => Promise<{ ok: boolean; text?: string }>;
      getSettings: () => Promise<{
        autoPasteEnabled: boolean;
        toneMode: "formal" | "casual" | "very-casual";
        languageMode: "pt-BR" | "en-US" | "dual";
        extraPhrases: string[];
        canonicalTerms: CanonicalTerm[];
        stopGraceMs: number;
        formatCommandsEnabled: boolean;
        maxSessionSeconds: number;
      }>;
      getRuntimeInfo: () => Promise<RuntimeInfo>;
      updateSettings: (partial: Partial<{
        autoPasteEnabled: boolean;
        toneMode: "formal" | "casual" | "very-casual";
        languageMode: "pt-BR" | "en-US" | "dual";
        extraPhrases: string[];
        canonicalTerms: CanonicalTerm[];
        stopGraceMs: number;
        formatCommandsEnabled: boolean;
        maxSessionSeconds: number;
      }>) => Promise<{ ok: boolean; settings?: unknown }>;
      setAutoPasteEnabled: (enabled: boolean) => Promise<{ ok: boolean }>;
      setToneMode: (mode: "formal" | "casual" | "very-casual") => Promise<{ ok: boolean; toneMode: "formal" | "casual" | "very-casual" }>;
      onHudState: (cb: (event: { state: "idle" | "listening" | "finalizing" | "injecting" | "success" | "error"; message?: string }) => void) => () => void;
      onHudLevel: (cb: (event: { sessionId: string; level: number }) => void) => () => void;
      onCaptureStart: (cb: (payload: { sessionId: string; sttWarmStart?: boolean }) => void) => () => void;
      onCaptureStop: (cb: (payload: { sessionId: string }) => void) => () => void;
      onSttPartial: (cb: (event: { sessionId: string; text: string }) => void) => () => void;
      onSttFinal: (cb: (event: { sessionId: string; text: string }) => void) => () => void;
      onSttError: (cb: (event: { sessionId: string; message: string }) => void) => () => void;
      onAppError: (cb: (event: { message: string }) => void) => () => void;
    };
  }
}
