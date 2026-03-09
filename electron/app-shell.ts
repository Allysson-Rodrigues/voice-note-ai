import { app, BrowserWindow, Menu, screen, Tray } from "electron";
import { existsSync } from "node:fs";
import path from "node:path";
import { createHudWindowController } from "./modules/hud-window.js";
import { applyMainWindowBounds } from "./modules/main-window.js";
import type { HudState } from "./modules/stt-session-support.js";

type AppShellOptions = {
  appName: string;
  appDirname: string;
  devServerUrl?: string;
  hudEnabled: boolean;
  hudDebug: boolean;
  isQuitting: () => boolean;
  requestQuit: () => void;
  onHudHoverChange?: (hovered: boolean) => void;
};

export function createAppShell({
  appName,
  appDirname,
  devServerUrl,
  hudEnabled,
  hudDebug,
  isQuitting,
  requestQuit,
  onHudHoverChange,
}: AppShellOptions) {
  let mainWindow: BrowserWindow | null = null;
  let tray: Tray | null = null;
  let displayListenersAttached = false;

  function resolveDistFile(filename: string) {
    return path.join(appDirname, "..", "dist", filename);
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
          path.join(appDirname, "..", "public", "favicon.ico"),
        ]
      : [
          path.join(process.cwd(), "public", "favicon.ico"),
          path.join(app.getAppPath(), "public", "favicon.ico"),
          path.join(appDirname, "..", "public", "favicon.ico"),
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
    return path.join(appDirname, "..", "electron", "preload.cjs");
  }

  function getHudPreloadPath() {
    if (!app.isPackaged) {
      const local = path.join(process.cwd(), "electron", "hud-preload.cjs");
      if (existsSync(local)) return local;
    }
    return path.join(appDirname, "..", "electron", "hud-preload.cjs");
  }

  const hudController = createHudWindowController({
    enabled: hudEnabled,
    debug: hudDebug,
    devServerUrl,
    getIconPath,
    getHudPreloadPath,
    resolveDistFile,
    getPreferredDisplay,
    onHoverChange: (hovered) => {
      onHudHoverChange?.(hovered);
    },
  });

  function broadcast(channel: string, payload: unknown) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, payload);
    }
    const hudWindow = hudController.getHudWindow();
    if (hudWindow && !hudWindow.isDestroyed()) {
      hudWindow.webContents.send(channel, payload);
    }
  }

  function setHudState(state: HudState) {
    broadcast("hud:state", state);
  }

  function emitAppError(message: string) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("app:error", { message });
    }
    if (tray) {
      tray.setToolTip(`${appName} - ${message}`);
    }
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

  function ensureTray() {
    if (tray) return;
    const iconPath = getIconPath();
    if (!iconPath) return;

    tray = new Tray(iconPath);
    tray.setToolTip(appName);

    tray.on("click", () => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
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
            if (mainVisible) {
              mainWindow?.hide();
            } else {
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
            if (isQuitting()) return;
            requestQuit();
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

  return {
    getMainWindow: () => mainWindow,
    setMainWindow: (window: BrowserWindow | null) => {
      mainWindow = window;
    },
    getIconPath,
    getPreloadPath,
    getHudPreloadPath,
    getPreferredDisplay,
    resolveDistFile,
    hudController,
    broadcast,
    setHudState,
    emitAppError,
    applyAdaptiveBounds,
    attachDisplayListeners,
    detachDisplayListeners,
    ensureTray,
    destroyTray: () => {
      try {
        tray?.destroy();
      } catch {
        // ignore
      }
      tray = null;
    },
  };
}

export type AppShell = ReturnType<typeof createAppShell>;
