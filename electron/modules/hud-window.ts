import { BrowserWindow, screen } from 'electron';
import { hardenBrowserWindow } from './window-security.js';

const HUD_MIN_WIDTH = 220;
const HUD_MAX_WIDTH = 380;
const HUD_MIN_HEIGHT = 84;
const HUD_MAX_HEIGHT = 136;
const HUD_HOVER_POLL_MS = 70;
const HUD_IDLE_TRIGGER_MIN_WIDTH = 64;
const HUD_IDLE_TRIGGER_MAX_WIDTH = 96;
const HUD_IDLE_TRIGGER_MIN_HEIGHT = 10;
const HUD_IDLE_TRIGGER_MAX_HEIGHT = 18;
const HUD_IDLE_TRIGGER_X_OFFSET_RATIO = -0.11;
const HUD_IDLE_HOLD_MIN_WIDTH = 188;
const HUD_IDLE_HOLD_MAX_WIDTH = 280;
const HUD_IDLE_HOLD_MIN_HEIGHT = 34;
const HUD_IDLE_HOLD_MAX_HEIGHT = 64;
const HUD_IDLE_HOLD_X_OFFSET_RATIO = 0.06;
const HUD_IDLE_HOVER_STABILITY_SAMPLES = 2;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function withTrailingSlash(url: string) {
  return url.endsWith('/') ? url : `${url}/`;
}

function swapLocalhost(url: string) {
  if (url.includes('://localhost')) return url.replace('://localhost', '://127.0.0.1');
  if (url.includes('://127.0.0.1')) return url.replace('://127.0.0.1', '://localhost');
  return null;
}

async function loadUrlWithRetry(
  win: BrowserWindow,
  url: string,
  opts: { label: string; attempts?: number; delayMs?: number } = { label: 'window' },
) {
  const attempts = Math.max(1, opts.attempts ?? 14);
  const delayMs = Math.max(80, opts.delayMs ?? 500);

  let lastError: unknown = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (win.isDestroyed()) throw new Error(`${opts.label} destroyed before load`);
    try {
      await win.loadURL(url);
      return;
    } catch (error) {
      lastError = error;
      await sleep(delayMs);
    }
  }

  const swapped = swapLocalhost(url);
  if (!swapped) {
    throw lastError instanceof Error ? lastError : new Error(`Failed to load ${opts.label}`);
  }

  for (let attempt = 1; attempt <= 6; attempt += 1) {
    if (win.isDestroyed()) throw new Error(`${opts.label} destroyed before load`);
    try {
      await win.loadURL(swapped);
      return;
    } catch (error) {
      lastError = error;
      await sleep(delayMs);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`Failed to load ${opts.label}`);
}

function computeHudBounds(workArea: Electron.Rectangle, scaleFactor: number) {
  const safeScale = clamp(scaleFactor || 1, 1, 1.4);
  const width = Math.round(clamp(260 * safeScale, HUD_MIN_WIDTH, HUD_MAX_WIDTH));
  const height = Math.round(clamp(100 * safeScale, HUD_MIN_HEIGHT, HUD_MAX_HEIGHT));
  const marginBottom = Math.round(clamp(16 * safeScale, 10, 30));

  return {
    x: Math.round(workArea.x + (workArea.width - width) / 2),
    y: Math.round(workArea.y + workArea.height - height - marginBottom),
    width,
    height,
  };
}

type HoverZone = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function createCenteredZone(
  bounds: Electron.Rectangle,
  width: number,
  height: number,
  offsetX = 0,
  offsetY = 0,
): HoverZone {
  return {
    width,
    height,
    x: Math.round(bounds.x + (bounds.width - width) / 2 + offsetX),
    y: Math.round(bounds.y + (bounds.height - height) / 2 + offsetY),
  };
}

function isCursorInsideZone(zone: HoverZone, cursor: Electron.Point) {
  return (
    cursor.x >= zone.x &&
    cursor.x <= zone.x + zone.width &&
    cursor.y >= zone.y &&
    cursor.y <= zone.y + zone.height
  );
}

function computeIdleTriggerZone(bounds: Electron.Rectangle) {
  const width = Math.round(
    clamp(bounds.width * 0.24, HUD_IDLE_TRIGGER_MIN_WIDTH, HUD_IDLE_TRIGGER_MAX_WIDTH),
  );
  const height = Math.round(
    clamp(bounds.height * 0.13, HUD_IDLE_TRIGGER_MIN_HEIGHT, HUD_IDLE_TRIGGER_MAX_HEIGHT),
  );
  const offsetX = Math.round(bounds.width * HUD_IDLE_TRIGGER_X_OFFSET_RATIO);
  return createCenteredZone(bounds, width, height, offsetX, 0);
}

function computeIdleHoldZone(bounds: Electron.Rectangle) {
  const width = Math.round(
    clamp(bounds.width * 0.92, HUD_IDLE_HOLD_MIN_WIDTH, HUD_IDLE_HOLD_MAX_WIDTH),
  );
  const height = Math.round(
    clamp(bounds.height * 0.5, HUD_IDLE_HOLD_MIN_HEIGHT, HUD_IDLE_HOLD_MAX_HEIGHT),
  );
  const offsetX = Math.round(bounds.width * HUD_IDLE_HOLD_X_OFFSET_RATIO);
  return createCenteredZone(bounds, width, height, offsetX, 0);
}

function resolveIdleHover(bounds: Electron.Rectangle, cursor: Electron.Point, hovered: boolean) {
  if (hovered) {
    return isCursorInsideZone(computeIdleHoldZone(bounds), cursor);
  }
  return isCursorInsideZone(computeIdleTriggerZone(bounds), cursor);
}

function nextStableHoverState(
  currentState: boolean,
  candidateState: boolean,
  pendingState: boolean | null,
  stableTicks: number,
) {
  if (candidateState === currentState) {
    return {
      nextState: currentState,
      pendingState: null as boolean | null,
      stableTicks: 0,
      changed: false,
    };
  }

  if (pendingState !== candidateState) {
    return {
      nextState: currentState,
      pendingState: candidateState,
      stableTicks: 1,
      changed: false,
    };
  }

  const nextStableTicks = stableTicks + 1;
  if (nextStableTicks < HUD_IDLE_HOVER_STABILITY_SAMPLES) {
    return {
      nextState: currentState,
      pendingState: candidateState,
      stableTicks: nextStableTicks,
      changed: false,
    };
  }

  return {
    nextState: candidateState,
    pendingState: null as boolean | null,
    stableTicks: 0,
    changed: true,
  };
}

type HudWindowControllerOptions = {
  enabled: boolean;
  debug: boolean;
  devServerUrl?: string;
  getIconPath: () => string | undefined;
  getHudPreloadPath: () => string;
  resolveDistFile: (filename: string) => string;
  getPreferredDisplay: () => Electron.Display;
  onHoverChange: (hovered: boolean) => void;
};

export function createHudWindowController(options: HudWindowControllerOptions) {
  let hudWindow: BrowserWindow | null = null;
  let hudVisible = true;
  let hudHoverPoller: NodeJS.Timeout | null = null;
  let lastHudHoverState = false;
  let pendingHudHoverState: boolean | null = null;
  let hoverStableTicks = 0;

  function emitHudHover(hovered: boolean) {
    if (lastHudHoverState === hovered) return;
    lastHudHoverState = hovered;
    options.onHoverChange(hovered);
  }

  function resetHoverStability() {
    pendingHudHoverState = null;
    hoverStableTicks = 0;
  }

  function stopHudHoverPolling() {
    if (hudHoverPoller) {
      clearInterval(hudHoverPoller);
      hudHoverPoller = null;
    }
    resetHoverStability();
    emitHudHover(false);
  }

  function startHudHoverPolling() {
    if (options.debug || hudHoverPoller) return;
    hudHoverPoller = setInterval(() => {
      if (!hudVisible || !hudWindow || hudWindow.isDestroyed()) {
        resetHoverStability();
        emitHudHover(false);
        return;
      }

      const bounds = hudWindow.getBounds();
      const cursor = screen.getCursorScreenPoint();
      const hovered = resolveIdleHover(bounds, cursor, lastHudHoverState);
      const stabilized = nextStableHoverState(
        lastHudHoverState,
        hovered,
        pendingHudHoverState,
        hoverStableTicks,
      );
      pendingHudHoverState = stabilized.pendingState;
      hoverStableTicks = stabilized.stableTicks;
      if (stabilized.changed) emitHudHover(stabilized.nextState);
    }, HUD_HOVER_POLL_MS);
  }

  function ensureHudAlwaysOnTop() {
    if (!hudWindow || hudWindow.isDestroyed()) return;
    hudWindow.setAlwaysOnTop(true, 'screen-saver');
    hudWindow.moveTop();
  }

  async function createHudWindow() {
    if (!options.enabled) return null;
    if (hudWindow && !hudWindow.isDestroyed()) return hudWindow;

    const display = options.getPreferredDisplay();
    hudWindow = new BrowserWindow({
      ...computeHudBounds(display.workArea, display.scaleFactor),
      show: false,
      frame: options.debug,
      transparent: !options.debug,
      resizable: false,
      movable: false,
      focusable: options.debug,
      skipTaskbar: !options.debug,
      alwaysOnTop: true,
      hasShadow: options.debug,
      backgroundColor: options.debug ? '#111111' : '#00000000',
      icon: options.getIconPath(),
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
        allowRunningInsecureContent: false,
        preload: options.getHudPreloadPath(),
      },
    });
    hardenBrowserWindow(hudWindow, options.devServerUrl);

    if (!options.debug) hudWindow.setIgnoreMouseEvents(true, { forward: true });
    hudWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    ensureHudAlwaysOnTop();
    startHudHoverPolling();

    hudWindow.webContents.once('did-finish-load', () => {
      if (!hudWindow || hudWindow.isDestroyed()) return;
      if (hudVisible) {
        hudWindow.showInactive();
        ensureHudAlwaysOnTop();
      }
      if (options.debug) hudWindow.webContents.openDevTools({ mode: 'detach' });
    });

    hudWindow.on('closed', () => {
      stopHudHoverPolling();
      hudWindow = null;
    });

    if (options.devServerUrl) {
      const base = withTrailingSlash(options.devServerUrl);
      await loadUrlWithRetry(hudWindow, `${base}hud.html`, { label: 'hud window' });
    } else {
      await hudWindow.loadFile(options.resolveDistFile('hud.html'));
    }

    return hudWindow;
  }

  function setHudVisible(next: boolean) {
    hudVisible = next;
    if (!hudWindow || hudWindow.isDestroyed()) return;
    if (hudVisible) {
      hudWindow.showInactive();
      ensureHudAlwaysOnTop();
      startHudHoverPolling();
      return;
    }
    stopHudHoverPolling();
    hudWindow.hide();
  }

  function applyHudBounds(display: Electron.Display) {
    if (!hudWindow || hudWindow.isDestroyed()) return;
    hudWindow.setBounds(computeHudBounds(display.workArea, display.scaleFactor), false);
    ensureHudAlwaysOnTop();
  }

  return {
    createHudWindow,
    setHudVisible,
    applyHudBounds,
    ensureHudAlwaysOnTop,
    stopHudHoverPolling,
    getHudWindow: () => hudWindow,
    isHudVisible: () => hudVisible,
  };
}
