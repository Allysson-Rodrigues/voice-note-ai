import { app, BrowserWindow, Menu, Tray, clipboard, globalShortcut, ipcMain, screen } from 'electron';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import dotenv from 'dotenv';
import { DictionaryStore } from './dictionary-store.js';
import { SettingsStore, DEFAULT_CANONICAL_TERMS, type AppSettings, type LanguageMode, type ToneMode } from './settings-store.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load `.env.local` for the Electron main process (Vite loads env for the renderer only).
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config({ path: path.join(process.cwd(), '.env') });

const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
const PRIMARY_HOTKEY = process.env.VOICE_HOTKEY ?? 'CommandOrControl+Super';
const FALLBACK_HOTKEY = process.env.VOICE_HOTKEY_FALLBACK ?? 'CommandOrControl+Super+Space';
const HOLD_TO_TALK_ENABLED = (process.env.VOICE_HOLD_TO_TALK ?? '1') !== '0';
const HUD_ENABLED = (process.env.VOICE_HUD ?? '1') !== '0';
const HUD_DEBUG = (process.env.VOICE_HUD_DEBUG ?? '0') !== '0';

const MAIN_WINDOW_MIN_WIDTH = 860;
const MAIN_WINDOW_MAX_WIDTH = 1400;
const MAIN_WINDOW_MIN_HEIGHT = 620;
const MAIN_WINDOW_MAX_HEIGHT = 980;
const MAIN_WINDOW_WIDTH_FACTOR = 0.8;
const MAIN_WINDOW_HEIGHT_FACTOR = 0.86;

const HUD_MIN_WIDTH = 300;
const HUD_MAX_WIDTH = 620;
const HUD_MIN_HEIGHT = 54;
const HUD_MAX_HEIGHT = 72;

const MAX_WARMUP_BUFFER_BYTES = 64 * 1024;
const MAX_RING_BUFFER_BYTES_30S = 16000 * 2 * 30;
const RETRY_REPLAY_BYTES = 16000 * 2 * 6;
const RETRY_BACKOFF_MS = 250;
const CLIPBOARD_RESTORE_MAX_MS = 200;
const CLIPBOARD_TX_TIMEOUT_MS = 1200;

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

type SttSlot = {
  language: string;
  recognizer: any;
  pushStream: any;
  transcriptFinal: string;
  bestConfidence: number | null;
  ready: boolean;
  buffered: Buffer[];
  bufferedBytes: number;
};

type SttSession = {
  sessionId: string;
  sender: Electron.WebContents;
  languages: string[];
  slots: SttSlot[];
  startedAtMs: number;
  sttStartAtMs: number;
  sttReadyAtMs: number | null;
  firstPartialAtMs: number | null;
  finalAtMs: number | null;
  injectAtMs: number | null;
  retryCount: number;
  ending: boolean;
  targetWindowHandle: string | null;
  audioRing: Buffer[];
  audioRingBytes: number;
  timeoutTimer: NodeJS.Timeout | null;
};

type InjectResult = {
  pasted: boolean;
  restored: boolean;
  skippedReason?: 'WINDOW_CHANGED' | 'PASTE_FAILED' | 'TIMEOUT';
};

type ClipboardSnapshot = {
  text: string;
  html: string;
  rtf: string;
  image: Electron.NativeImage | null;
};

let mainWindow: BrowserWindow | null = null;
let hudWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let settingsStore: SettingsStore | null = null;
let dictionaryStore: DictionaryStore | null = null;
let stopHoldHook: null | (() => void) = null;
let activeSession: SttSession | null = null;
let pendingStopTimer: NodeJS.Timeout | null = null;
let pendingStopSessionId: string | null = null;
let displayListenersAttached = false;
let isQuitting = false;
let hudVisible = true;

let settings: AppSettings = {
  autoPasteEnabled: true,
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
};

let runtimeInfo: RuntimeInfo = {
  hotkeyLabel: acceleratorToLabel(PRIMARY_HOTKEY),
  hotkeyMode: 'unavailable',
  holdToTalkActive: false,
  holdRequired: process.platform === 'win32',
};

let cachedSpeechSDK: any | null = null;
let phraseCache: string[] | null = null;
let phraseCacheDirty = true;
let injectionQueue: Promise<void> = Promise.resolve();
const pendingSttStartBySession = new Map<string, Promise<{ ok: boolean }>>();

const pendingTargetWindowBySession = new Map<string, string | null>();

function getDictionaryStore() {
  if (!dictionaryStore) {
    dictionaryStore = new DictionaryStore(path.join(app.getPath('userData'), 'dictionary.json'));
  }
  return dictionaryStore;
}

function broadcast(channel: string, payload: unknown) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
  if (hudWindow && !hudWindow.isDestroyed()) hudWindow.webContents.send(channel, payload);
}

function setHudState(state: HudState) {
  broadcast('hud:state', state);
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(label)), timeoutMs);
    promise.then(
      (result) => {
        clearTimeout(timer);
        resolve(result);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function acceleratorToLabel(accelerator: string) {
  return accelerator
    .split('+')
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token) => {
      const key = token.toLowerCase();
      if (key === 'commandorcontrol' || key === 'ctrl' || key === 'control') return 'Ctrl';
      if (key === 'super' || key === 'meta' || key === 'command') return 'Win';
      if (key === 'space') return 'Space';
      return token.length <= 1 ? token.toUpperCase() : token;
    })
    .join('+');
}

function updateRuntimeInfo(next: RuntimeInfo) {
  runtimeInfo = next;
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

function emitAppError(message: string) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('app:error', { message });
  }
  if (tray) {
    tray.setToolTip(`Voice Note AI - ${message}`);
  }
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

function getPreferredDisplay() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    return screen.getDisplayMatching(mainWindow.getBounds());
  }
  return screen.getPrimaryDisplay();
}

function computeMainWindowBounds(workArea: Electron.Rectangle): Electron.Rectangle {
  const width = Math.round(clamp(workArea.width * MAIN_WINDOW_WIDTH_FACTOR, MAIN_WINDOW_MIN_WIDTH, MAIN_WINDOW_MAX_WIDTH));
  const height = Math.round(clamp(workArea.height * MAIN_WINDOW_HEIGHT_FACTOR, MAIN_WINDOW_MIN_HEIGHT, MAIN_WINDOW_MAX_HEIGHT));
  return {
    x: Math.round(workArea.x + (workArea.width - width) / 2),
    y: Math.round(workArea.y + (workArea.height - height) / 2),
    width,
    height,
  };
}

function computeHudBounds(workArea: Electron.Rectangle, scaleFactor: number) {
  const safeScale = clamp(scaleFactor || 1, 1, 1.4);
  const width = Math.round(clamp(460 * safeScale, HUD_MIN_WIDTH, HUD_MAX_WIDTH));
  const height = Math.round(clamp(56 * safeScale, HUD_MIN_HEIGHT, HUD_MAX_HEIGHT));
  const marginBottom = Math.round(clamp(16 * safeScale, 10, 24));

  return {
    x: Math.round(workArea.x + (workArea.width - width) / 2),
    y: Math.round(workArea.y + workArea.height - height - marginBottom),
    width,
    height,
  };
}

function ensureHudAlwaysOnTop() {
  if (!hudWindow || hudWindow.isDestroyed()) return;
  hudWindow.setAlwaysOnTop(true, 'screen-saver');
  hudWindow.moveTop();
}

function applyAdaptiveBounds() {
  const display = getPreferredDisplay();
  const { workArea, scaleFactor } = display;

  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isMaximized() && !mainWindow.isFullScreen()) {
    const nextBounds = computeMainWindowBounds(workArea);
    mainWindow.setBounds(nextBounds, false);
    mainWindow.setMinimumSize(MAIN_WINDOW_MIN_WIDTH, MAIN_WINDOW_MIN_HEIGHT);
  }

  if (hudWindow && !hudWindow.isDestroyed()) {
    hudWindow.setBounds(computeHudBounds(workArea, scaleFactor), false);
    ensureHudAlwaysOnTop();
  }
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

function getPreloadPath() {
  const local = path.join(process.cwd(), 'electron', 'preload.cjs');
  if (existsSync(local)) return local;
  return path.join(__dirname, '..', 'electron', 'preload.cjs');
}

async function createMainWindow() {
  const bounds = computeMainWindowBounds(getPreferredDisplay().workArea);
  mainWindow = new BrowserWindow({
    ...bounds,
    minWidth: MAIN_WINDOW_MIN_WIDTH,
    minHeight: MAIN_WINDOW_MIN_HEIGHT,
    show: true,
    icon: getIconPath(),
    webPreferences: {
      contextIsolation: true,
      preload: getPreloadPath(),
    },
  });

  mainWindow.on('close', (event) => {
    if (isQuitting) return;
    event.preventDefault();
    mainWindow?.hide();
  });

  if (DEV_SERVER_URL) {
    await mainWindow.loadURL(DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    await mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

async function createHudWindow() {
  if (!HUD_ENABLED) return;
  if (hudWindow && !hudWindow.isDestroyed()) return;

  const display = getPreferredDisplay();
  hudWindow = new BrowserWindow({
    ...computeHudBounds(display.workArea, display.scaleFactor),
    show: false,
    frame: HUD_DEBUG,
    transparent: !HUD_DEBUG,
    resizable: false,
    movable: false,
    focusable: HUD_DEBUG,
    skipTaskbar: !HUD_DEBUG,
    alwaysOnTop: true,
    hasShadow: HUD_DEBUG,
    backgroundColor: HUD_DEBUG ? '#111111' : '#00000000',
    icon: getIconPath(),
    webPreferences: {
      contextIsolation: true,
      preload: getPreloadPath(),
    },
  });

  if (!HUD_DEBUG) hudWindow.setIgnoreMouseEvents(true, { forward: true });
  hudWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  ensureHudAlwaysOnTop();

  hudWindow.webContents.once('did-finish-load', () => {
    if (!hudWindow || hudWindow.isDestroyed()) return;
    if (hudVisible) {
      hudWindow.showInactive();
      ensureHudAlwaysOnTop();
    }
    if (HUD_DEBUG) hudWindow.webContents.openDevTools({ mode: 'detach' });
  });

  if (DEV_SERVER_URL) {
    await hudWindow.loadURL(`${DEV_SERVER_URL}/hud.html`);
  } else {
    await hudWindow.loadFile(path.join(__dirname, '..', 'dist', 'hud.html'));
  }
}

function setHudVisible(next: boolean) {
  hudVisible = next;
  if (!hudWindow || hudWindow.isDestroyed()) return;
  if (hudVisible) {
    hudWindow.showInactive();
    ensureHudAlwaysOnTop();
  } else {
    hudWindow.hide();
  }
}

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
      { label: hudVisible ? 'Hide HUD' : 'Show HUD', click: () => setHudVisible(!hudVisible) },
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
  hudWindow?.on('show', rebuildMenu);
  hudWindow?.on('hide', rebuildMenu);
  rebuildMenu();
}

function registerToggleHotkey() {
  globalShortcut.unregisterAll();

  const onHotkey = () => {
    if (!mainWindow) return;
    if (activeSession) {
      scheduleStop(activeSession.sessionId);
      return;
    }

    const sessionId = randomUUID();
    cancelPendingStop();
    void primeTargetWindowForSession(sessionId);
    void startSttSession(mainWindow.webContents, { sessionId })
      .then(() => undefined)
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        broadcast('stt:error', { sessionId, message });
        setHudState({ state: 'error', message });
        emitAppError(message);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('capture:stop', { sessionId });
        }
      });

    mainWindow.webContents.send('capture:start', { sessionId, sttWarmStart: true });
    setHudState({ state: 'listening' });
  };

  const primaryOk = globalShortcut.register(PRIMARY_HOTKEY, onHotkey);
  if (primaryOk) {
    updateRuntimeInfo({
      hotkeyLabel: acceleratorToLabel(PRIMARY_HOTKEY),
      hotkeyMode: 'toggle-primary',
      holdToTalkActive: false,
      holdRequired: false,
    });
    return;
  }

  const fallbackOk = globalShortcut.register(FALLBACK_HOTKEY, onHotkey);
  if (fallbackOk) {
    updateRuntimeInfo({
      hotkeyLabel: acceleratorToLabel(FALLBACK_HOTKEY),
      hotkeyMode: 'toggle-fallback',
      holdToTalkActive: false,
      holdRequired: false,
    });
    return;
  }

  const errorMessage = `Não foi possível registrar hotkey global (${PRIMARY_HOTKEY} ou ${FALLBACK_HOTKEY}).`;
  setRuntimeBlocked(errorMessage);
  emitAppError(errorMessage);
  setHudState({ state: 'error', message: errorMessage });
}

function parseHoldKeycodes(): number[] | null {
  const raw = process.env.VOICE_HOLD_KEYCODES;
  if (!raw) return null;
  const parts = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => Number(s));

  if (parts.length === 0 || parts.some((n) => !Number.isFinite(n))) return null;
  return parts;
}

function cancelPendingStop() {
  if (pendingStopTimer) clearTimeout(pendingStopTimer);
  pendingStopTimer = null;
  pendingStopSessionId = null;
}

function scheduleStop(sessionId: string) {
  cancelPendingStop();
  pendingStopSessionId = sessionId;
  const ms = Math.max(0, Math.min(2000, settings.stopGraceMs));

  pendingStopTimer = setTimeout(() => {
    pendingStopTimer = null;
    const sid = pendingStopSessionId;
    pendingStopSessionId = null;
    if (!sid) return;
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (!activeSession || activeSession.sessionId !== sid) return;

    activeSession.ending = true;
    mainWindow.webContents.send('capture:stop', { sessionId: sid });
    setHudState({ state: 'finalizing' });
  }, ms);
}

async function primeTargetWindowForSession(sessionId: string) {
  const target = await getForegroundWindowHandle().catch(() => null);
  pendingTargetWindowBySession.set(sessionId, target);
}

async function tryStartHoldToTalkHook() {
  if (!HOLD_TO_TALK_ENABLED) return null;
  if (process.platform !== 'win32') return null;

  let uiohookMod: any;
  try {
    uiohookMod = await import('uiohook-napi');
  } catch {
    return null;
  }

  const uIOhook = uiohookMod.uIOhook ?? uiohookMod.default?.uIOhook ?? uiohookMod.default ?? uiohookMod;
  if (!uIOhook?.on || !uIOhook?.start) return null;

  const required = parseHoldKeycodes();
  const pressed = new Set<number>();
  let chordActive = false;
  let ctrlDown = false;
  let metaDown = false;

  function recomputeChordActive() {
    const next = required ? required.every((k) => pressed.has(k)) : ctrlDown && metaDown;
    if (next === chordActive) return;
    chordActive = next;

    if (!mainWindow) return;

    if (chordActive) {
      if (activeSession) return;
      const sessionId = randomUUID();
      cancelPendingStop();
      void primeTargetWindowForSession(sessionId);
      void startSttSession(mainWindow.webContents, { sessionId })
        .then(() => undefined)
        .catch((error) => {
          const message = error instanceof Error ? error.message : String(error);
          broadcast('stt:error', { sessionId, message });
          setHudState({ state: 'error', message });
          emitAppError(message);
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('capture:stop', { sessionId });
          }
        });

      mainWindow.webContents.send('capture:start', { sessionId, sttWarmStart: true });
      setHudState({ state: 'listening' });
      return;
    }

    if (!activeSession) return;
    scheduleStop(activeSession.sessionId);
  }

  const onKeyDown = (event: any) => {
    if (typeof event?.keycode === 'number') pressed.add(event.keycode);
    ctrlDown = Boolean(event?.ctrlKey) || pressed.has(29) || pressed.has(3613);
    metaDown = Boolean(event?.metaKey) || pressed.has(3675) || pressed.has(3676);
    recomputeChordActive();
  };

  const onKeyUp = (event: any) => {
    if (typeof event?.keycode === 'number') pressed.delete(event.keycode);
    ctrlDown = Boolean(event?.ctrlKey);
    metaDown = Boolean(event?.metaKey);
    recomputeChordActive();
  };

  uIOhook.on('keydown', onKeyDown);
  uIOhook.on('keyup', onKeyUp);
  uIOhook.start();

  updateRuntimeInfo({
    hotkeyLabel: acceleratorToLabel(PRIMARY_HOTKEY),
    hotkeyMode: 'hold',
    holdToTalkActive: true,
    holdRequired: true,
  });

  return () => {
    try {
      uIOhook.off('keydown', onKeyDown);
      uIOhook.off('keyup', onKeyUp);
      if (uIOhook.stop) uIOhook.stop();
    } catch {
      // ignore
    }
  };
}

function canAutoPaste() {
  return settings.autoPasteEnabled && process.platform === 'win32';
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeWhitespace(text: string) {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\s+([,.;!?])/g, '$1')
    .trim();
}

function capitalizeFirst(text: string) {
  if (!text) return text;
  return text.charAt(0).toLocaleUpperCase() + text.slice(1);
}

function lowerFirst(text: string) {
  if (!text) return text;
  return text.charAt(0).toLocaleLowerCase() + text.slice(1);
}

function applyCanonicalReplacements(text: string) {
  let next = text;
  for (const term of settings.canonicalTerms ?? []) {
    if (!term.enabled) continue;
    const target = normalizeWhitespace(term.to);
    if (!target) continue;
    const variants = String(term.from ?? '')
      .split('|')
      .map((item) => normalizeWhitespace(item))
      .filter(Boolean);
    for (const variant of variants) {
      const hasTerminalBang = target.endsWith('!');
      const pattern = hasTerminalBang
        ? new RegExp(`\\b${escapeRegExp(variant)}\\b(?!\\!)`, 'gi')
        : new RegExp(`\\b${escapeRegExp(variant)}\\b`, 'gi');
      next = next.replace(pattern, target);
    }
  }
  return next;
}

function applyExplicitFormattingCommands(text: string) {
  let next = text;
  next = next.replace(/\b(?:nova linha|new line)\b/gi, '\n');
  next = next.replace(/\b(?:bullet point|bullet|t[oó]pico|topico)\b/gi, '\n•');
  next = next.replace(/\b(?:item|n[uú]mero|numero|number)\s+(\d{1,2})\b/gi, (_entry, n: string) => `\n${n}.`);
  next = next.replace(/\n[ \t]*/g, '\n');
  next = next.replace(/(^|\n)•(?!\s)/g, '$1• ');
  next = next.replace(/(^|\n)(\d+\.)\s*/g, '$1$2 ');
  next = next.replace(/\n{2,}/g, '\n');
  return normalizeWhitespace(next);
}

function applyToneProfile(text: string) {
  if (settings.toneMode === 'formal') {
    return text
      .replace(/\b(vc|vcs)\b/gi, (value) => (value.toLowerCase() === 'vcs' ? 'vocês' : 'você'))
      .replace(/\b(pra)\b/gi, 'para')
      .replace(/\b(tá)\b/gi, 'está')
      .replace(/\b(to|tô)\b/gi, 'estou')
      .replace(/\b(ta)\b/gi, 'está')
      .replace(/\b(não tá)\b/gi, 'não está')
      .replace(/\b(cê)\b/gi, 'você');
  }
  if (settings.toneMode === 'very-casual') {
    return text
      .replace(/você/gi, 'vc')
      .replace(/para/gi, 'pra')
      .replace(/está/gi, 'tá');
  }
  return text;
}

function punctuateLine(text: string, toneMode: ToneMode) {
  if (!text) return '';
  if (toneMode === 'very-casual') {
    return lowerFirst(text).replace(/[.]+$/g, '');
  }

  const capped = capitalizeFirst(text);
  if (/[.!?…]$/.test(capped)) return capped;
  if (toneMode === 'formal') return `${capped}.`;
  return capped;
}

function applyFinalPunctuation(text: string, toneMode: ToneMode) {
  if (!text) return '';
  if (!text.includes('\n')) return punctuateLine(text, toneMode);

  return text
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return '';
      if (/^(•|\d+\.)\s+/.test(trimmed)) return trimmed;
      return punctuateLine(trimmed, toneMode);
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function postprocessTranscript(rawText: string) {
  const normalized = normalizeWhitespace(rawText);
  if (!normalized) return '';

  const canonical = applyCanonicalReplacements(normalized);
  const withCommands = settings.formatCommandsEnabled ? applyExplicitFormattingCommands(canonical) : canonical;
  const toned = normalizeWhitespace(applyToneProfile(withCommands));
  return applyFinalPunctuation(toned, settings.toneMode);
}

function windowsLineEndings(text: string) {
  return text.replace(/\r\n?/g, '\n').replace(/\n/g, '\r\n');
}

async function runPowerShell(command: string, timeoutMs = 900) {
  return await new Promise<string>((resolve, reject) => {
    const ps = spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-WindowStyle',
        'Hidden',
        '-Command',
        command,
      ],
      { windowsHide: true },
    );

    let stdout = '';
    let stderr = '';

    const timer = setTimeout(() => {
      try {
        ps.kill();
      } catch {
        // ignore
      }
      reject(new Error('powershell timeout'));
    }, timeoutMs);

    ps.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    ps.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    ps.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });

    ps.on('exit', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(stderr || `powershell exited with code ${code ?? 'unknown'}`));
    });
  });
}

async function getForegroundWindowHandle() {
  if (process.platform !== 'win32') return null;

  const script = [
    '$ErrorActionPreference = "Stop"',
    'if (-not ("VoiceNote.NativeWin32" -as [type])) {',
    'Add-Type -Namespace VoiceNote -Name NativeWin32 -MemberDefinition @"',
    '  [System.Runtime.InteropServices.DllImport("user32.dll")]',
    '  public static extern System.IntPtr GetForegroundWindow();',
    '  [System.Runtime.InteropServices.DllImport("user32.dll")]',
    '  public static extern bool SetForegroundWindow(System.IntPtr hWnd);',
    '"@ }',
    '$h = [VoiceNote.NativeWin32]::GetForegroundWindow()',
    '$raw = $h.ToInt64()',
    '[Console]::Out.Write((@{ handle = "$raw" } | ConvertTo-Json -Compress))',
  ].join('; ');

  try {
    const raw = await runPowerShell(script);
    const parsed = JSON.parse(raw) as { handle?: string };
    if (!parsed.handle || parsed.handle === '0') return null;
    return parsed.handle;
  } catch {
    return null;
  }
}

async function focusWindowByHandle(handle: string) {
  if (process.platform !== 'win32' || !handle) return false;

  const script = [
    '$ErrorActionPreference = "Stop"',
    'if (-not ("VoiceNote.NativeWin32" -as [type])) {',
    'Add-Type -Namespace VoiceNote -Name NativeWin32 -MemberDefinition @"',
    '  [System.Runtime.InteropServices.DllImport("user32.dll")]',
    '  public static extern bool SetForegroundWindow(System.IntPtr hWnd);',
    '"@ }',
    `$ok = [VoiceNote.NativeWin32]::SetForegroundWindow([System.IntPtr]::new([int64]${handle}))`,
    '[Console]::Out.Write((@{ ok = $ok } | ConvertTo-Json -Compress))',
  ].join('; ');

  try {
    const raw = await runPowerShell(script);
    const parsed = JSON.parse(raw) as { ok?: boolean };
    return parsed.ok === true;
  } catch {
    return false;
  }
}

async function windowsSendCtrlV() {
  const script = [
    '$ErrorActionPreference = "Stop"',
    '$wshell = New-Object -ComObject WScript.Shell',
    "Start-Sleep -Milliseconds 40; $wshell.SendKeys('^v')",
  ].join('; ');

  await runPowerShell(script, 1000);
}

function withClipboardLock<T>(task: () => Promise<T>): Promise<T> {
  const pending = injectionQueue.then(task, task);
  injectionQueue = pending.then(() => undefined, () => undefined);
  return pending;
}

function snapshotClipboard(): ClipboardSnapshot {
  let image: Electron.NativeImage | null = null;
  try {
    const candidate = clipboard.readImage();
    if (candidate && !candidate.isEmpty()) image = candidate;
  } catch {
    image = null;
  }

  let text = '';
  let html = '';
  let rtf = '';
  try {
    text = clipboard.readText();
  } catch {
    text = '';
  }
  try {
    html = clipboard.readHTML();
  } catch {
    html = '';
  }
  try {
    rtf = clipboard.readRTF();
  } catch {
    rtf = '';
  }

  return { text, html, rtf, image };
}

function restoreClipboard(snapshot: ClipboardSnapshot) {
  const payload: Electron.Data = {};
  if (snapshot.text) payload.text = snapshot.text;
  if (snapshot.html) payload.html = snapshot.html;
  if (snapshot.rtf) payload.rtf = snapshot.rtf;
  if (snapshot.image && !snapshot.image.isEmpty()) payload.image = snapshot.image;

  // If nothing is present, clear as a best-effort restore.
  if (Object.keys(payload).length === 0) {
    clipboard.clear();
    return;
  }

  clipboard.write(payload);
}

async function ensureTargetWindow(targetWindowHandle: string | null) {
  if (process.platform !== 'win32') return true;
  if (!targetWindowHandle) return true;

  const current = await getForegroundWindowHandle();
  if (current === targetWindowHandle) return true;

  await focusWindowByHandle(targetWindowHandle);
  await sleep(70);
  const after = await getForegroundWindowHandle();
  return after === targetWindowHandle;
}

async function injectText(text: string, targetWindowHandle: string | null): Promise<InjectResult> {
  const normalized = windowsLineEndings(text);

  return withClipboardLock(() =>
    withTimeout(
      (async () => {
        const previous = snapshotClipboard();
        clipboard.writeText(normalized);

        if (!canAutoPaste()) {
          return { pasted: false, restored: false };
        }

        const targetReady = await ensureTargetWindow(targetWindowHandle);
        if (!targetReady) {
          return { pasted: false, restored: false, skippedReason: 'WINDOW_CHANGED' as const };
        }

        try {
          await windowsSendCtrlV();
        } catch {
          return { pasted: false, restored: false, skippedReason: 'PASTE_FAILED' as const };
        }

        let restored = false;
        try {
          await withTimeout(
            (async () => {
              await sleep(110);
              if (clipboard.readText() === normalized) {
                restoreClipboard(previous);
                restored = true;
              }
            })(),
            CLIPBOARD_RESTORE_MAX_MS,
            'clipboard restore timeout',
          );
        } catch {
          // ignore restore timeout
        }

        return { pasted: true, restored };
      })(),
      CLIPBOARD_TX_TIMEOUT_MS,
      'clipboard transaction timeout',
    ).catch(() => ({ pasted: false, restored: false, skippedReason: 'TIMEOUT' as const })),
  );
}

async function getSpeechSdk() {
  if (cachedSpeechSDK) return cachedSpeechSDK;
  const mod: any = await import('microsoft-cognitiveservices-speech-sdk');
  cachedSpeechSDK = mod.default ?? mod;
  return cachedSpeechSDK;
}

function getAzureConfig() {
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;
  const language = process.env.AZURE_SPEECH_LANGUAGE ?? 'pt-BR';

  if (!key || !region) {
    throw new Error('Missing AZURE_SPEECH_KEY/AZURE_SPEECH_REGION environment variables.');
  }

  return { key, region, language };
}

function markPhraseCacheDirty() {
  phraseCacheDirty = true;
}

function extractCanonicalPhrases() {
  const phrases: string[] = [];
  for (const term of settings.canonicalTerms ?? []) {
    if (!term.enabled) continue;
    const to = normalizeWhitespace(term.to);
    if (to) phrases.push(to);

    const variants = String(term.from ?? '')
      .split('|')
      .map((entry) => normalizeWhitespace(entry))
      .filter(Boolean);
    phrases.push(...variants);
  }
  return phrases;
}

async function getActivePhrasesCached() {
  if (!phraseCacheDirty && phraseCache) return phraseCache;

  const envPhrases = (process.env.VOICE_PHRASES ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  phraseCache = await getDictionaryStore().activePhrases([
    ...envPhrases,
    ...(settings.extraPhrases ?? []),
    ...extractCanonicalPhrases(),
  ]);
  phraseCacheDirty = false;
  return phraseCache;
}

async function prewarmStt() {
  try {
    const key = process.env.AZURE_SPEECH_KEY;
    const region = process.env.AZURE_SPEECH_REGION;
    if (!key || !region) return;
    await getSpeechSdk();
    await getActivePhrasesCached();
  } catch {
    // ignore
  }
}

function clearSessionTimeout(session: SttSession) {
  if (!session.timeoutTimer) return;
  clearTimeout(session.timeoutTimer);
  session.timeoutTimer = null;
}

function scheduleSessionTimeout(session: SttSession) {
  clearSessionTimeout(session);
  const maxSeconds = clamp(settings.maxSessionSeconds ?? 90, 30, 600);

  session.timeoutTimer = setTimeout(() => {
    if (!activeSession || activeSession.sessionId !== session.sessionId) return;
    if (session.ending) return;

    session.ending = true;
    setHudState({ state: 'finalizing', message: `Sessão limitada a ${maxSeconds}s` });
    emitAppError(`Sessão encerrada ao atingir ${maxSeconds}s.`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('capture:stop', { sessionId: session.sessionId });
    }
  }, maxSeconds * 1000);
}

function pushAudioToRing(session: SttSession, chunk: Buffer) {
  session.audioRing.push(chunk);
  session.audioRingBytes += chunk.byteLength;

  while (session.audioRingBytes > MAX_RING_BUFFER_BYTES_30S) {
    const removed = session.audioRing.shift();
    if (!removed) break;
    session.audioRingBytes -= removed.byteLength;
  }
}

function tailAudioFromRing(session: SttSession, maxBytes: number) {
  const out: Buffer[] = [];
  let total = 0;

  for (let i = session.audioRing.length - 1; i >= 0; i -= 1) {
    const chunk = session.audioRing[i];
    out.unshift(chunk);
    total += chunk.byteLength;
    if (total >= maxBytes) break;
  }

  return out;
}

function createRecognizerSlot(SpeechSDK: any, language: string, key: string, region: string, phrases: string[]): SttSlot {
  const speechConfig = SpeechSDK.SpeechConfig.fromSubscription(key, region);
  speechConfig.speechRecognitionLanguage = language;

  if (SpeechSDK.PropertyId?.SpeechServiceResponse_PostProcessingOption) {
    speechConfig.setProperty(SpeechSDK.PropertyId.SpeechServiceResponse_PostProcessingOption, 'TrueText');
  }

  if (SpeechSDK.OutputFormat) {
    try {
      speechConfig.outputFormat = SpeechSDK.OutputFormat.Detailed;
    } catch {
      // ignore
    }
  }

  const streamFormat = SpeechSDK.AudioStreamFormat.getWaveFormatPCM(16000, 16, 1);
  const pushStream = SpeechSDK.AudioInputStream.createPushStream(streamFormat);
  const audioConfig = SpeechSDK.AudioConfig.fromStreamInput(pushStream);
  const recognizer = new SpeechSDK.SpeechRecognizer(speechConfig, audioConfig);

  if (phrases.length > 0 && SpeechSDK.PhraseListGrammar?.fromRecognizer) {
    try {
      const grammar = SpeechSDK.PhraseListGrammar.fromRecognizer(recognizer);
      for (const phrase of phrases) grammar.addPhrase(phrase);
    } catch (error) {
      console.warn('Failed to apply phrase list.', error);
    }
  }

  return {
    language,
    recognizer,
    pushStream,
    transcriptFinal: '',
    bestConfidence: null,
    ready: false,
    buffered: [],
    bufferedBytes: 0,
  };
}

async function closeSlot(slot: SttSlot) {
  try {
    slot.pushStream.close();
  } catch {
    // ignore
  }

  await new Promise<void>((resolve) => {
    try {
      slot.recognizer.stopContinuousRecognitionAsync(
        () => {
          try {
            slot.recognizer.close();
          } catch {
            // ignore
          }
          resolve();
        },
        () => {
          try {
            slot.recognizer.close();
          } catch {
            // ignore
          }
          resolve();
        },
      );
    } catch {
      try {
        slot.recognizer.close();
      } catch {
        // ignore
      }
      resolve();
    }
  });
}

async function startSlots(session: SttSession) {
  await Promise.all(
    session.slots.map(
      (slot) =>
        new Promise<void>((resolve, reject) => {
          slot.recognizer.startContinuousRecognitionAsync(
            () => {
              slot.ready = true;
              for (const chunk of slot.buffered) slot.pushStream.write(chunk);
              slot.buffered = [];
              slot.bufferedBytes = 0;
              resolve();
            },
            reject,
          );
        }),
    ),
  );

  if (session.sttReadyAtMs == null) {
    session.sttReadyAtMs = Date.now();
    console.log(`[perf] stt_ready_ms=${session.sttReadyAtMs - session.startedAtMs}`);
  }
}

async function closeAllSlots(session: SttSession) {
  await Promise.all(session.slots.map((slot) => closeSlot(slot)));
}

function chooseBestFinalText(session: SttSession) {
  return session.slots
    .map((slot) => ({
      text: slot.transcriptFinal.trim(),
      confidence: slot.bestConfidence ?? -1,
    }))
    .sort((a, b) => b.confidence - a.confidence || b.text.length - a.text.length)[0]?.text;
}

function sessionAgeMs(session: SttSession) {
  return Date.now() - session.startedAtMs;
}

function canRetrySession(session: SttSession, event: any) {
  if (session.ending) return false;
  if (session.retryCount >= 1) return false;
  if (sessionAgeMs(session) >= 30_000) return false;

  const reason = String(event?.reason ?? '').toLowerCase();
  const details = String(event?.errorDetails ?? '').toLowerCase();

  if (reason.includes('endofstream')) return false;
  if (details.includes('authentication') || details.includes('forbidden') || details.includes('invalid')) return false;
  return true;
}

async function rebuildSessionRecognizers(session: SttSession) {
  const SpeechSDK = await getSpeechSdk();
  const { key, region } = getAzureConfig();
  const phrases = await getActivePhrasesCached();

  await closeAllSlots(session);

  session.slots = session.languages.map((language) => createRecognizerSlot(SpeechSDK, language, key, region, phrases));

  for (const slot of session.slots) {
    attachSlotHandlers(session, slot, slot === session.slots[0]);
  }

  await startSlots(session);

  const replay = tailAudioFromRing(session, RETRY_REPLAY_BYTES);
  for (const chunk of replay) {
    for (const slot of session.slots) {
      if (slot.ready) slot.pushStream.write(chunk);
      else if (slot.bufferedBytes < MAX_WARMUP_BUFFER_BYTES) {
        slot.buffered.push(chunk);
        slot.bufferedBytes += chunk.byteLength;
      }
    }
  }
}

async function attemptSessionRetry(session: SttSession, event: any) {
  if (!canRetrySession(session, event)) return false;

  session.retryCount += 1;
  console.warn(`[retry] retrying STT session ${session.sessionId} (attempt=${session.retryCount})`);
  await sleep(RETRY_BACKOFF_MS);

  if (!activeSession || activeSession.sessionId !== session.sessionId || session.ending) return false;
  await rebuildSessionRecognizers(session);
  return true;
}

function feedAudioChunk(session: SttSession, chunk: Buffer) {
  pushAudioToRing(session, chunk);

  for (const slot of session.slots) {
    if (slot.ready) {
      slot.pushStream.write(chunk);
      continue;
    }

    if (slot.bufferedBytes < MAX_WARMUP_BUFFER_BYTES) {
      slot.buffered.push(chunk);
      slot.bufferedBytes += chunk.byteLength;
    }
  }
}

function logSessionPerf(session: SttSession) {
  const durationMs = sessionAgeMs(session);
  const firstPartialMs = session.firstPartialAtMs ? session.firstPartialAtMs - session.startedAtMs : -1;
  const finalMs = session.finalAtMs ? session.finalAtMs - session.startedAtMs : -1;
  const injectMs = session.injectAtMs && session.finalAtMs ? session.injectAtMs - session.finalAtMs : -1;

  console.log(
    `[perf] session_duration_ms=${durationMs} ptt_to_first_partial_ms=${firstPartialMs} ptt_to_final_ms=${finalMs} inject_total_ms=${injectMs} retry_count=${session.retryCount}`,
  );
}

function attachSlotHandlers(session: SttSession, slot: SttSlot, isPrimary: boolean) {
  slot.recognizer.recognizing = (_: unknown, event: any) => {
    if (!isPrimary) return;
    const text = event?.result?.text ?? '';
    if (!text) return;

    if (session.firstPartialAtMs == null) {
      session.firstPartialAtMs = Date.now();
      console.log(`[perf] first_partial_ms=${session.firstPartialAtMs - session.startedAtMs}`);
    }

    broadcast('stt:partial', { sessionId: session.sessionId, text });
  };

  slot.recognizer.recognized = (_: unknown, event: any) => {
    const text = event?.result?.text ?? '';
    if (text) {
      slot.transcriptFinal = `${slot.transcriptFinal}${slot.transcriptFinal ? ' ' : ''}${text}`;
    }

    const json = event?.result?.json;
    if (typeof json !== 'string' || !json) return;

    try {
      const parsed = JSON.parse(json);
      const confidence = parsed?.NBest?.[0]?.Confidence;
      if (typeof confidence === 'number' && Number.isFinite(confidence)) {
        slot.bestConfidence = slot.bestConfidence == null ? confidence : Math.max(slot.bestConfidence, confidence);
      }
    } catch {
      // ignore
    }
  };

  slot.recognizer.canceled = (_: unknown, event: any) => {
    void (async () => {
      if (!activeSession || activeSession.sessionId !== session.sessionId) return;
      if (session.ending) return;

      const retried = await attemptSessionRetry(session, event).catch(() => false);
      if (retried) return;

      const details = event?.errorDetails ? ` (${event.errorDetails})` : '';
      const message = `Azure STT canceled: ${event?.reason ?? 'unknown'}${details}`;
      broadcast('stt:error', { sessionId: session.sessionId, message });
      setHudState({ state: 'error', message });

      session.ending = true;
      clearSessionTimeout(session);
      cancelPendingStop();
      await closeAllSlots(session);

      if (activeSession && activeSession.sessionId === session.sessionId) {
        activeSession = null;
      }

      setHudState({ state: 'idle' });
    })();
  };
}

function pickSessionLanguages(payloadLanguage?: string) {
  const mode: LanguageMode =
    settings.languageMode === 'dual' ? 'dual' : settings.languageMode === 'en-US' ? 'en-US' : 'pt-BR';

  if (mode === 'dual') return ['pt-BR', 'en-US'];
  if (mode === 'en-US') return ['en-US'];
  return [payloadLanguage ?? (process.env.AZURE_SPEECH_LANGUAGE ?? 'pt-BR')];
}

async function startSttSession(
  sender: Electron.WebContents,
  payload: { sessionId: string; language?: string },
): Promise<{ ok: boolean }> {
  if (activeSession) {
    if (activeSession.sessionId === payload.sessionId) return { ok: true };
    throw new Error('A session is already active.');
  }

  const existing = pendingSttStartBySession.get(payload.sessionId);
  if (existing) return await existing;
  if (pendingSttStartBySession.size > 0) {
    throw new Error('A session is already active.');
  }

  const started = (async () => {
    let session: SttSession | null = null;

    try {
      const SpeechSDK = await getSpeechSdk();
      const { key, region, language: defaultLanguage } = getAzureConfig();
      const language = payload.language ?? defaultLanguage;
      const phrases = await getActivePhrasesCached();
      const languages = pickSessionLanguages(language);

      const targetWindowHandle =
        pendingTargetWindowBySession.get(payload.sessionId) ?? (await getForegroundWindowHandle());
      pendingTargetWindowBySession.delete(payload.sessionId);

      session = {
        sessionId: payload.sessionId,
        sender,
        languages,
        slots: [],
        startedAtMs: Date.now(),
        sttStartAtMs: Date.now(),
        sttReadyAtMs: null,
        firstPartialAtMs: null,
        finalAtMs: null,
        injectAtMs: null,
        retryCount: 0,
        ending: false,
        targetWindowHandle,
        audioRing: [],
        audioRingBytes: 0,
        timeoutTimer: null,
      };

      session.slots = languages.map((entry) => createRecognizerSlot(SpeechSDK, entry, key, region, phrases));
      for (const slot of session.slots) {
        attachSlotHandlers(session, slot, slot === session.slots[0]);
      }

      activeSession = session;
      scheduleSessionTimeout(session);
      setHudState({ state: 'listening' });

      await startSlots(session);
      return { ok: true };
    } catch (error) {
      if (session) {
        session.ending = true;
        clearSessionTimeout(session);
        cancelPendingStop();
        await closeAllSlots(session).catch(() => undefined);
        if (activeSession && activeSession.sessionId === session.sessionId) activeSession = null;
      }
      throw error;
    }
  })();

  pendingSttStartBySession.set(payload.sessionId, started);
  try {
    return await started;
  } finally {
    pendingSttStartBySession.delete(payload.sessionId);
  }
}

ipcMain.handle('settings:get', async () => {
  return {
    ...settings,
  };
});

ipcMain.handle('app:runtime-info', async () => {
  return runtimeInfo;
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
      >
    >,
  ) => {
    if (!settingsStore) return { ok: false };
    settings = await settingsStore.update(partial as Partial<AppSettings>);
    markPhraseCacheDirty();
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
  markPhraseCacheDirty();
  return { ok: true, term };
});

ipcMain.handle(
  'dictionary:update',
  async (_event, payload: { id: string; term?: string; hintPt?: string; enabled?: boolean }) => {
    const term = await getDictionaryStore().update(payload);
    markPhraseCacheDirty();
    return { ok: true, term };
  },
);

ipcMain.handle('dictionary:remove', async (_event, payload: { id: string }) => {
  const result = await getDictionaryStore().remove(payload.id);
  markPhraseCacheDirty();
  return result;
});

ipcMain.handle('stt:start', async (event, payload: { sessionId: string; language?: string }) => {
  return await startSttSession(event.sender, payload);
});

ipcMain.on('stt:audio', (_event, payload: { sessionId: string; pcm16kMonoInt16: ArrayBuffer }) => {
  if (!activeSession || activeSession.sessionId !== payload.sessionId) return;
  if (activeSession.ending) return;

  const chunk = Buffer.from(payload.pcm16kMonoInt16);
  feedAudioChunk(activeSession, chunk);
});

ipcMain.handle('stt:stop', async (_event, payload: { sessionId: string }) => {
  if (!activeSession || activeSession.sessionId !== payload.sessionId) {
    return { ok: false };
  }

  const session = activeSession;
  activeSession = null;
  session.ending = true;
  cancelPendingStop();
  clearSessionTimeout(session);

  setHudState({ state: 'finalizing' });

  for (const slot of session.slots) {
    try {
      slot.pushStream.close();
    } catch {
      // ignore
    }
  }

  await Promise.all(
    session.slots.map(
      (slot) =>
        new Promise<void>((resolve, reject) => {
          try {
            slot.recognizer.stopContinuousRecognitionAsync(resolve, reject);
          } catch (error) {
            reject(error);
          }
        }),
    ),
  ).catch(() => {
    // ignore stop failures and continue finalization
  });

  for (const slot of session.slots) {
    try {
      slot.recognizer.close();
    } catch {
      // ignore
    }
  }

  const bestRawText = chooseBestFinalText(session) ?? '';
  const finalText = bestRawText ? postprocessTranscript(bestRawText) : '';

  session.finalAtMs = Date.now();

  if (finalText) {
    broadcast('stt:final', { sessionId: payload.sessionId, text: finalText });
    setHudState({ state: 'injecting' });

    const injection = await injectText(finalText, session.targetWindowHandle);
    session.injectAtMs = Date.now();

    if (injection.skippedReason === 'WINDOW_CHANGED') {
      const message = 'Janela mudou durante o ditado. Texto copiado para colagem manual.';
      emitAppError(message);
      setHudState({ state: 'error', message });
      await sleep(900);
      setHudState({ state: 'idle' });
      logSessionPerf(session);
      return { ok: true, text: finalText };
    }

    if (!injection.pasted) {
      setHudState({ state: 'success', message: 'Texto copiado' });
    } else {
      setHudState({ state: 'success' });
    }

    await sleep(760);
    setHudState({ state: 'idle' });
    logSessionPerf(session);
    return { ok: true, text: finalText };
  }

  setHudState({ state: 'idle' });
  logSessionPerf(session);
  return { ok: true, text: finalText };
});

app.whenReady().then(async () => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.antigravity.voice-note-ai');
  }

  settingsStore = new SettingsStore(path.join(app.getPath('userData'), 'settings.json'), settings);
  settings = await settingsStore.load();
  markPhraseCacheDirty();
  void prewarmStt();

  await createMainWindow();
  await createHudWindow();
  ensureTray();
  attachDisplayListeners();
  applyAdaptiveBounds();
  setHudState({ state: 'idle' });

  try {
    stopHoldHook = await tryStartHoldToTalkHook();
  } catch {
    stopHoldHook = null;
  }

  if (process.platform === 'win32') {
    if (!HOLD_TO_TALK_ENABLED) {
      const message = 'PTT indisponível: VOICE_HOLD_TO_TALK está desativado.';
      setRuntimeBlocked(message);
      emitAppError(message);
      setHudState({ state: 'error', message });
    } else if (!stopHoldHook) {
      const message = 'PTT indisponível: hook global não carregou (uiohook-napi).';
      setRuntimeBlocked(message);
      emitAppError(message);
      setHudState({ state: 'error', message });
    }
  } else if (!stopHoldHook) {
    registerToggleHotkey();
  }

  app.on('browser-window-focus', () => {
    ensureHudAlwaysOnTop();
  });
  app.on('browser-window-blur', () => {
    ensureHudAlwaysOnTop();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createMainWindow();
  });
});

app.on('window-all-closed', () => {
  // Keep running in background (tray + hotkeys) instead of quitting.
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  detachDisplayListeners();
  cancelPendingStop();

  try {
    stopHoldHook?.();
  } catch {
    // ignore
  }
});
