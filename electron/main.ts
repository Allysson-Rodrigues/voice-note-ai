import dotenv from 'dotenv';
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
} from 'electron';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DictionaryStore } from './dictionary-store.js';
import { HistoryStore } from './history-store.js';
import type { PasteAttempt } from './injection-plan.js';
import {
  validateAutoPastePayload,
  validateDictionaryAddPayload,
  validateDictionaryUpdatePayload,
  validateHistoryClearPayload,
  validateHistoryListPayload,
  validateIdPayload,
  validateSettingsUpdate,
  validateTonePayload,
} from './ipc-validation.js';
import { getRecentLogs, logError, logInfo } from './logger.js';
import {
  getAzureConfigError,
  getAzureConfigMissingMessage,
  getHealthCheckReport,
} from './modules/health-check.js';
import { createHotkeyService } from './modules/hotkey.js';
import { createHudWindowController } from './modules/hud-window.js';
import { applyMainWindowBounds, createMainWindow } from './modules/main-window.js';
import { createSttSessionManager } from './modules/stt-session.js';
import { createTextInjectionService } from './modules/text-injection.js';
import { installSessionSecurity } from './modules/window-security.js';
import { PerfStore } from './perf-store.js';
import {
  DEFAULT_CANONICAL_TERMS,
  SettingsStore,
  type AppSettings,
  type InjectionMethod,
} from './settings-store.js';
import { applyTranscriptPostprocess } from './transcript-postprocess.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config({ path: path.join(process.cwd(), '.env') });

const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
const IS_DEV = Boolean(DEV_SERVER_URL);
const APP_ID = 'com.antigravity.vox-type';
const APP_NAME = 'Vox Type';
const PRIMARY_HOTKEY = process.env.VOICE_HOTKEY ?? 'CommandOrControl+Super';
const FALLBACK_HOTKEY = process.env.VOICE_HOTKEY_FALLBACK ?? 'CommandOrControl+Super+Space';
const HOLD_TO_TALK_ENABLED = (process.env.VOICE_HOLD_TO_TALK ?? '1') !== '0';
const HUD_ENABLED = (process.env.VOICE_HUD ?? '1') !== '0';
const HUD_DEBUG = (process.env.VOICE_HUD_DEBUG ?? '0') !== '0';
const HOLD_HOOK_RECOVERY_RETRY_MS = 10000;

type HotkeyMode = 'hold' | 'toggle-primary' | 'toggle-fallback' | 'unavailable';
type HudVisualState = 'idle' | 'listening' | 'finalizing' | 'injecting' | 'success' | 'error';

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
let isQuitting = false;
let displayListenersAttached = false;
let runtimeSecurity = {
  cspEnabled: false,
  permissionsPolicy: 'default-deny' as const,
  trustedOrigins: ['file://'],
};

function parseBooleanEnv(value: string | undefined) {
  if (value == null) return undefined;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return undefined;
}

function resolveDefaultHistoryStorageMode() {
  const explicit = process.env.VOICE_HISTORY_STORAGE_MODE?.trim().toLowerCase();
  if (explicit === 'encrypted') return 'encrypted' as const;
  if (explicit === 'plain') return 'plain' as const;
  return safeStorage.isEncryptionAvailable() ? ('encrypted' as const) : ('plain' as const);
}

let settings: AppSettings = {
  autoPasteEnabled: parseBooleanEnv(process.env.VOICE_AUTO_PASTE) ?? true,
  toneMode:
    (process.env.VOICE_TONE ?? 'casual') === 'formal'
      ? 'formal'
      : (process.env.VOICE_TONE ?? 'casual') === 'very-casual'
        ? 'very-casual'
        : 'casual',
  languageMode: (process.env.AZURE_SPEECH_LANGUAGE ?? 'pt-BR') === 'en-US' ? 'en-US' : 'pt-BR',
  sttProvider: 'azure',
  extraPhrases: [],
  canonicalTerms: [...DEFAULT_CANONICAL_TERMS],
  stopGraceMs: Number(process.env.VOICE_STOP_GRACE_MS ?? '200') || 200,
  formatCommandsEnabled: true,
  maxSessionSeconds: Number(process.env.VOICE_MAX_SESSION_SECONDS ?? '90') || 90,
  historyEnabled: parseBooleanEnv(process.env.VOICE_HISTORY_ENABLED) ?? true,
  historyRetentionDays: Number(process.env.VOICE_HISTORY_RETENTION_DAYS ?? '30') || 30,
  injectionProfiles: {},
  privacyMode: parseBooleanEnv(process.env.VOICE_PRIVACY_MODE) ?? false,
  historyStorageMode: resolveDefaultHistoryStorageMode(),
  postprocessProfile:
    (process.env.VOICE_POSTPROCESS_PROFILE ?? 'balanced') === 'safe'
      ? 'safe'
      : (process.env.VOICE_POSTPROCESS_PROFILE ?? 'balanced') === 'aggressive'
        ? 'aggressive'
        : 'balanced',
  dualLanguageStrategy:
    (process.env.VOICE_DUAL_LANGUAGE_STRATEGY ?? 'fallback-on-low-confidence') === 'parallel'
      ? 'parallel'
      : 'fallback-on-low-confidence',
  appProfiles: {},
};

let runtimeInfo: RuntimeInfo = {
  hotkeyLabel: 'Ctrl+Win',
  hotkeyMode: 'unavailable',
  holdToTalkActive: false,
  holdRequired: process.platform === 'win32',
};

function getDictionaryStore() {
  if (!dictionaryStore) {
    dictionaryStore = new DictionaryStore(path.join(app.getPath('userData'), 'dictionary.json'));
  }
  return dictionaryStore;
}

function getHistoryStore() {
  if (!historyStore) {
    historyStore = new HistoryStore(path.join(app.getPath('userData'), 'history.json'), {
      isEncryptionAvailable: () =>
        settings.historyStorageMode === 'encrypted' && safeStorage.isEncryptionAvailable(),
      encryptString: (value) => safeStorage.encryptString(value).toString('base64'),
      decryptString: (value) => safeStorage.decryptString(Buffer.from(value, 'base64')),
    });
  }
  return historyStore;
}

function getPerfStore() {
  if (!perfStore) {
    perfStore = new PerfStore(path.join(app.getPath('userData'), 'perf.json'));
  }
  return perfStore;
}

const hudController = createHudWindowController({
  enabled: HUD_ENABLED,
  debug: HUD_DEBUG,
  devServerUrl: DEV_SERVER_URL,
  getIconPath,
  getPreloadPath,
  resolveDistFile: (filename) => path.join(__dirname, '..', 'dist', filename),
  getPreferredDisplay,
  onHoverChange: (hovered) => {
    broadcast('hud:hover', { hovered });
  },
});

function broadcast(channel: string, payload: unknown) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
  const hudWindow = hudController.getHudWindow();
  if (hudWindow && !hudWindow.isDestroyed()) hudWindow.webContents.send(channel, payload);
}

function setHudState(state: HudState) {
  broadcast('hud:state', state);
}

function emitAppError(message: string) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('app:error', { message });
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
    hotkeyMode: 'unavailable',
    holdToTalkActive: false,
    holdRequired: process.platform === 'win32',
    captureBlockedReason: reason,
  });
}

function resolveCaptureBlockedReason() {
  const existing = runtimeInfo.captureBlockedReason;
  if (existing && existing !== getAzureConfigMissingMessage({ isPackaged: app.isPackaged })) {
    return existing;
  }

  return getAzureConfigError({ isPackaged: app.isPackaged });
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
  const candidates = [
    path.join(process.cwd(), 'public', 'favicon.ico'),
    path.join(app.getAppPath(), 'public', 'favicon.ico'),
    path.join(__dirname, '..', 'public', 'favicon.ico'),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

function getPreloadPath() {
  const local = path.join(process.cwd(), 'electron', 'preload.cjs');
  if (existsSync(local)) return local;
  return path.join(__dirname, '..', 'electron', 'preload.cjs');
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
  screen.on('display-metrics-changed', applyAdaptiveBounds);
  screen.on('display-added', applyAdaptiveBounds);
  screen.on('display-removed', applyAdaptiveBounds);
  displayListenersAttached = true;
}

function detachDisplayListeners() {
  if (!displayListenersAttached) return;
  screen.removeListener('display-metrics-changed', applyAdaptiveBounds);
  screen.removeListener('display-added', applyAdaptiveBounds);
  screen.removeListener('display-removed', applyAdaptiveBounds);
  displayListenersAttached = false;
}

function getPreferredInjectionMethod(appKey: string | null): PasteAttempt | null {
  if (!appKey) return null;
  const key = appKey.toLowerCase();
  const profileMethod = settings.appProfiles?.[key]?.injectionMethod;
  if (profileMethod) return profileMethod;
  const method = settings.injectionProfiles?.[key];
  if (!method) return null;
  return method as PasteAttempt;
}

async function rememberInjectionMethod(appKey: string | null, method: PasteAttempt) {
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
  canAutoPaste: () => settings.autoPasteEnabled && process.platform === 'win32',
  getMainWindow: () => mainWindow,
  getHudWindow: () => hudController.getHudWindow(),
  getPreferredInjectionMethod,
  rememberInjectionMethod,
});

async function postprocessTranscript(rawText: string) {
  const base = applyTranscriptPostprocess(rawText, {
    toneMode: settings.toneMode,
    canonicalTerms: settings.canonicalTerms,
    formatCommandsEnabled: settings.formatCommandsEnabled,
    profile: settings.postprocessProfile,
  });
  return base;
}

const sttManager = createSttSessionManager({
  isPackagedApp: app.isPackaged,
  getSettings: () => settings,
  getCaptureBlockedReason: () => refreshCaptureBlockedReason(),
  broadcast,
  setHudState,
  emitAppError,
  postprocessTranscript,
  getMainWindow: () => mainWindow,
  getForegroundWindowHandle: textInjectionService.getForegroundWindowHandle,
  getWindowAppKey: textInjectionService.getWindowAppKey,
  resolveInjectionTargetWindowHandle: textInjectionService.resolveInjectionTargetWindowHandle,
  injectText: textInjectionService.injectText,
  getDictionaryPhrases: async (seedPhrases) => {
    return await getDictionaryStore().activePhrases(seedPhrases);
  },
  onSessionCompleted: async (entry) => {
    await getPerfStore().append({
      sessionId: entry.sessionId,
      createdAt: new Date().toISOString(),
      pttToFirstPartialMs: entry.pttToFirstPartialMs,
      pttToFinalMs: entry.pttToFinalMs,
      injectTotalMs: entry.injectTotalMs,
      resolveWindowMs: entry.resolveWindowMs,
      pasteAttemptMs: entry.pasteAttemptMs,
      clipboardRestoreMs: entry.clipboardRestoreMs,
      retryCount: entry.retryCount,
      sessionDurationMs: entry.sessionDurationMs,
      skippedReason: entry.skippedReason,
    });
    if (!settings.historyEnabled || settings.privacyMode) return;
    await getHistoryStore().append(entry, settings.historyRetentionDays);
  },
  getAppProfile: (appKey) => settings.appProfiles?.[appKey ?? ''],
});

const hotkeyService = createHotkeyService({
  primaryHotkey: PRIMARY_HOTKEY,
  fallbackHotkey: FALLBACK_HOTKEY,
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
    mainWindow.webContents.send('capture:start', payload);
  },
  sendCaptureStop: (payload) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send('capture:stop', payload);
  },
  sendSttError: (payload) => {
    broadcast('stt:error', payload);
  },
  hasActiveSession: () => sttManager.hasActiveSession(),
  getActiveSessionId: () => sttManager.getActiveSessionId(),
  onStartSession: async (sessionId) => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      throw new Error('Main window is not available.');
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

ipcMain.handle('settings:get', async () => {
  return {
    ...settings,
  };
});

ipcMain.handle('app:runtime-info', async () => {
  refreshCaptureBlockedReason();
  return runtimeInfo;
});

ipcMain.handle('app:health-check', async () => {
  refreshCaptureBlockedReason();
  return await getHealthCheckReport({
    isPackagedApp: app.isPackaged,
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
  });
});

ipcMain.handle('app:retry-hold-hook', async () => {
  return await hotkeyService.retryHoldHook();
});

ipcMain.handle('app:perf-summary', async () => {
  return await getPerfStore().getSummary();
});

ipcMain.handle('app:logs:recent', async (_event, payload?: { limit?: number }) => {
  return getRecentLogs(payload?.limit ?? 50);
});

ipcMain.handle('settings:update', async (_event, payload: unknown) => {
  if (!settingsStore) return { ok: false };
  const partial = validateSettingsUpdate(payload);
  settings = await settingsStore.update(partial as Partial<AppSettings>);
  if ('historyRetentionDays' in partial || 'historyEnabled' in partial) {
    await getHistoryStore().prune(settings.historyRetentionDays);
  }
  sttManager.markPhraseCacheDirty();
  if ('sttProvider' in partial) {
    refreshCaptureBlockedReason();
  }
  return { ok: true, settings };
});

ipcMain.handle('settings:autoPaste', async (_event, payload: unknown) => {
  if (!settingsStore) return { ok: false };
  const { enabled } = validateAutoPastePayload(payload);
  settings = await settingsStore.update({ autoPasteEnabled: enabled });
  return { ok: true };
});

ipcMain.handle('settings:tone', async (_event, payload: unknown) => {
  if (!settingsStore) return { ok: false };
  const { mode } = validateTonePayload(payload);
  settings = await settingsStore.update({
    toneMode: mode === 'formal' ? 'formal' : mode === 'very-casual' ? 'very-casual' : 'casual',
  });
  return { ok: true, toneMode: settings.toneMode };
});

ipcMain.handle('dictionary:list', async () => {
  return getDictionaryStore().list();
});

ipcMain.handle('dictionary:export', async () => {
  return await getDictionaryStore().export();
});

ipcMain.handle(
  'dictionary:import',
  async (_event, payload: { terms: unknown[]; mode?: 'replace' | 'merge' }) => {
    const terms = Array.isArray(payload?.terms) ? payload.terms : [];
    const mode = payload?.mode === 'replace' ? 'replace' : 'merge';
    const result = await getDictionaryStore().import({ terms: terms as never, mode });
    sttManager.markPhraseCacheDirty();
    return result;
  },
);

ipcMain.handle('dictionary:add', async (_event, payload: unknown) => {
  const validPayload = validateDictionaryAddPayload(payload);
  const term = await getDictionaryStore().add(validPayload);
  sttManager.markPhraseCacheDirty();
  return { ok: true, term };
});

ipcMain.handle('dictionary:update', async (_event, payload: unknown) => {
  const validPayload = validateDictionaryUpdatePayload(payload);
  const term = await getDictionaryStore().update(validPayload);
  sttManager.markPhraseCacheDirty();
  return { ok: true, term };
});

ipcMain.handle('dictionary:remove', async (_event, payload: unknown) => {
  const { id } = validateIdPayload(payload, 'dictionary:remove');
  const result = await getDictionaryStore().remove(id);
  sttManager.markPhraseCacheDirty();
  return result;
});

ipcMain.handle('history:list', async (_event, payload?: unknown) => {
  return await getHistoryStore().list(validateHistoryListPayload(payload));
});

ipcMain.handle('history:remove', async (_event, payload: unknown) => {
  const { id } = validateIdPayload(payload, 'history:remove');
  return await getHistoryStore().remove(id);
});

ipcMain.handle('history:clear', async (_event, payload?: unknown) => {
  return await getHistoryStore().clear(validateHistoryClearPayload(payload));
});

sttManager.registerIpcHandlers(ipcMain);

function ensureTray() {
  if (tray) return;
  const iconPath = getIconPath();
  if (!iconPath) return;

  tray = new Tray(iconPath);
  tray.setToolTip(APP_NAME);

  tray.on('click', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isVisible()) mainWindow.hide();
    else {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  const rebuildMenu = () => {
    const mainVisible = Boolean(mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible());
    const menu = Menu.buildFromTemplate([
      {
        label: mainVisible ? 'Ocultar' : 'Mostrar',
        click: () => {
          if (mainVisible) mainWindow?.hide();
          else {
            mainWindow?.show();
            mainWindow?.focus();
          }
        },
      },
      { type: 'separator' },
      {
        label: hudController.isHudVisible() ? 'Ocultar HUD' : 'Mostrar HUD',
        click: () => {
          hudController.setHudVisible(!hudController.isHudVisible());
          rebuildMenu();
        },
      },
      { type: 'separator' },
      {
        label: 'Sair',
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

  mainWindow?.on('show', rebuildMenu);
  mainWindow?.on('hide', rebuildMenu);
  const hudWindow = hudController.getHudWindow();
  hudWindow?.on('show', rebuildMenu);
  hudWindow?.on('hide', rebuildMenu);
  rebuildMenu();
}

async function bootstrap() {
  if (process.platform === 'win32') {
    app.setAppUserModelId(APP_ID);
  }

  runtimeSecurity = installSessionSecurity(session.defaultSession, DEV_SERVER_URL);

  if (IS_DEV) {
    const devUserData = path.join(app.getPath('appData'), 'voice-note-ai-dev');
    app.setPath('userData', devUserData);
  }

  settingsStore = new SettingsStore(path.join(app.getPath('userData'), 'settings.json'), settings);
  settings = await settingsStore.load();
  await getHistoryStore().prune(settings.historyRetentionDays);
  void getPerfStore();

  sttManager.markPhraseCacheDirty();
  void sttManager.prewarmStt();
  refreshCaptureBlockedReason();
  logInfo('application bootstrapping', {
    isDev: IS_DEV,
    holdToTalk: HOLD_TO_TALK_ENABLED,
    privacyMode: settings.privacyMode,
    historyStorageMode: settings.historyStorageMode,
  });

  mainWindow = await createMainWindow({
    devServerUrl: DEV_SERVER_URL,
    getIconPath,
    getPreloadPath,
    resolveDistFile: (filename) => path.join(__dirname, '..', 'dist', filename),
    isQuitting: () => isQuitting,
    getPreferredDisplay,
  });

  // Frameless window controls
  ipcMain.on('window:minimize', () => mainWindow?.minimize());
  ipcMain.on('window:maximize', () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize();
    else mainWindow?.maximize();
  });
  ipcMain.on('window:close', () => mainWindow?.close());
  ipcMain.handle('window:is-maximized', () => mainWindow?.isMaximized() ?? false);
  mainWindow.on('maximize', () => mainWindow?.webContents.send('window:maximized-change', true));
  mainWindow.on('unmaximize', () => mainWindow?.webContents.send('window:maximized-change', false));

  await hudController.createHudWindow();
  ensureTray();
  attachDisplayListeners();
  applyAdaptiveBounds();
  setHudState({ state: 'idle' });

  try {
    const stopper = await hotkeyService.tryStartHoldToTalkHook();
    hotkeyService.setStopHoldHook(stopper);
  } catch {
    hotkeyService.setStopHoldHook(null);
  }

  if (process.platform === 'win32') {
    if (!HOLD_TO_TALK_ENABLED) {
      const message = 'PTT indisponivel: VOICE_HOLD_TO_TALK esta desativado.';
      setRuntimeBlocked(message);
      emitAppError(message);
      setHudState({ state: 'error', message });
    } else if (!hotkeyService.getStopHoldHook()) {
      const message = 'PTT indisponivel: hook global nao carregou (uiohook-napi).';
      setRuntimeBlocked(message);
      emitAppError(message);
      setHudState({ state: 'error', message });
      hotkeyService.scheduleHoldHookRecovery();
    }
  } else if (!hotkeyService.getStopHoldHook()) {
    hotkeyService.registerToggleHotkey();
  }

  const startupBlockedReason = refreshCaptureBlockedReason();
  if (startupBlockedReason === getAzureConfigMissingMessage({ isPackaged: app.isPackaged })) {
    emitAppError(startupBlockedReason);
    setHudState({ state: 'error', message: startupBlockedReason });
  }

  app.on('browser-window-focus', () => {
    hudController.ensureHudAlwaysOnTop();
  });
  app.on('browser-window-blur', () => {
    hudController.ensureHudAlwaysOnTop();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createMainWindow({
        devServerUrl: DEV_SERVER_URL,
        getIconPath,
        getPreloadPath,
        resolveDistFile: (filename) => path.join(__dirname, '..', 'dist', filename),
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
    logError('startup failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    try {
      setHudState({ state: 'error', message: 'Falha ao iniciar app (dev server).' });
    } catch {
      // ignore
    }
    app.quit();
  });

app.on('window-all-closed', () => {
  // Keep running in background (tray + hotkeys).
});

app.on('will-quit', () => {
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
