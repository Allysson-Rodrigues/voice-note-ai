import type { BrowserWindow, IpcMain } from "electron";
import type { AppProfile, AppSettings } from "../settings-store.js";
import type { InjectResult } from "./text-injection.js";
import type { SttProvider, SttResult } from "./stt/types.js";
import type { TranscriptIntent } from "./transcript-intent.js";

export const HUD_SUCCESS_VISIBLE_MS = 1100;
export const HUD_ERROR_VISIBLE_MS = 900;

export type HudVisualState =
  | "idle"
  | "listening"
  | "finalizing"
  | "injecting"
  | "success"
  | "error";

export type HudState = {
  state: HudVisualState;
  message?: string;
};

export type SessionLanguage = "pt-BR" | "en-US" | "dual";

export type SttSession = {
  sessionId: string;
  sender: Electron.WebContents;
  provider: SttProvider;
  startedAtMs: number;
  sttReadyAtMs: number | null;
  firstPartialAtMs: number | null;
  finalAtMs: number | null;
  injectAtMs: number | null;
  retryCount: number;
  ending: boolean;
  targetWindowHandle: string | null;
  appKey: string | null;
  timeoutTimer: NodeJS.Timeout | null;
  lastAudioChunkAtMs: number | null;
  audioThrottleDrops: number;
  timedOut: boolean;
  lastResult?: SttResult;
};

export type PostprocessResult = {
  text: string;
  appliedRules: string[];
  intent: TranscriptIntent;
  rewriteApplied: boolean;
  rewriteRisk: "low" | "medium" | "high";
};

export type SessionCompletedEntry = {
  sessionId: string;
  text: string;
  rawText: string;
  pasted: boolean;
  skippedReason?: InjectResult["skippedReason"];
  pttToFirstPartialMs?: number;
  pttToFinalMs?: number;
  retryCount: number;
  sessionDurationMs: number;
  injectTotalMs: number;
  resolveWindowMs?: number;
  pasteAttemptMs?: number;
  clipboardRestoreMs?: number;
  languageChosen: string;
  confidenceBucket: "high" | "medium" | "low";
  appKey?: string | null;
  intent: TranscriptIntent;
  appliedRules?: string[];
  rewriteApplied: boolean;
  rewriteRisk: "low" | "medium" | "high";
  injectionMethod?: InjectResult["method"];
};

export type SttSessionManager = {
  markPhraseCacheDirty: () => void;
  invalidateRuntimeCaches: () => void;
  prewarmStt: () => Promise<void>;
  primeTargetWindowForSession: (sessionId: string) => Promise<void>;
  startSessionFromHotkey: (
    sender: Electron.WebContents,
    sid: string,
  ) => Promise<{ ok: boolean }>;
  getActiveSessionId: () => string | null;
  hasActiveSession: () => boolean;
  scheduleStop: (sessionId: string) => void;
  cancelPendingStop: () => void;
  registerIpcHandlers: (ipcMain: IpcMain) => void;
  getPhraseBoostCount: () => Promise<number>;
  dispose: () => void;
};

export type SttSessionManagerOptions = {
  isPackagedApp: boolean;
  getSettings: () => AppSettings;
  getAzureCredentials: () => { key: string; region: string };
  getCaptureBlockedReason: () => string | null | undefined;
  broadcast: (channel: string, payload: unknown) => void;
  setHudState: (state: HudState) => void;
  emitAppError: (message: string) => void;
  postprocessTranscript: (args: {
    rawText: string;
    language: "pt-BR" | "en-US";
    appKey?: string | null;
    confidence?: number;
  }) => Promise<PostprocessResult>;
  getMainWindow: () => BrowserWindow | null;
  getForegroundWindowHandle: () => Promise<string | null>;
  getWindowAppKey?: (handle: string | null) => Promise<string | null>;
  resolveInjectionTargetWindowHandle: (
    sessionTargetWindowHandle: string | null,
  ) => Promise<string | null>;
  injectText: (
    text: string,
    targetWindowHandle: string | null,
    request?: { forceCopyOnly?: boolean },
  ) => Promise<InjectResult>;
  getDictionaryPhrases: (seedPhrases: string[]) => Promise<string[]>;
  onSessionCompleted?: (entry: SessionCompletedEntry) => Promise<void> | void;
  getAppProfile?: (appKey: string | null) => AppProfile | undefined;
  resolveLowConfidencePolicy?: (
    confidence?: number,
  ) => "paste" | "copy-only" | "review";
};

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export function getAzureConfigSignature(config: {
  key: string;
  region: string;
}) {
  return `${config.region}::${config.key.slice(0, 12)}`;
}

export function resolveSessionLanguage(
  payloadLanguage: string | undefined,
  settings: AppSettings,
  appProfile: AppProfile | undefined,
): SessionLanguage {
  if (payloadLanguage === "pt-BR" || payloadLanguage === "en-US") {
    return payloadLanguage;
  }

  if (appProfile?.languageBias === "mixed") {
    return "dual";
  }
  if (
    appProfile?.languageBias === "pt-BR" ||
    appProfile?.languageBias === "en-US"
  ) {
    return appProfile.languageBias;
  }

  return settings.languageMode;
}

export function resolveCompletionMessage(args: {
  lowConfidencePolicy: "paste" | "copy-only" | "review";
  timedOut: boolean;
}) {
  if (args.lowConfidencePolicy === "review") {
    return "Texto copiado para revisão antes de colar.";
  }
  if (args.lowConfidencePolicy === "copy-only") {
    return "Texto copiado sem colagem automática devido à baixa confiança.";
  }
  if (args.timedOut) {
    return "Sessão encerrada por tempo máximo.";
  }
  return undefined;
}

export function buildSessionCompletedEntry(args: {
  session: SttSession;
  result: SttResult;
  postprocessed: PostprocessResult;
  injection: InjectResult;
}): SessionCompletedEntry {
  const { session, result, postprocessed, injection } = args;
  return {
    sessionId: session.sessionId,
    text: postprocessed.text,
    rawText: result.text,
    pasted: injection.pasted,
    skippedReason: injection.skippedReason,
    pttToFirstPartialMs:
      session.firstPartialAtMs === null
        ? undefined
        : session.firstPartialAtMs - session.startedAtMs,
    pttToFinalMs:
      session.finalAtMs === null
        ? undefined
        : session.finalAtMs - session.startedAtMs,
    retryCount: session.retryCount,
    sessionDurationMs: Date.now() - session.startedAtMs,
    injectTotalMs:
      (session.injectAtMs ?? Date.now()) - (session.finalAtMs ?? Date.now()),
    resolveWindowMs: injection.metrics?.resolveWindowMs,
    pasteAttemptMs: injection.metrics?.pasteAttemptMs,
    clipboardRestoreMs: injection.metrics?.clipboardRestoreMs,
    languageChosen: result.language,
    confidenceBucket:
      result.confidence >= 0.8
        ? "high"
        : result.confidence >= 0.6
          ? "medium"
          : "low",
    appKey: session.appKey,
    intent: postprocessed.intent,
    appliedRules: postprocessed.appliedRules,
    rewriteApplied: postprocessed.rewriteApplied,
    rewriteRisk: postprocessed.rewriteRisk,
    injectionMethod: injection.method,
  };
}
