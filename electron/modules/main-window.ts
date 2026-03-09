import { BrowserWindow } from "electron";
import { hardenBrowserWindow } from "./window-security.js";

const MAIN_WINDOW_MIN_WIDTH = 860;
const MAIN_WINDOW_MAX_WIDTH = 1400;
const MAIN_WINDOW_MIN_HEIGHT = 620;
const MAIN_WINDOW_MAX_HEIGHT = 980;
const MAIN_WINDOW_WIDTH_FACTOR = 0.8;
const MAIN_WINDOW_HEIGHT_FACTOR = 0.86;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function withTrailingSlash(url: string) {
  return url.endsWith("/") ? url : `${url}/`;
}

function swapLocalhost(url: string) {
  if (url.includes("://localhost"))
    return url.replace("://localhost", "://127.0.0.1");
  if (url.includes("://127.0.0.1"))
    return url.replace("://127.0.0.1", "://localhost");
  return null;
}

async function loadUrlWithRetry(
  win: BrowserWindow,
  url: string,
  opts: { label: string; attempts?: number; delayMs?: number } = {
    label: "window",
  },
) {
  const attempts = Math.max(1, opts.attempts ?? 14);
  const delayMs = Math.max(80, opts.delayMs ?? 500);

  let lastError: unknown = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (win.isDestroyed())
      throw new Error(`${opts.label} destroyed before load`);
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
    throw lastError instanceof Error
      ? lastError
      : new Error(`Failed to load ${opts.label}`);
  }

  for (let attempt = 1; attempt <= 6; attempt += 1) {
    if (win.isDestroyed())
      throw new Error(`${opts.label} destroyed before load`);
    try {
      await win.loadURL(swapped);
      return;
    } catch (error) {
      lastError = error;
      await sleep(delayMs);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`Failed to load ${opts.label}`);
}

function computeMainWindowBounds(
  workArea: Electron.Rectangle,
): Electron.Rectangle {
  const width = Math.round(
    clamp(
      workArea.width * MAIN_WINDOW_WIDTH_FACTOR,
      MAIN_WINDOW_MIN_WIDTH,
      MAIN_WINDOW_MAX_WIDTH,
    ),
  );
  const height = Math.round(
    clamp(
      workArea.height * MAIN_WINDOW_HEIGHT_FACTOR,
      MAIN_WINDOW_MIN_HEIGHT,
      MAIN_WINDOW_MAX_HEIGHT,
    ),
  );
  return {
    x: Math.round(workArea.x + (workArea.width - width) / 2),
    y: Math.round(workArea.y + (workArea.height - height) / 2),
    width,
    height,
  };
}

export function applyMainWindowBounds(
  mainWindow: BrowserWindow,
  workArea: Electron.Rectangle,
) {
  if (
    mainWindow.isDestroyed() ||
    mainWindow.isMaximized() ||
    mainWindow.isFullScreen()
  )
    return;
  const nextBounds = computeMainWindowBounds(workArea);
  mainWindow.setBounds(nextBounds, false);
  mainWindow.setMinimumSize(MAIN_WINDOW_MIN_WIDTH, MAIN_WINDOW_MIN_HEIGHT);
}

type CreateMainWindowOptions = {
  devServerUrl?: string;
  getIconPath: () => string | undefined;
  getPreloadPath: () => string;
  resolveDistFile: (filename: string) => string;
  isQuitting: () => boolean;
  getPreferredDisplay: () => Electron.Display;
};

export async function createMainWindow(options: CreateMainWindowOptions) {
  const bounds = computeMainWindowBounds(
    options.getPreferredDisplay().workArea,
  );
  const mainWindow = new BrowserWindow({
    ...bounds,
    frame: false,
    roundedCorners: true,
    thickFrame: true,
    backgroundColor: "#0a0a0c",
    minWidth: MAIN_WINDOW_MIN_WIDTH,
    minHeight: MAIN_WINDOW_MIN_HEIGHT,
    show: true,
    icon: options.getIconPath(),
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      preload: options.getPreloadPath(),
    },
  });
  hardenBrowserWindow(mainWindow, options.devServerUrl);

  mainWindow.on("close", (event) => {
    if (options.isQuitting()) return;
    event.preventDefault();
    mainWindow.hide();
  });

  if (options.devServerUrl) {
    await loadUrlWithRetry(
      mainWindow,
      withTrailingSlash(options.devServerUrl),
      {
        label: "main window",
      },
    );
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    await mainWindow.loadFile(options.resolveDistFile("index.html"));
  }

  return mainWindow;
}
