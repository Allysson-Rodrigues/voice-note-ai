import type { BrowserWindow, IpcMain } from "electron";
import type { AppProfile, AppSettings } from "../settings-store.js";
import type { InjectResult } from "./text-injection.js";
import { createSttProvider } from "./stt/stt-factory.js";
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

export function createAzureSpeechProvider(config: {
  key: string;
  region: string;
}) {
  return createSttProvider("azure", config, async () => {
    const mod = await import("microsoft-cognitiveservices-speech-sdk");
    return mod.default || mod;
  });
}

export function createSessionRecord(args: {
  sessionId: string;
  sender: Electron.WebContents;
  provider: SttProvider;
  targetWindowHandle: string | null;
  appKey: string | null;
}): SttSession {
  return {
    sessionId: args.sessionId,
    sender: args.sender,
    provider: args.provider,
    startedAtMs: Date.now(),
    sttReadyAtMs: null,
    firstPartialAtMs: null,
    finalAtMs: null,
    injectAtMs: null,
    retryCount: 0,
    ending: false,
    targetWindowHandle: args.targetWindowHandle,
    appKey: args.appKey,
    timeoutTimer: null,
    lastAudioChunkAtMs: null,
    audioThrottleDrops: 0,
    timedOut: false,
  };
}

export function writeSessionAudioChunk(
  session: SttSession,
  payload: { sessionId: string; pcm16kMonoInt16: Uint8Array | ArrayBufferLike },
) {
  const pcmBuffer =
    payload.pcm16kMonoInt16 instanceof Uint8Array
      ? Buffer.from(payload.pcm16kMonoInt16)
      : Buffer.from(new Uint8Array(payload.pcm16kMonoInt16));
  session.provider.writeAudio(payload.sessionId, pcmBuffer);
}

export async function finalizeStoppedSession(args: {
  session: SttSession;
  options: SttSessionManagerOptions;
  setHudStateIfCurrent: (sessionId: string, state: HudState) => boolean;
}): Promise<{
  ok: boolean;
  text?: string;
  timedOut?: boolean;
  message?: string;
}> {
  const { session, options, setHudStateIfCurrent } = args;
  await session.provider.stop(session.sessionId);
  session.finalAtMs = Date.now();

  const result = session.lastResult;
  if (!result || !result.text) {
    if (session.timedOut) {
      options.setHudState({
        state: "error",
        message: "Sessão encerrada por tempo máximo.",
      });
      await sleep(HUD_ERROR_VISIBLE_MS);
      setHudStateIfCurrent(session.sessionId, { state: "idle" });
      return {
        ok: false,
        text: "",
        timedOut: true,
        message: "Sessão encerrada por tempo máximo.",
      };
    }
    setHudStateIfCurrent(session.sessionId, { state: "idle" });
    return { ok: true, text: "" };
  }

  const postprocessed = await options.postprocessTranscript({
    rawText: result.text,
    language: result.language as "pt-BR" | "en-US",
    appKey: session.appKey,
    confidence: result.confidence,
  });
  const lowConfidencePolicy =
    options.resolveLowConfidencePolicy?.(result.confidence) ?? "paste";
  const forceCopyOnly =
    lowConfidencePolicy === "copy-only" || lowConfidencePolicy === "review";

  options.broadcast("stt:final", {
    sessionId: session.sessionId,
    text: postprocessed.text,
  });
  options.setHudState({ state: "injecting" });

  const targetWindowHandle = await options.resolveInjectionTargetWindowHandle(
    session.targetWindowHandle,
  );
  const injection = await options.injectText(
    postprocessed.text,
    targetWindowHandle,
    { forceCopyOnly },
  );
  session.injectAtMs = Date.now();

  if (options.onSessionCompleted) {
    await options.onSessionCompleted(
      buildSessionCompletedEntry({
        session,
        result,
        postprocessed,
        injection,
      }),
    );
  }

  options.setHudState({ state: "success" });
  await sleep(HUD_SUCCESS_VISIBLE_MS);
  setHudStateIfCurrent(session.sessionId, { state: "idle" });
  return {
    ok: true,
    text: postprocessed.text,
    timedOut: session.timedOut,
    message: resolveCompletionMessage({
      lowConfidencePolicy,
      timedOut: session.timedOut,
    }),
  };
}
