import dotenv from "dotenv";
import {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  Menu,
  safeStorage,
  screen,
  session,
  Tray,
} from "electron";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AdaptiveStore } from "./adaptive-store.js";
import { AzureCredentialsStore } from "./azure-credentials-store.js";
import { DictionaryStore } from "./dictionary-store.js";
import { HistoryStore } from "./history-store.js";
import type { PasteAttempt } from "./injection-plan.js";
import {
  validateAutoPastePayload,
  validateAdaptiveSuggestionPayload,
  validateAzureCredentialsPayload,
  validateDictionaryAddPayload,
  validateDictionaryImportPayload,
  validateDictionaryUpdatePayload,
  validateHealthCheckPayload,
  validateHistoryClearPayload,
  validateHistoryListPayload,
  validateIdPayload,
  validateSettingsUpdate,
  validateTonePayload,
} from "./ipc-validation.js";
import { getRecentLogs, logError, logInfo } from "./logger.js";
import {
  getAzureConfigError,
  getAzureConfigMissingMessage,
  getHealthCheckReport,
  testAzureSpeechConnection,
} from "./modules/health-check.js";
import { generateAdaptiveSuggestions } from "./modules/adaptive-learning.js";
import { createHotkeyService } from "./modules/hotkey.js";
import { createHudWindowController } from "./modules/hud-window.js";
import {
  applyMainWindowBounds,
  createMainWindow,
} from "./modules/main-window.js";
import { createSttSessionManager } from "./modules/stt-session.js";
import { classifyTranscriptIntent } from "./modules/transcript-intent.js";
import { rewriteTranscript } from "./modules/transcript-rewrite.js";
import { createTextInjectionService } from "./modules/text-injection.js";
import { installSessionSecurity } from "./modules/window-security.js";
import { PerfStore } from "./perf-store.js";
import {
  canPersistAdaptiveLearning,
  canUseHistoryPhraseBoost,
} from "./privacy-rules.js";
import {
  DEFAULT_CANONICAL_TERMS,
  SettingsStore,
  type AppSettings,
  type InjectionMethod,
  type LowConfidencePolicy,
} from "./settings-store.js";
import { hotkeyLabelFromAccelerator } from "./hotkey-config.js";
import { inspectTranscriptPostprocess } from "./transcript-postprocess.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadRuntimeEnv() {
  if (app.isPackaged) return;
  const candidates = [
    path.join(app.getAppPath(), ".env.local"),
    path.join(app.getAppPath(), ".env"),
    path.join(process.cwd(), ".env.local"),
    path.join(process.cwd(), ".env"),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    dotenv.config({ path: candidate });
  }
}

loadRuntimeEnv();

const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
const IS_DEV = Boolean(DEV_SERVER_URL);
const APP_ID = "com.antigravity.vox-type";
const APP_NAME = "Vox Type";
const HOLD_TO_TALK_ENABLED = (process.env.VOICE_HOLD_TO_TALK ?? "1") !== "0";
const HUD_ENABLED = (process.env.VOICE_HUD ?? "1") !== "0";
const HUD_DEBUG = (process.env.VOICE_HUD_DEBUG ?? "0") !== "0";
const HOLD_HOOK_RECOVERY_RETRY_MS = 10000;

type HotkeyMode = "hold" | "toggle-primary" | "toggle-fallback" | "unavailable";
type HudVisualState =
  | "idle"
  | "listening"
  | "finalizing"
  | "injecting"
  | "success"
  | "error";

type RuntimeInfo = {
  hotkeyLabel: string;
  hotkeyMode: HotkeyMode;
  holdToTalkActive: boolean;
  holdRequired: boolean;
  captureBlockedReason?: string;
};

type HudState = {
  state: HudVisualState;
  message?: string;
};

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let settingsStore: SettingsStore | null = null;
let dictionaryStore: DictionaryStore | null = null;
let historyStore: HistoryStore | null = null;
let perfStore: PerfStore | null = null;
let adaptiveStore: AdaptiveStore | null = null;
let azureCredentialsStore: AzureCredentialsStore | null = null;
let isQuitting = false;
let displayListenersAttached = false;
let runtimeSecurity = {
  cspEnabled: false,
  permissionsPolicy: "default-deny" as const,
  trustedOrigins: ["file://"],
};

function parseBooleanEnv(value: string | undefined) {
  if (value == null) return undefined;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return undefined;
}

function resolveDefaultHistoryStorageMode() {
  const explicit = process.env.VOICE_HISTORY_STORAGE_MODE?.trim().toLowerCase();
  if (explicit === "encrypted") return "encrypted" as const;
  if (explicit === "plain") return "plain" as const;
  return safeStorage.isEncryptionAvailable()
    ? ("encrypted" as const)
    : ("plain" as const);
}

let settings: AppSettings = {
  hotkeyPrimary: process.env.VOICE_HOTKEY ?? "CommandOrControl+Super",
  hotkeyFallback:
    process.env.VOICE_HOTKEY_FALLBACK ?? "CommandOrControl+Super+Space",
  autoPasteEnabled: parseBooleanEnv(process.env.VOICE_AUTO_PASTE) ?? true,
  toneMode:
    (process.env.VOICE_TONE ?? "casual") === "formal"
      ? "formal"
      : (process.env.VOICE_TONE ?? "casual") === "very-casual"
        ? "very-casual"
        : "casual",
  languageMode:
    (process.env.AZURE_SPEECH_LANGUAGE ?? "pt-BR") === "en-US"
      ? "en-US"
      : "pt-BR",
  sttProvider: "azure",
  extraPhrases: [],
  canonicalTerms: [...DEFAULT_CANONICAL_TERMS],
  stopGraceMs: Number(process.env.VOICE_STOP_GRACE_MS ?? "200") || 200,
  formatCommandsEnabled: true,
  maxSessionSeconds:
    Number(process.env.VOICE_MAX_SESSION_SECONDS ?? "90") || 90,
  historyEnabled: parseBooleanEnv(process.env.VOICE_HISTORY_ENABLED) ?? true,
  historyRetentionDays:
    Number(process.env.VOICE_HISTORY_RETENTION_DAYS ?? "30") || 30,
  injectionProfiles: {},
  privacyMode: parseBooleanEnv(process.env.VOICE_PRIVACY_MODE) ?? false,
  historyStorageMode: resolveDefaultHistoryStorageMode(),
  postprocessProfile:
    (process.env.VOICE_POSTPROCESS_PROFILE ?? "balanced") === "safe"
      ? "safe"
      : (process.env.VOICE_POSTPROCESS_PROFILE ?? "balanced") === "aggressive"
        ? "aggressive"
        : "balanced",
  dualLanguageStrategy:
    (process.env.VOICE_DUAL_LANGUAGE_STRATEGY ??
      "fallback-on-low-confidence") === "parallel"
      ? "parallel"
      : "fallback-on-low-confidence",
  rewriteEnabled: parseBooleanEnv(process.env.VOICE_REWRITE_ENABLED) ?? true,
  rewriteMode:
    (process.env.VOICE_REWRITE_MODE ?? "safe") === "off"
      ? "off"
      : (process.env.VOICE_REWRITE_MODE ?? "safe") === "aggressive"
        ? "aggressive"
        : "safe",
  intentDetectionEnabled:
    parseBooleanEnv(process.env.VOICE_INTENT_DETECTION_ENABLED) ?? true,
  protectedTerms: [],
  lowConfidencePolicy:
    (process.env.VOICE_LOW_CONFIDENCE_POLICY ?? "paste") === "paste"
      ? "paste"
      : (process.env.VOICE_LOW_CONFIDENCE_POLICY ?? "paste") === "copy-only"
        ? "copy-only"
        : "paste",
  adaptiveLearningEnabled:
    parseBooleanEnv(process.env.VOICE_ADAPTIVE_LEARNING_ENABLED) ?? true,
  appProfiles: {},
};

let runtimeInfo: RuntimeInfo = {
  hotkeyLabel: hotkeyLabelFromAccelerator(settings.hotkeyPrimary),
  hotkeyMode: "unavailable",
  holdToTalkActive: false,
  holdRequired: process.platform === "win32",
};

function getDictionaryStore() {
  if (!dictionaryStore) {
    dictionaryStore = new DictionaryStore(
      path.join(app.getPath("userData"), "dictionary.json"),
    );
  }
  return dictionaryStore;
}

function getHistoryStore() {
  if (!historyStore) {
    historyStore = new HistoryStore(
      path.join(app.getPath("userData"), "history.json"),
      {
        isEncryptionAvailable: () =>
          settings.historyStorageMode === "encrypted" &&
          safeStorage.isEncryptionAvailable(),
        encryptString: (value) =>
          safeStorage.encryptString(value).toString("base64"),
        decryptString: (value) =>
          safeStorage.decryptString(Buffer.from(value, "base64")),
      },
    );
  }
  return historyStore;
}

function getPerfStore() {
  if (!perfStore) {
    perfStore = new PerfStore(path.join(app.getPath("userData"), "perf.json"));
  }
  return perfStore;
}

function getAdaptiveStore() {
  if (!adaptiveStore) {
    adaptiveStore = new AdaptiveStore(
      path.join(app.getPath("userData"), "adaptive.json"),
      {
        isEncryptionAvailable: () =>
          settings.historyStorageMode === "encrypted" &&
          safeStorage.isEncryptionAvailable(),
        encryptString: (value) =>
          safeStorage.encryptString(value).toString("base64"),
        decryptString: (value) =>
          safeStorage.decryptString(Buffer.from(value, "base64")),
      },
    );
  }
  return adaptiveStore;
}

function getAzureCredentialsStore() {
  if (!azureCredentialsStore) {
    azureCredentialsStore = new AzureCredentialsStore(
      path.join(app.getPath("userData"), "azure-credentials.json"),
      {
        isEncryptionAvailable: () => safeStorage.isEncryptionAvailable(),
        encryptString: (value) =>
          safeStorage.encryptString(value).toString("base64"),
        decryptString: (value) =>
          safeStorage.decryptString(Buffer.from(value, "base64")),
      },
    );
  }
  return azureCredentialsStore;
}

function getResolvedAzureCredentials() {
  return getAzureCredentialsStore().resolve();
}

function getAzureCredentialStatus() {
  return getAzureCredentialsStore().getStatus();
}

function tokenizePhraseCandidates(text: string) {
  return text
    .split(/[^A-Za-zÀ-ÿ0-9+#.-]+/g)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length >= 3 && entry.length <= 32)
    .filter((entry) => /[A-Za-zÀ-ÿ]/.test(entry));
}

async function getRecentHistoryPhrases(limit = 40) {
  if (!canUseHistoryPhraseBoost(settings)) return [];
  try {
    const entries = await getHistoryStore().list({ limit });
    const counts = new Map<string, number>();
    for (const entry of entries) {
      for (const token of tokenizePhraseCandidates(entry.text)) {
        const key = token.toLocaleLowerCase();
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }

    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 60)
      .map(([token]) => token);
  } catch {
    return [];
  }
}

const hudController = createHudWindowController({
  enabled: HUD_ENABLED,
  debug: HUD_DEBUG,
  devServerUrl: DEV_SERVER_URL,
  getIconPath,
  getHudPreloadPath,
  resolveDistFile: (filename) => path.join(__dirname, "..", "dist", filename),
  getPreferredDisplay,
  onHoverChange: (hovered) => {
    broadcast("hud:hover", { hovered });
  },
});

function broadcast(channel: string, payload: unknown) {
  if (mainWindow && !mainWindow.isDestroyed())
    mainWindow.webContents.send(channel, payload);
  const hudWindow = hudController.getHudWindow();
  if (hudWindow && !hudWindow.isDestroyed())
    hudWindow.webContents.send(channel, payload);
}

function setHudState(state: HudState) {
  broadcast("hud:state", state);
}

function emitAppError(message: string) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("app:error", { message });
  }
  if (tray) {
    tray.setToolTip(`${APP_NAME} - ${message}`);
  }
}

function updateRuntimeInfo(next: RuntimeInfo) {
  runtimeInfo = next;
}

function setCaptureBlockedReason(reason?: string) {
  updateRuntimeInfo({
    ...runtimeInfo,
    captureBlockedReason: reason,
  });
}

function setRuntimeBlocked(reason?: string) {
  updateRuntimeInfo({
    ...runtimeInfo,
    hotkeyMode: "unavailable",
    holdToTalkActive: false,
    holdRequired: process.platform === "win32",
    captureBlockedReason: reason,
  });
}

function resolveCaptureBlockedReason() {
  const existing = runtimeInfo.captureBlockedReason;
  if (existing && existing !== getAzureConfigMissingMessage()) {
    return existing;
  }

  return getAzureConfigError({
    credentials: getResolvedAzureCredentials(),
  });
}

function refreshCaptureBlockedReason() {
  const next = resolveCaptureBlockedReason() ?? undefined;
  if (runtimeInfo.captureBlockedReason !== next) {
    setCaptureBlockedReason(next);
  }
  return next;
}

function getPreferredDisplay() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    return screen.getDisplayMatching(mainWindow.getBounds());
  }
  return screen.getPrimaryDisplay();
}

function getIconPath() {
  const candidates = app.isPackaged
    ? [
        path.join(app.getAppPath(), "public", "favicon.ico"),
        path.join(__dirname, "..", "public", "favicon.ico"),
      ]
    : [
        path.join(process.cwd(), "public", "favicon.ico"),
        path.join(app.getAppPath(), "public", "favicon.ico"),
        path.join(__dirname, "..", "public", "favicon.ico"),
      ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

function getPreloadPath() {
  if (!app.isPackaged) {
    const local = path.join(process.cwd(), "electron", "preload.cjs");
    if (existsSync(local)) return local;
  }
  return path.join(__dirname, "..", "electron", "preload.cjs");
}

function getHudPreloadPath() {
  if (!app.isPackaged) {
    const local = path.join(process.cwd(), "electron", "hud-preload.cjs");
    if (existsSync(local)) return local;
  }
  return path.join(__dirname, "..", "electron", "hud-preload.cjs");
}

function applyAdaptiveBounds() {
  const display = getPreferredDisplay();
  if (mainWindow && !mainWindow.isDestroyed()) {
    applyMainWindowBounds(mainWindow, display.workArea);
  }
  hudController.applyHudBounds(display);
}

function attachDisplayListeners() {
  if (displayListenersAttached) return;
  screen.on("display-metrics-changed", applyAdaptiveBounds);
  screen.on("display-added", applyAdaptiveBounds);
  screen.on("display-removed", applyAdaptiveBounds);
  displayListenersAttached = true;
}

function detachDisplayListeners() {
  if (!displayListenersAttached) return;
  screen.removeListener("display-metrics-changed", applyAdaptiveBounds);
  screen.removeListener("display-added", applyAdaptiveBounds);
  screen.removeListener("display-removed", applyAdaptiveBounds);
  displayListenersAttached = false;
}

function getPreferredInjectionMethod(
  appKey: string | null,
): PasteAttempt | null {
  if (!appKey) return null;
  const key = appKey.toLowerCase();
  const profileMethod = settings.appProfiles?.[key]?.injectionMethod;
  if (profileMethod) return profileMethod;
  const method = settings.injectionProfiles?.[key];
  if (!method) return null;
  return method as PasteAttempt;
}

async function rememberInjectionMethod(
  appKey: string | null,
  method: PasteAttempt,
) {
  if (!settingsStore || !appKey) return;
  const key = appKey.toLowerCase();
  const current = settings.injectionProfiles?.[key];
  if (current === method) return;

  const nextProfiles = {
    ...(settings.injectionProfiles ?? {}),
    [key]: method as InjectionMethod,
  };
  settings = await settingsStore.update({ injectionProfiles: nextProfiles });
}

const textInjectionService = createTextInjectionService({
  canAutoPaste: () => settings.autoPasteEnabled && process.platform === "win32",
  getMainWindow: () => mainWindow,
  getHudWindow: () => hudController.getHudWindow(),
  getPreferredInjectionMethod,
  rememberInjectionMethod,
});

const LOW_CONFIDENCE_BUCKET_THRESHOLD = 0.6;

function resolveConfidenceBucket(confidence?: number) {
  if (
    typeof confidence !== "number" ||
    !Number.isFinite(confidence) ||
    confidence < 0
  )
    return "low";
  if (confidence >= 0.82) return "high";
  if (confidence >= LOW_CONFIDENCE_BUCKET_THRESHOLD) return "medium";
  return "low";
}

function resolveLowConfidencePolicy(confidence?: number): LowConfidencePolicy {
  const bucket = resolveConfidenceBucket(confidence);
  if (bucket === "high") return "paste";
  if (bucket === "medium" && settings.lowConfidencePolicy === "review")
    return "review";
  return settings.lowConfidencePolicy;
}

async function postprocessTranscript(args: {
  rawText: string;
  language: "pt-BR" | "en-US";
  appKey?: string | null;
  confidence?: number;
}) {
  const appProfile = settings.appProfiles?.[args.appKey ?? ""];
  const safetySensitiveDomain =
    appProfile?.domain === "medical" || appProfile?.domain === "legal";
  const effectivePostprocessProfile =
    appProfile?.postprocessProfile ??
    (safetySensitiveDomain ? "safe" : settings.postprocessProfile);
  const effectiveRewriteMode =
    safetySensitiveDomain && settings.rewriteMode === "aggressive"
      ? "safe"
      : settings.rewriteMode;
  const intent = settings.intentDetectionEnabled
    ? classifyTranscriptIntent(args.rawText, {
        appKey: args.appKey,
        formatStyle: appProfile?.formatStyle,
      })
    : "free-text";

  const protectedTerms = [
    ...settings.protectedTerms,
    ...(appProfile?.protectedTerms ?? []),
  ];
  const base = inspectTranscriptPostprocess(args.rawText, {
    toneMode: settings.toneMode,
    canonicalTerms: settings.canonicalTerms,
    formatCommandsEnabled: settings.formatCommandsEnabled,
    profile: effectivePostprocessProfile,
    appKey: args.appKey,
    intent,
    language: args.language,
    protectedTerms,
  });

  const shouldRewrite =
    settings.rewriteEnabled &&
    effectiveRewriteMode !== "off" &&
    appProfile?.rewriteEnabled !== false &&
    (args.confidence ?? 0) >= LOW_CONFIDENCE_BUCKET_THRESHOLD &&
    base.finalText.length >= 18 &&
    intent !== "technical-note";

  if (!shouldRewrite) {
    return {
      text: base.finalText,
      appliedRules: base.appliedRules,
      intent,
      rewriteApplied: false,
      rewriteRisk: "low" as const,
    };
  }

  const rewritten = rewriteTranscript({
    rawText: base.finalText,
    intent,
    language: args.language,
    appKey: args.appKey,
    protectedTerms,
    toneMode: settings.toneMode,
  });

  const allowRewrite =
    rewritten.changed &&
    (effectiveRewriteMode === "aggressive" ||
      rewritten.risk === "low" ||
      rewritten.risk === "medium");

  return {
    text: allowRewrite ? rewritten.text : base.finalText,
    appliedRules: allowRewrite
      ? [
          ...base.appliedRules,
          ...(rewritten.notes ?? []),
          `rewrite:${rewritten.risk}`,
        ]
      : base.appliedRules,
    intent,
    rewriteApplied: allowRewrite,
    rewriteRisk: rewritten.risk,
  };
}

const sttManager = createSttSessionManager({
  isPackagedApp: app.isPackaged,
  getSettings: () => settings,
  getAzureCredentials: () => getResolvedAzureCredentials(),
  getCaptureBlockedReason: () => refreshCaptureBlockedReason(),
  broadcast,
  setHudState,
  emitAppError,
  postprocessTranscript,
  getMainWindow: () => mainWindow,
  getForegroundWindowHandle: textInjectionService.getForegroundWindowHandle,
  getWindowAppKey: textInjectionService.getWindowAppKey,
  resolveInjectionTargetWindowHandle:
    textInjectionService.resolveInjectionTargetWindowHandle,
  injectText: textInjectionService.injectText,
  getDictionaryPhrases: async (seedPhrases) => {
    const historyPhrases = await getRecentHistoryPhrases();
    return await getDictionaryStore().activePhrases([
      ...seedPhrases,
      ...historyPhrases,
    ]);
  },
  onSessionCompleted: async (entry) => {
    await getPerfStore().append({
      sessionId: entry.sessionId,
      createdAt: new Date().toISOString(),
      pttToFirstPartialMs: entry.pttToFirstPartialMs ?? -1,
      pttToFinalMs: entry.pttToFinalMs ?? -1,
      injectTotalMs: entry.injectTotalMs,
      resolveWindowMs: entry.resolveWindowMs,
      pasteAttemptMs: entry.pasteAttemptMs,
      clipboardRestoreMs: entry.clipboardRestoreMs,
      retryCount: entry.retryCount,
      sessionDurationMs: entry.sessionDurationMs,
      skippedReason: entry.skippedReason,
    });
    if (!settings.historyEnabled || settings.privacyMode) return;
    await getHistoryStore().append(
      {
        ...entry,
        appKey: entry.appKey ?? undefined,
        injectionMethod: entry.injectionMethod ?? undefined,
      },
      settings.historyRetentionDays,
    );
    if (canPersistAdaptiveLearning(settings)) {
      await getAdaptiveStore().observeSession({
        appKey: entry.appKey ?? undefined,
        text: entry.text,
        intent: entry.intent,
        languageChosen: entry.languageChosen,
        confidenceBucket: entry.confidenceBucket,
      });
    }
  },
  getAppProfile: (appKey) => settings.appProfiles?.[appKey ?? ""],
  resolveLowConfidencePolicy,
});

const hotkeyService = createHotkeyService({
  getPrimaryHotkey: () => settings.hotkeyPrimary,
  getFallbackHotkey: () => settings.hotkeyFallback,
  holdToTalkEnabled: HOLD_TO_TALK_ENABLED,
  holdHookRecoveryRetryMs: HOLD_HOOK_RECOVERY_RETRY_MS,
  getRuntimeInfo: () => runtimeInfo,
  updateRuntimeInfo,
  setRuntimeBlocked,
  refreshCaptureBlockedReason,
  setHudState,
  emitAppError,
  sendCaptureStart: (payload) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send("capture:start", payload);
  },
  sendCaptureStop: (payload) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send("capture:stop", payload);
  },
  sendSttError: (payload) => {
    broadcast("stt:error", payload);
  },
  hasActiveSession: () => sttManager.hasActiveSession(),
  getActiveSessionId: () => sttManager.getActiveSessionId(),
  onStartSession: async (sessionId) => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      throw new Error("Main window is not available.");
    }
    await sttManager.startSessionFromHotkey(mainWindow.webContents, sessionId);
  },
  onPrimeTargetWindow: async (sessionId) => {
    await sttManager.primeTargetWindowForSession(sessionId);
  },
  onReleaseActiveSession: (sessionId) => {
    sttManager.scheduleStop(sessionId);
  },
  isQuitting: () => isQuitting,
});

ipcMain.handle("settings:get", async () => {
  return {
    ...settings,
  };
});

ipcMain.handle("app:runtime-info", async () => {
  refreshCaptureBlockedReason();
  return runtimeInfo;
});

ipcMain.handle("app:azure-credentials-status", async () => {
  return getAzureCredentialStatus();
});

ipcMain.handle(
  "app:azure-credentials:test",
  async (_event, payload: unknown) => {
    const credentials = validateAzureCredentialsPayload(payload);
    return await testAzureSpeechConnection(credentials);
  },
);

ipcMain.handle(
  "app:azure-credentials:save",
  async (_event, payload: unknown) => {
    const credentials = validateAzureCredentialsPayload(payload);
    const status = await getAzureCredentialsStore().save(credentials);
    sttManager.invalidateRuntimeCaches();
    refreshCaptureBlockedReason();
    void sttManager.prewarmStt();
    return status;
  },
);

ipcMain.handle("app:azure-credentials:clear", async () => {
  const status = await getAzureCredentialsStore().clear();
  sttManager.invalidateRuntimeCaches();
  refreshCaptureBlockedReason();
  return status;
});

ipcMain.handle("app:health-check", async (_event, payload?: unknown) => {
  refreshCaptureBlockedReason();
  const healthPayload = validateHealthCheckPayload(payload);
  const azureCredentialStatus = getAzureCredentialStatus();
  const azureCredentials = getResolvedAzureCredentials();
  return await getHealthCheckReport({
    holdToTalkEnabled: HOLD_TO_TALK_ENABLED,
    holdHookActive: Boolean(hotkeyService.getStopHoldHook()),
    perfSummary: await getPerfStore().getSummary(),
    recentInjection: textInjectionService.getRecentInjectionStats(),
    historyEnabled: settings.historyEnabled,
    privacyMode: settings.privacyMode,
    historyStorageMode: settings.historyStorageMode,
    isEncryptionAvailable: safeStorage.isEncryptionAvailable(),
    phraseBoostCount: await sttManager.getPhraseBoostCount(),
    runtimeSecurity,
    azureCredentialSource: azureCredentialStatus.source,
    azureCredentialStorageMode: azureCredentialStatus.storageMode,
    azureCredentials,
    includeExternalAzureCheck: healthPayload.includeExternal === true,
    testAzureConnection:
      healthPayload.includeExternal === true
        ? () =>
            testAzureSpeechConnection({
              key: azureCredentials.key,
              region: azureCredentials.region,
            })
        : null,
    microphone: healthPayload.microphone,
  });
});

ipcMain.handle("app:retry-hold-hook", async () => {
  return await hotkeyService.retryHoldHook();
});

ipcMain.handle("app:perf-summary", async () => {
  return await getPerfStore().getSummary();
});

ipcMain.handle(
  "app:logs:recent",
  async (_event, payload?: { limit?: number }) => {
    return getRecentLogs(payload?.limit ?? 50);
  },
);

ipcMain.handle("adaptive:list", async () => {
  if (!settings.adaptiveLearningEnabled) return [];
  return generateAdaptiveSuggestions(getAdaptiveStore().get(), settings);
});

ipcMain.handle("adaptive:apply", async (_event, payload: unknown) => {
  if (!settingsStore) return { ok: false };
  const { id } = validateAdaptiveSuggestionPayload(payload);
  const suggestion = generateAdaptiveSuggestions(
    getAdaptiveStore().get(),
    settings,
  ).find((item) => item.id === id);
  if (!suggestion) throw new Error("Sugestão adaptativa não encontrada.");

  if (suggestion.type === "protected-term") {
    settings = await settingsStore.update({
      appProfiles: {
        ...(settings.appProfiles ?? {}),
        [suggestion.appKey]: {
          ...(settings.appProfiles?.[suggestion.appKey] ?? {}),
          protectedTerms: [
            ...new Set([
              ...((settings.appProfiles?.[suggestion.appKey]?.protectedTerms ??
                []) as string[]),
              suggestion.payload.term,
            ]),
          ],
        },
      },
    });
  } else if (suggestion.type === "format-style") {
    settings = await settingsStore.update({
      appProfiles: {
        ...(settings.appProfiles ?? {}),
        [suggestion.appKey]: {
          ...(settings.appProfiles?.[suggestion.appKey] ?? {}),
          formatStyle: suggestion.payload.formatStyle,
        },
      },
    });
  } else if (suggestion.type === "language-bias") {
    settings = await settingsStore.update({
      appProfiles: {
        ...(settings.appProfiles ?? {}),
        [suggestion.appKey]: {
          ...(settings.appProfiles?.[suggestion.appKey] ?? {}),
          languageBias: suggestion.payload.languageBias,
        },
      },
    });
  }

  await getAdaptiveStore().dismissSuggestion(id);
  sttManager.markPhraseCacheDirty();
  return { ok: true };
});

ipcMain.handle("adaptive:dismiss", async (_event, payload: unknown) => {
  const { id } = validateAdaptiveSuggestionPayload(payload);
  await getAdaptiveStore().dismissSuggestion(id);
  return { ok: true };
});

ipcMain.handle("settings:update", async (_event, payload: unknown) => {
  if (!settingsStore) return { ok: false };
  const partial = validateSettingsUpdate(payload);
  const previousSettings = settings;
  const nextSettings = settingsStore.previewUpdate(
    partial as Partial<AppSettings>,
  );

  if ("hotkeyPrimary" in partial || "hotkeyFallback" in partial) {
    const hotkeyValidation = hotkeyService.validateHotkeyConfiguration({
      primaryHotkey: nextSettings.hotkeyPrimary,
      fallbackHotkey: nextSettings.hotkeyFallback,
    });
    if (!hotkeyValidation.ok) {
      throw new Error(hotkeyValidation.message);
    }
  }

  settings = await settingsStore.update(partial as Partial<AppSettings>);

  try {
    if ("hotkeyPrimary" in partial || "hotkeyFallback" in partial) {
      const hotkeyReload = await hotkeyService.reloadHotkeys({
        primaryHotkey: settings.hotkeyPrimary,
        fallbackHotkey: settings.hotkeyFallback,
      });
      if (!hotkeyReload.ok) {
        throw new Error(hotkeyReload.message);
      }
    }

    if ("historyRetentionDays" in partial || "historyEnabled" in partial) {
      await getHistoryStore().prune(settings.historyRetentionDays);
    }

    sttManager.markPhraseCacheDirty();
    refreshCaptureBlockedReason();
    return { ok: true, settings };
  } catch (error) {
    settings = await settingsStore.replace(previousSettings);
    if ("hotkeyPrimary" in partial || "hotkeyFallback" in partial) {
      await hotkeyService.reloadHotkeys({
        primaryHotkey: previousSettings.hotkeyPrimary,
        fallbackHotkey: previousSettings.hotkeyFallback,
      });
    }
    refreshCaptureBlockedReason();
    throw error;
  }
});

ipcMain.handle("settings:autoPaste", async (_event, payload: unknown) => {
  if (!settingsStore) return { ok: false };
  const { enabled } = validateAutoPastePayload(payload);
  settings = await settingsStore.update({ autoPasteEnabled: enabled });
  return { ok: true };
});

ipcMain.handle("settings:tone", async (_event, payload: unknown) => {
  if (!settingsStore) return { ok: false };
  const { mode } = validateTonePayload(payload);
  settings = await settingsStore.update({
    toneMode:
      mode === "formal"
        ? "formal"
        : mode === "very-casual"
          ? "very-casual"
          : "casual",
  });
  return { ok: true, toneMode: settings.toneMode };
});

ipcMain.handle("dictionary:list", async () => {
  return getDictionaryStore().list();
});

ipcMain.handle("dictionary:export", async () => {
  return await getDictionaryStore().export();
});

ipcMain.handle("dictionary:import", async (_event, payload: unknown) => {
  const { terms, mode } = validateDictionaryImportPayload(payload);
  const result = await getDictionaryStore().import({
    terms: terms as never,
    mode,
  });
  sttManager.markPhraseCacheDirty();
  return result;
});

ipcMain.handle("dictionary:add", async (_event, payload: unknown) => {
  const validPayload = validateDictionaryAddPayload(payload);
  const term = await getDictionaryStore().add(validPayload);
  sttManager.markPhraseCacheDirty();
  return { ok: true, term };
});

ipcMain.handle("dictionary:update", async (_event, payload: unknown) => {
  const validPayload = validateDictionaryUpdatePayload(payload);
  const term = await getDictionaryStore().update(validPayload);
  sttManager.markPhraseCacheDirty();
  return { ok: true, term };
});

ipcMain.handle("dictionary:remove", async (_event, payload: unknown) => {
  const { id } = validateIdPayload(payload, "dictionary:remove");
  const result = await getDictionaryStore().remove(id);
  sttManager.markPhraseCacheDirty();
  return result;
});

ipcMain.handle("history:list", async (_event, payload?: unknown) => {
  return await getHistoryStore().list(validateHistoryListPayload(payload));
});

ipcMain.handle("history:remove", async (_event, payload: unknown) => {
  const { id } = validateIdPayload(payload, "history:remove");
  return await getHistoryStore().remove(id);
});

ipcMain.handle("history:clear", async (_event, payload?: unknown) => {
  return await getHistoryStore().clear(validateHistoryClearPayload(payload));
});

sttManager.registerIpcHandlers(ipcMain);

function ensureTray() {
  if (tray) return;
  const iconPath = getIconPath();
  if (!iconPath) return;

  tray = new Tray(iconPath);
  tray.setToolTip(APP_NAME);

  tray.on("click", () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isVisible()) mainWindow.hide();
    else {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  const rebuildMenu = () => {
    const mainVisible = Boolean(
      mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible(),
    );
    const menu = Menu.buildFromTemplate([
      {
        label: mainVisible ? "Ocultar" : "Mostrar",
        click: () => {
          if (mainVisible) mainWindow?.hide();
          else {
            mainWindow?.show();
            mainWindow?.focus();
          }
        },
      },
      { type: "separator" },
      {
        label: hudController.isHudVisible() ? "Ocultar HUD" : "Mostrar HUD",
        click: () => {
          hudController.setHudVisible(!hudController.isHudVisible());
          rebuildMenu();
        },
      },
      { type: "separator" },
      {
        label: "Sair",
        click: () => {
          isQuitting = true;
          try {
            tray?.destroy();
          } catch {
            // ignore
          }
          tray = null;
          app.quit();
        },
      },
    ]);
    tray?.setContextMenu(menu);
  };

  mainWindow?.on("show", rebuildMenu);
  mainWindow?.on("hide", rebuildMenu);
  const hudWindow = hudController.getHudWindow();
  hudWindow?.on("show", rebuildMenu);
  hudWindow?.on("hide", rebuildMenu);
  rebuildMenu();
}

async function bootstrap() {
  if (process.platform === "win32") {
    app.setAppUserModelId(APP_ID);
  }

  runtimeSecurity = installSessionSecurity(
    session.defaultSession,
    DEV_SERVER_URL,
  );

  if (IS_DEV) {
    const devUserData = path.join(app.getPath("appData"), "voice-note-ai-dev");
    app.setPath("userData", devUserData);
  }

  await getAzureCredentialsStore().load();
  settingsStore = new SettingsStore(
    path.join(app.getPath("userData"), "settings.json"),
    settings,
  );
  settings = await settingsStore.load();
  await getHistoryStore().prune(settings.historyRetentionDays);
  void getPerfStore();
  await getAdaptiveStore().load();

  sttManager.markPhraseCacheDirty();
  void sttManager.prewarmStt();
  refreshCaptureBlockedReason();
  logInfo("application bootstrapping", {
    isDev: IS_DEV,
    holdToTalk: HOLD_TO_TALK_ENABLED,
    privacyMode: settings.privacyMode,
    historyStorageMode: settings.historyStorageMode,
    azureCredentialSource: getResolvedAzureCredentials().source,
  });

  mainWindow = await createMainWindow({
    devServerUrl: DEV_SERVER_URL,
    getIconPath,
    getPreloadPath,
    resolveDistFile: (filename) => path.join(__dirname, "..", "dist", filename),
    isQuitting: () => isQuitting,
    getPreferredDisplay,
  });

  // Frameless window controls
  ipcMain.on("window:minimize", () => mainWindow?.minimize());
  ipcMain.on("window:maximize", () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize();
    else mainWindow?.maximize();
  });
  ipcMain.on("window:close", () => mainWindow?.close());
  ipcMain.handle(
    "window:is-maximized",
    () => mainWindow?.isMaximized() ?? false,
  );
  mainWindow.on("maximize", () =>
    mainWindow?.webContents.send("window:maximized-change", true),
  );
  mainWindow.on("unmaximize", () =>
    mainWindow?.webContents.send("window:maximized-change", false),
  );

  await hudController.createHudWindow();
  ensureTray();
  attachDisplayListeners();
  applyAdaptiveBounds();
  setHudState({ state: "idle" });

  await hotkeyService.reloadHotkeys();

  const startupBlockedReason = refreshCaptureBlockedReason();
  if (startupBlockedReason === getAzureConfigMissingMessage()) {
    emitAppError(startupBlockedReason);
    setHudState({ state: "error", message: startupBlockedReason });
  }

  app.on("browser-window-focus", () => {
    hudController.ensureHudAlwaysOnTop();
  });
  app.on("browser-window-blur", () => {
    hudController.ensureHudAlwaysOnTop();
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createMainWindow({
        devServerUrl: DEV_SERVER_URL,
        getIconPath,
        getPreloadPath,
        resolveDistFile: (filename) =>
          path.join(__dirname, "..", "dist", filename),
        isQuitting: () => isQuitting,
        getPreferredDisplay,
      }).then((created) => {
        mainWindow = created;
        ensureTray();
        applyAdaptiveBounds();
      });
    }
  });
}

app
  .whenReady()
  .then(async () => {
    await bootstrap();
  })
  .catch((error) => {
    logError("startup failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    try {
      setHudState({
        state: "error",
        message: "Falha ao iniciar app (dev server).",
      });
    } catch {
      // ignore
    }
    app.quit();
  });

app.on("window-all-closed", () => {
  // Keep running in background (tray + hotkeys).
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  detachDisplayListeners();
  hudController.stopHudHoverPolling();
  hotkeyService.stop();
  sttManager.dispose();
  try {
    tray?.destroy();
  } catch {
    // ignore
  }
  tray = null;
});
