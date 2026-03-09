import { app, BrowserWindow, globalShortcut, ipcMain, session } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { registerAppIpcHandlers } from "./app-ipc.js";
import { createAppShell } from "./app-shell.js";
import { createAppStores } from "./app-stores.js";
import type { PasteAttempt } from "./injection-plan.js";
import { logError, logInfo } from "./logger.js";
import {
  getAzureConfigError,
  getAzureConfigMissingMessage,
} from "./modules/health-check.js";
import { createHotkeyService } from "./modules/hotkey.js";
import { createMainWindow } from "./modules/main-window.js";
import { createSttSessionManager } from "./modules/stt-session.js";
import { classifyTranscriptIntent } from "./modules/transcript-intent.js";
import { rewriteTranscript } from "./modules/transcript-rewrite.js";
import { createTextInjectionService } from "./modules/text-injection.js";
import { installSessionSecurity } from "./modules/window-security.js";
import { canPersistAdaptiveLearning } from "./privacy-rules.js";
import {
  APP_ID,
  APP_NAME,
  HOLD_HOOK_RECOVERY_RETRY_MS,
  createDefaultSettings,
  getRuntimeConfig,
  loadRuntimeEnv,
} from "./runtime-config.js";
import {
  SettingsStore,
  type AppSettings,
  type InjectionMethod,
  type LowConfidencePolicy,
} from "./settings-store.js";
import { hotkeyLabelFromAccelerator } from "./hotkey-config.js";
import { inspectTranscriptPostprocess } from "./transcript-postprocess.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

loadRuntimeEnv();
const {
  devServerUrl: DEV_SERVER_URL,
  isDev: IS_DEV,
  holdToTalkEnabled: HOLD_TO_TALK_ENABLED,
  hudEnabled: HUD_ENABLED,
  hudDebug: HUD_DEBUG,
} = getRuntimeConfig();

type HotkeyMode = "hold" | "toggle-primary" | "toggle-fallback" | "unavailable";
type RuntimeInfo = {
  hotkeyLabel: string;
  hotkeyMode: HotkeyMode;
  holdToTalkActive: boolean;
  holdRequired: boolean;
  captureBlockedReason?: string;
};

let settingsStore: SettingsStore | null = null;
let isQuitting = false;
let runtimeSecurity = {
  cspEnabled: false,
  permissionsPolicy: "default-deny" as const,
  trustedOrigins: ["file://"],
};
let settings: AppSettings = createDefaultSettings();
const stores = createAppStores({
  getSettings: () => settings,
});
const appShell = createAppShell({
  appName: APP_NAME,
  appDirname: __dirname,
  devServerUrl: DEV_SERVER_URL,
  hudEnabled: HUD_ENABLED,
  hudDebug: HUD_DEBUG,
  isQuitting: () => isQuitting,
  requestQuit: () => {
    isQuitting = true;
  },
  onHudHoverChange: (hovered) => {
    appShell.broadcast("hud:hover", { hovered });
  },
});

let runtimeInfo: RuntimeInfo = {
  hotkeyLabel: hotkeyLabelFromAccelerator(settings.hotkeyPrimary),
  hotkeyMode: "unavailable",
  holdToTalkActive: false,
  holdRequired: process.platform === "win32",
};

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
    credentials: stores.getResolvedAzureCredentials(),
  });
}

function refreshCaptureBlockedReason() {
  const next = resolveCaptureBlockedReason() ?? undefined;
  if (runtimeInfo.captureBlockedReason !== next) {
    setCaptureBlockedReason(next);
  }
  return next;
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
  getMainWindow: () => appShell.getMainWindow(),
  getHudWindow: () => appShell.hudController.getHudWindow(),
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
  getAzureCredentials: () => stores.getResolvedAzureCredentials(),
  getCaptureBlockedReason: () => refreshCaptureBlockedReason(),
  broadcast: appShell.broadcast,
  setHudState: appShell.setHudState,
  emitAppError: appShell.emitAppError,
  postprocessTranscript,
  getMainWindow: () => appShell.getMainWindow(),
  getForegroundWindowHandle: textInjectionService.getForegroundWindowHandle,
  getWindowAppKey: textInjectionService.getWindowAppKey,
  resolveInjectionTargetWindowHandle:
    textInjectionService.resolveInjectionTargetWindowHandle,
  injectText: textInjectionService.injectText,
  getDictionaryPhrases: async (seedPhrases) => {
    const historyPhrases = await stores.getRecentHistoryPhrases();
    return await stores
      .getDictionaryStore()
      .activePhrases([...seedPhrases, ...historyPhrases]);
  },
  onSessionCompleted: async (entry) => {
    await stores.getPerfStore().append({
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
    await stores.getHistoryStore().append(
      {
        ...entry,
        appKey: entry.appKey ?? undefined,
        injectionMethod: entry.injectionMethod ?? undefined,
      },
      settings.historyRetentionDays,
    );
    if (canPersistAdaptiveLearning(settings)) {
      await stores.getAdaptiveStore().observeSession({
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
  setHudState: appShell.setHudState,
  emitAppError: appShell.emitAppError,
  sendCaptureStart: (payload) => {
    const mainWindow = appShell.getMainWindow();
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send("capture:start", payload);
  },
  sendCaptureStop: (payload) => {
    const mainWindow = appShell.getMainWindow();
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send("capture:stop", payload);
  },
  sendSttError: (payload) => {
    appShell.broadcast("stt:error", payload);
  },
  hasActiveSession: () => sttManager.hasActiveSession(),
  getActiveSessionId: () => sttManager.getActiveSessionId(),
  onStartSession: async (sessionId) => {
    const mainWindow = appShell.getMainWindow();
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

registerAppIpcHandlers({
  ipcMain,
  holdToTalkEnabled: HOLD_TO_TALK_ENABLED,
  getRuntimeSecurity: () => runtimeSecurity,
  getRuntimeInfo: () => runtimeInfo,
  getSettings: () => settings,
  setSettings: (nextSettings) => {
    settings = nextSettings;
  },
  getSettingsStore: () => settingsStore,
  stores,
  sttManager,
  hotkeyService,
  textInjectionService,
  refreshCaptureBlockedReason,
});

sttManager.registerIpcHandlers(ipcMain);

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

  await stores.getAzureCredentialsStore().load();
  settingsStore = new SettingsStore(
    path.join(app.getPath("userData"), "settings.json"),
    settings,
  );
  settings = await settingsStore.load();
  await stores.getHistoryStore().prune(settings.historyRetentionDays);
  void stores.getPerfStore();
  await stores.getAdaptiveStore().load();

  sttManager.markPhraseCacheDirty();
  void sttManager.prewarmStt();
  refreshCaptureBlockedReason();
  logInfo("application bootstrapping", {
    isDev: IS_DEV,
    holdToTalk: HOLD_TO_TALK_ENABLED,
    privacyMode: settings.privacyMode,
    historyStorageMode: settings.historyStorageMode,
    azureCredentialSource: stores.getResolvedAzureCredentials().source,
  });

  const mainWindow = await createMainWindow({
    devServerUrl: DEV_SERVER_URL,
    getIconPath: appShell.getIconPath,
    getPreloadPath: appShell.getPreloadPath,
    resolveDistFile: appShell.resolveDistFile,
    isQuitting: () => isQuitting,
    getPreferredDisplay: appShell.getPreferredDisplay,
  });
  appShell.setMainWindow(mainWindow);

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

  await appShell.hudController.createHudWindow();
  appShell.ensureTray();
  appShell.attachDisplayListeners();
  appShell.applyAdaptiveBounds();
  appShell.setHudState({ state: "idle" });

  await hotkeyService.reloadHotkeys();

  const startupBlockedReason = refreshCaptureBlockedReason();
  if (startupBlockedReason === getAzureConfigMissingMessage()) {
    appShell.emitAppError(startupBlockedReason);
    appShell.setHudState({ state: "error", message: startupBlockedReason });
  }

  app.on("browser-window-focus", () => {
    appShell.hudController.ensureHudAlwaysOnTop();
  });
  app.on("browser-window-blur", () => {
    appShell.hudController.ensureHudAlwaysOnTop();
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createMainWindow({
        devServerUrl: DEV_SERVER_URL,
        getIconPath: appShell.getIconPath,
        getPreloadPath: appShell.getPreloadPath,
        resolveDistFile: appShell.resolveDistFile,
        isQuitting: () => isQuitting,
        getPreferredDisplay: appShell.getPreferredDisplay,
      }).then((created) => {
        appShell.setMainWindow(created);
        appShell.ensureTray();
        appShell.applyAdaptiveBounds();
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
      appShell.setHudState({
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
  appShell.detachDisplayListeners();
  appShell.hudController.stopHudHoverPolling();
  hotkeyService.stop();
  sttManager.dispose();
  appShell.destroyTray();
});
