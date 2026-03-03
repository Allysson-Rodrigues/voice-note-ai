import { app, BrowserWindow, Menu, Tray, globalShortcut, ipcMain, screen } from 'electron';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { DictionaryStore } from './dictionary-store.js';
import { HistoryStore } from './history-store.js';
import {
  DEFAULT_CANONICAL_TERMS,
  SettingsStore,
  type AppSettings,
  type InjectionMethod,
  type ToneMode,
} from './settings-store.js';
import { applyTranscriptPostprocess } from './transcript-postprocess.js';
import { createMainWindow, applyMainWindowBounds } from './modules/main-window.js';
import { createHudWindowController } from './modules/hud-window.js';
import {
  AZURE_CONFIG_MISSING_MESSAGE,
  getAzureConfigError,
  getHealthCheckReport,
} from './modules/health-check.js';
import { createTextInjectionService } from './modules/text-injection.js';
import { createSttSessionManager } from './modules/stt-session.js';
import { createHotkeyService } from './modules/hotkey.js';
import type { PasteAttempt } from './injection-plan.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config({ path: path.join(process.cwd(), '.env') });

const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
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
let isQuitting = false;
let displayListenersAttached = false;

function parseBooleanEnv(value: string | undefined) {
  if (value == null) return undefined;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return undefined;
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
  extraPhrases: [],
  canonicalTerms: [...DEFAULT_CANONICAL_TERMS],
  stopGraceMs: Number(process.env.VOICE_STOP_GRACE_MS ?? '200') || 200,
  formatCommandsEnabled: true,
  maxSessionSeconds: Number(process.env.VOICE_MAX_SESSION_SECONDS ?? '90') || 90,
  historyEnabled: parseBooleanEnv(process.env.VOICE_HISTORY_ENABLED) ?? true,
  historyRetentionDays: Number(process.env.VOICE_HISTORY_RETENTION_DAYS ?? '30') || 30,
  injectionProfiles: {},
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
    historyStore = new HistoryStore(path.join(app.getPath('userData'), 'history.json'));
  }
  return historyStore;
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
    tray.setToolTip(`Voice Note AI - ${message}`);
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
  if (existing && existing !== AZURE_CONFIG_MISSING_MESSAGE) return existing;
  return getAzureConfigError();
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

function postprocessTranscript(rawText: string) {
  return applyTranscriptPostprocess(rawText, {
    toneMode: settings.toneMode,
    canonicalTerms: settings.canonicalTerms,
    formatCommandsEnabled: settings.formatCommandsEnabled,
  });
}

const sttManager = createSttSessionManager({
  getSettings: () => settings,
  getCaptureBlockedReason: () => refreshCaptureBlockedReason(),
  broadcast,
  setHudState,
  emitAppError,
  postprocessTranscript,
  getMainWindow: () => mainWindow,
  getForegroundWindowHandle: textInjectionService.getForegroundWindowHandle,
  resolveInjectionTargetWindowHandle: textInjectionService.resolveInjectionTargetWindowHandle,
  injectText: textInjectionService.injectText,
  getDictionaryPhrases: async (seedPhrases) => {
    return await getDictionaryStore().activePhrases(seedPhrases);
  },
  onSessionCompleted: async (entry) => {
    if (!settings.historyEnabled) return;
    await getHistoryStore().append(entry, settings.historyRetentionDays);
  },
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
    holdToTalkEnabled: HOLD_TO_TALK_ENABLED,
    holdHookActive: Boolean(hotkeyService.getStopHoldHook()),
  });
});

ipcMain.handle('app:retry-hold-hook', async () => {
  return await hotkeyService.retryHoldHook();
});

ipcMain.handle(
  'settings:update',
  async (
    _event,
    partial: Partial<
      Pick<
        AppSettings,
        | 'autoPasteEnabled'
        | 'toneMode'
        | 'languageMode'
        | 'extraPhrases'
        | 'canonicalTerms'
        | 'stopGraceMs'
        | 'formatCommandsEnabled'
        | 'maxSessionSeconds'
        | 'historyEnabled'
        | 'historyRetentionDays'
      >
    >,
  ) => {
    if (!settingsStore) return { ok: false };
    settings = await settingsStore.update(partial as Partial<AppSettings>);
    if ('historyRetentionDays' in partial || 'historyEnabled' in partial) {
      await getHistoryStore().prune(settings.historyRetentionDays);
    }
    sttManager.markPhraseCacheDirty();
    return { ok: true, settings };
  },
);

ipcMain.handle('settings:autoPaste', async (_event, { enabled }: { enabled: boolean }) => {
  if (!settingsStore) return { ok: false };
  settings = await settingsStore.update({ autoPasteEnabled: enabled });
  return { ok: true };
});

ipcMain.handle('settings:tone', async (_event, { mode }: { mode: ToneMode }) => {
  if (!settingsStore) return { ok: false };
  settings = await settingsStore.update({
    toneMode: mode === 'formal' ? 'formal' : mode === 'very-casual' ? 'very-casual' : 'casual',
  });
  return { ok: true, toneMode: settings.toneMode };
});

ipcMain.handle('dictionary:list', async () => {
  return getDictionaryStore().list();
});

ipcMain.handle('dictionary:add', async (_event, payload: { term: string; hintPt?: string }) => {
  const term = await getDictionaryStore().add(payload);
  sttManager.markPhraseCacheDirty();
  return { ok: true, term };
});

ipcMain.handle(
  'dictionary:update',
  async (_event, payload: { id: string; term?: string; hintPt?: string; enabled?: boolean }) => {
    const term = await getDictionaryStore().update(payload);
    sttManager.markPhraseCacheDirty();
    return { ok: true, term };
  },
);

ipcMain.handle('dictionary:remove', async (_event, payload: { id: string }) => {
  const result = await getDictionaryStore().remove(payload.id);
  sttManager.markPhraseCacheDirty();
  return result;
});

ipcMain.handle(
  'history:list',
  async (_event, payload?: { query?: string; limit?: number; offset?: number }) => {
    return await getHistoryStore().list(payload ?? {});
  },
);

ipcMain.handle('history:remove', async (_event, payload: { id: string }) => {
  return await getHistoryStore().remove(payload.id);
});

ipcMain.handle('history:clear', async (_event, payload?: { before?: string }) => {
  return await getHistoryStore().clear(payload ?? {});
});

sttManager.registerIpcHandlers(ipcMain);

function ensureTray() {
  if (tray) return;
  const iconPath = getIconPath();
  if (!iconPath) return;

  tray = new Tray(iconPath);
  tray.setToolTip('Voice Note AI');

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
        label: mainVisible ? 'Hide' : 'Show',
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
        label: hudController.isHudVisible() ? 'Hide HUD' : 'Show HUD',
        click: () => {
          hudController.setHudVisible(!hudController.isHudVisible());
          rebuildMenu();
        },
      },
      { type: 'separator' },
      {
        label: 'Quit',
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
    app.setAppUserModelId('com.antigravity.voice-note-ai');
  }

  settingsStore = new SettingsStore(path.join(app.getPath('userData'), 'settings.json'), settings);
  settings = await settingsStore.load();
  await getHistoryStore().prune(settings.historyRetentionDays);

  sttManager.markPhraseCacheDirty();
  void sttManager.prewarmStt();
  refreshCaptureBlockedReason();

  mainWindow = await createMainWindow({
    devServerUrl: DEV_SERVER_URL,
    getIconPath,
    getPreloadPath,
    resolveDistFile: (filename) => path.join(__dirname, '..', 'dist', filename),
    isQuitting: () => isQuitting,
    getPreferredDisplay,
  });
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
  if (startupBlockedReason === AZURE_CONFIG_MISSING_MESSAGE) {
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
    console.error('[startup] failed to initialize', error);
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
