export {};

export type DictionaryTerm = {
  id: string;
  term: string;
  hintPt?: string;
  enabled: boolean;
  createdAt: string;
};

export type HotkeyMode = 'hold' | 'toggle-primary' | 'toggle-fallback' | 'unavailable';

export type RuntimeInfo = {
  hotkeyLabel: string;
  hotkeyMode: HotkeyMode;
  holdToTalkActive: boolean;
  holdRequired: boolean;
  captureBlockedReason?: string;
};

export type HealthStatus = 'ok' | 'warn' | 'error';
export type AzureCredentialSource = 'secure-store' | 'environment' | 'missing';
export type AzureCredentialStatus = {
  source: AzureCredentialSource;
  storageMode: 'encrypted' | 'plain' | 'none';
  hasStoredCredentials: boolean;
  encryptionAvailable: boolean;
  canPersistSecurely: boolean;
  region?: string;
  updatedAt?: string;
};
export type AzureConnectionResult = {
  status: 'ok' | 'auth-error' | 'network-error' | 'config-error';
  message: string;
  host: string | null;
};
export type HealthCheckItem = {
  id: 'stt' | 'network' | 'hook' | 'history' | 'phrases' | 'injection' | 'security' | 'microphone';
  status: HealthStatus;
  message: string;
};
export type HealthCheckReport = {
  generatedAt: string;
  items: HealthCheckItem[];
};

export type CanonicalTerm = {
  from: string;
  to: string;
  enabled: boolean;
  scope?: 'global' | 'app' | 'language';
  appKeys?: string[];
  confidencePolicy?: 'always' | 'safe-only';
};

export type AppProfile = {
  injectionMethod?: 'target-handle' | 'foreground-handle' | 'ctrl-v' | 'shift-insert';
  languageBias?: 'pt-BR' | 'en-US' | 'mixed';
  postprocessProfile?: 'safe' | 'balanced' | 'aggressive';
  domain?: 'general' | 'work' | 'support' | 'medical' | 'legal' | 'custom';
  extraPhrases?: string[];
  formatStyle?: 'message' | 'paragraph' | 'bullet-list' | 'email' | 'notes' | 'technical-note';
  rewriteEnabled?: boolean;
  protectedTerms?: string[];
};

export type AdaptiveSuggestion =
  | {
      id: string;
      type: 'protected-term';
      appKey: string;
      confidence: number;
      reason: string;
      payload: { term: string };
    }
  | {
      id: string;
      type: 'format-style';
      appKey: string;
      confidence: number;
      reason: string;
      payload: {
        formatStyle: 'message' | 'paragraph' | 'bullet-list' | 'email' | 'notes' | 'technical-note';
      };
    }
  | {
      id: string;
      type: 'language-bias';
      appKey: string;
      confidence: number;
      reason: string;
      payload: { languageBias: 'pt-BR' | 'en-US' };
    };

export type HistoryStorageMode = 'plain' | 'encrypted';

export type HistorySkipReason = 'WINDOW_CHANGED' | 'PASTE_FAILED' | 'TIMEOUT';

export type HistoryEntry = {
  id: string;
  sessionId: string;
  text: string;
  rawText?: string;
  pasted: boolean;
  skippedReason?: HistorySkipReason;
  retryCount: number;
  sessionDurationMs: number;
  injectTotalMs: number;
  resolveWindowMs?: number;
  pasteAttemptMs?: number;
  clipboardRestoreMs?: number;
  languageChosen?: string;
  appliedRules?: string[];
  confidenceSummary?: {
    best?: number;
    mode?: string;
  };
  intent?: string;
  rewriteApplied?: boolean;
  rewriteRisk?: 'low' | 'medium' | 'high';
  appKey?: string;
  injectionMethod?: string;
  confidenceBucket?: 'high' | 'medium' | 'low';
  createdAt: string;
};

export type PerfSummary = {
  sampleCount: number;
  averages: {
    pttToFirstPartialMs: number;
    pttToFinalMs: number;
    injectTotalMs: number;
    sessionDurationMs: number;
  };
  skipCounts: Record<'WINDOW_CHANGED' | 'PASTE_FAILED' | 'TIMEOUT', number>;
};

declare global {
  interface Window {
    voiceNoteAI: {
      windowMinimize: () => void;
      windowMaximize: () => void;
      windowClose: () => void;
      isWindowMaximized: () => Promise<boolean>;
      onMaximizedChange: (cb: (isMaximized: boolean) => void) => () => void;
      listDictionary: () => Promise<DictionaryTerm[]>;
      exportDictionary: () => Promise<{ exportedAt: string; terms: DictionaryTerm[] }>;
      importDictionary: (payload: {
        terms: DictionaryTerm[];
        mode?: 'replace' | 'merge';
      }) => Promise<{ ok: boolean; count: number }>;
      addDictionaryTerm: (payload: {
        term: string;
        hintPt?: string;
      }) => Promise<{ ok: boolean; term: DictionaryTerm }>;
      updateDictionaryTerm: (payload: {
        id: string;
        term?: string;
        hintPt?: string;
        enabled?: boolean;
      }) => Promise<{ ok: boolean; term: DictionaryTerm }>;
      removeDictionaryTerm: (id: string) => Promise<{ ok: boolean }>;
      listHistory: (params?: {
        query?: string;
        limit?: number;
        offset?: number;
      }) => Promise<HistoryEntry[]>;
      removeHistoryEntry: (id: string) => Promise<{ ok: boolean }>;
      clearHistory: (params?: { before?: string }) => Promise<{ ok: boolean; removed: number }>;
      startStt: (payload: { sessionId: string; language?: string }) => Promise<{ ok: boolean }>;
      sendAudio: (sessionId: string, pcm16kMonoInt16: ArrayBuffer) => void;
      stopStt: (
        sessionId: string,
      ) => Promise<{ ok: boolean; text?: string; timedOut?: boolean; message?: string }>;
      getSettings: () => Promise<{
        hotkeyPrimary: string;
        hotkeyFallback: string;
        autoPasteEnabled: boolean;
        toneMode: 'formal' | 'casual' | 'very-casual';
        languageMode: 'pt-BR' | 'en-US' | 'dual';
        sttProvider: 'azure';
        extraPhrases: string[];
        canonicalTerms: CanonicalTerm[];
        stopGraceMs: number;
        formatCommandsEnabled: boolean;
        maxSessionSeconds: number;
        historyEnabled: boolean;
        historyRetentionDays: number;
        privacyMode: boolean;
        historyStorageMode: HistoryStorageMode;
        postprocessProfile: 'safe' | 'balanced' | 'aggressive';
        dualLanguageStrategy: 'parallel' | 'fallback-on-low-confidence';
        rewriteEnabled: boolean;
        rewriteMode: 'off' | 'safe' | 'aggressive';
        intentDetectionEnabled: boolean;
        protectedTerms: string[];
        lowConfidencePolicy: 'paste' | 'copy-only' | 'review';
        adaptiveLearningEnabled: boolean;
        appProfiles: Record<string, AppProfile>;
      }>;
      getRuntimeInfo: () => Promise<RuntimeInfo>;
      getAzureCredentialStatus: () => Promise<AzureCredentialStatus>;
      testAzureCredentials: (payload: {
        key: string;
        region: string;
      }) => Promise<AzureConnectionResult>;
      saveAzureCredentials: (payload: {
        key: string;
        region: string;
      }) => Promise<AzureCredentialStatus>;
      clearAzureCredentials: () => Promise<AzureCredentialStatus>;
      getHealthCheck: (payload?: {
        includeExternal?: boolean;
        microphone?: {
          status: HealthStatus;
          message: string;
        };
      }) => Promise<HealthCheckReport>;
      getPerfSummary: () => Promise<PerfSummary>;
      listAdaptiveSuggestions: () => Promise<AdaptiveSuggestion[]>;
      applyAdaptiveSuggestion: (id: string) => Promise<{ ok: boolean }>;
      dismissAdaptiveSuggestion: (id: string) => Promise<{ ok: boolean }>;
      getRecentLogs: (params?: { limit?: number }) => Promise<
        Array<{
          level: 'info' | 'warn' | 'error' | 'perf';
          message: string;
          timestamp: string;
          context?: Record<string, unknown>;
        }>
      >;
      retryHoldHook: () => Promise<{ ok: boolean; message: string }>;
      updateSettings: (
        partial: Partial<{
          hotkeyPrimary: string;
          hotkeyFallback: string;
          autoPasteEnabled: boolean;
          toneMode: 'formal' | 'casual' | 'very-casual';
          languageMode: 'pt-BR' | 'en-US' | 'dual';
          sttProvider: 'azure';
          extraPhrases: string[];
          canonicalTerms: CanonicalTerm[];
          stopGraceMs: number;
          formatCommandsEnabled: boolean;
          maxSessionSeconds: number;
          historyEnabled: boolean;
          historyRetentionDays: number;
          privacyMode: boolean;
          historyStorageMode: HistoryStorageMode;
          postprocessProfile: 'safe' | 'balanced' | 'aggressive';
          dualLanguageStrategy: 'parallel' | 'fallback-on-low-confidence';
          rewriteEnabled: boolean;
          rewriteMode: 'off' | 'safe' | 'aggressive';
          intentDetectionEnabled: boolean;
          protectedTerms: string[];
          lowConfidencePolicy: 'paste' | 'copy-only' | 'review';
          adaptiveLearningEnabled: boolean;
          appProfiles: Record<string, AppProfile>;
        }>,
      ) => Promise<{ ok: boolean; settings?: unknown }>;
      setAutoPasteEnabled: (enabled: boolean) => Promise<{ ok: boolean }>;
      setToneMode: (
        mode: 'formal' | 'casual' | 'very-casual',
      ) => Promise<{ ok: boolean; toneMode: 'formal' | 'casual' | 'very-casual' }>;
      onHudState: (
        cb: (event: {
          state: 'idle' | 'listening' | 'finalizing' | 'injecting' | 'success' | 'error';
          message?: string;
        }) => void,
      ) => () => void;
      onHudLevel: (cb: (event: { sessionId: string; level: number }) => void) => () => void;
      onHudHover: (cb: (event: { hovered: boolean }) => void) => () => void;
      onCaptureStart: (
        cb: (payload: { sessionId: string; sttWarmStart?: boolean }) => void,
      ) => () => void;
      onCaptureStop: (cb: (payload: { sessionId: string }) => void) => () => void;
      onSttPartial: (cb: (event: { sessionId: string; text: string }) => void) => () => void;
      onSttFinal: (cb: (event: { sessionId: string; text: string }) => void) => () => void;
      onSttError: (cb: (event: { sessionId: string; message: string }) => void) => () => void;
      onAppError: (cb: (event: { message: string }) => void) => () => void;
    };
  }
}
