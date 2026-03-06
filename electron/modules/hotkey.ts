import { globalShortcut } from 'electron';
import { randomUUID } from 'node:crypto';

type HotkeyMode = 'hold' | 'toggle-primary' | 'toggle-fallback' | 'unavailable';
type RuntimeInfo = {
  hotkeyLabel: string;
  hotkeyMode: HotkeyMode;
  holdToTalkActive: boolean;
  holdRequired: boolean;
  captureBlockedReason?: string;
};

type HudState = {
  state: 'idle' | 'listening' | 'finalizing' | 'injecting' | 'success' | 'error';
  message?: string;
};

type UiohookKeyEvent = {
  keycode?: number;
  ctrlKey?: boolean;
  metaKey?: boolean;
};

type UiohookInstance = {
  on: (event: 'keydown' | 'keyup' | 'error', listener: (payload: unknown) => void) => void;
  off?: (event: 'keydown' | 'keyup' | 'error', listener: (payload: unknown) => void) => void;
  start: () => void;
  stop?: () => void;
};

type UiohookImport = {
  uIOhook?: UiohookInstance;
  default?: UiohookInstance | { uIOhook?: UiohookInstance };
};

function resolveUiohookInstance(mod: UiohookImport): UiohookInstance | null {
  const defaultExport = mod.default;
  if (defaultExport && 'on' in defaultExport && 'start' in defaultExport) {
    return defaultExport;
  }
  if (defaultExport && 'uIOhook' in defaultExport) {
    return defaultExport.uIOhook ?? null;
  }
  return mod.uIOhook ?? null;
}

type HotkeyServiceOptions = {
  primaryHotkey: string;
  fallbackHotkey: string;
  holdToTalkEnabled: boolean;
  holdHookRecoveryRetryMs: number;
  getRuntimeInfo: () => RuntimeInfo;
  updateRuntimeInfo: (next: RuntimeInfo) => void;
  setRuntimeBlocked: (reason?: string) => void;
  refreshCaptureBlockedReason: () => string | null | undefined;
  setHudState: (state: HudState) => void;
  emitAppError: (message: string) => void;
  sendCaptureStart: (payload: { sessionId: string; sttWarmStart: boolean }) => void;
  sendCaptureStop: (payload: { sessionId: string }) => void;
  sendSttError: (payload: { sessionId: string; message: string }) => void;
  hasActiveSession: () => boolean;
  getActiveSessionId: () => string | null;
  onStartSession: (sessionId: string) => Promise<void>;
  onPrimeTargetWindow: (sessionId: string) => Promise<void>;
  onReleaseActiveSession: (sessionId: string) => void;
  isQuitting: () => boolean;
};

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

export function createHotkeyService(options: HotkeyServiceOptions) {
  let stopHoldHook: null | (() => void) = null;
  let holdHookRecoveryTimer: NodeJS.Timeout | null = null;

  function stopHoldHookRecovery() {
    if (!holdHookRecoveryTimer) return;
    clearInterval(holdHookRecoveryTimer);
    holdHookRecoveryTimer = null;
  }

  function scheduleHoldHookRecovery() {
    if (process.platform !== 'win32' || !options.holdToTalkEnabled || holdHookRecoveryTimer) return;

    holdHookRecoveryTimer = setInterval(() => {
      if (stopHoldHook || options.isQuitting()) return;

      void tryStartHoldToTalkHook()
        .then((stopper) => {
          if (!stopper) return;
          stopHoldHook = stopper;
          options.refreshCaptureBlockedReason();
          options.setHudState({ state: 'idle' });
          stopHoldHookRecovery();
        })
        .catch(() => {
          // keep retry loop alive
        });
    }, options.holdHookRecoveryRetryMs);
  }

  function onSessionStartError(sessionId: string, error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    options.sendSttError({ sessionId, message });
    options.setHudState({ state: 'error', message });
    options.emitAppError(message);
    options.sendCaptureStop({ sessionId });
  }

  function startSessionFromHotkey() {
    const blockedReason = options.refreshCaptureBlockedReason();
    if (blockedReason) {
      options.setHudState({ state: 'error', message: blockedReason });
      options.emitAppError(blockedReason);
      return;
    }

    if (options.hasActiveSession()) {
      const activeSessionId = options.getActiveSessionId();
      if (activeSessionId) options.onReleaseActiveSession(activeSessionId);
      return;
    }

    const sessionId = randomUUID();
    void options.onPrimeTargetWindow(sessionId);
    void options
      .onStartSession(sessionId)
      .then(() => undefined)
      .catch((error) => {
        onSessionStartError(sessionId, error);
      });

    options.sendCaptureStart({ sessionId, sttWarmStart: true });
    options.setHudState({ state: 'listening' });
  }

  function registerToggleHotkey() {
    globalShortcut.unregisterAll();

    const primaryOk = globalShortcut.register(options.primaryHotkey, startSessionFromHotkey);
    if (primaryOk) {
      options.updateRuntimeInfo({
        ...options.getRuntimeInfo(),
        hotkeyLabel: acceleratorToLabel(options.primaryHotkey),
        hotkeyMode: 'toggle-primary',
        holdToTalkActive: false,
        holdRequired: false,
      });
      return;
    }

    const fallbackOk = globalShortcut.register(options.fallbackHotkey, startSessionFromHotkey);
    if (fallbackOk) {
      options.updateRuntimeInfo({
        ...options.getRuntimeInfo(),
        hotkeyLabel: acceleratorToLabel(options.fallbackHotkey),
        hotkeyMode: 'toggle-fallback',
        holdToTalkActive: false,
        holdRequired: false,
      });
      return;
    }

    const errorMessage = `Nao foi possivel registrar hotkey global (${options.primaryHotkey} ou ${options.fallbackHotkey}).`;
    options.setRuntimeBlocked(errorMessage);
    options.emitAppError(errorMessage);
    options.setHudState({ state: 'error', message: errorMessage });
  }

  async function tryStartHoldToTalkHook() {
    if (!options.holdToTalkEnabled) return null;
    if (process.platform !== 'win32') return null;

    let uiohookMod: UiohookImport;
    try {
      uiohookMod = (await import('uiohook-napi')) as UiohookImport;
    } catch {
      return null;
    }

    const uIOhook = resolveUiohookInstance(uiohookMod);
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

      if (chordActive) {
        const blockedReason = options.refreshCaptureBlockedReason();
        if (blockedReason) {
          options.setHudState({ state: 'error', message: blockedReason });
          options.emitAppError(blockedReason);
          return;
        }
        if (options.hasActiveSession()) return;

        const sessionId = randomUUID();
        void options.onPrimeTargetWindow(sessionId);
        void options
          .onStartSession(sessionId)
          .then(() => undefined)
          .catch((error) => {
            onSessionStartError(sessionId, error);
          });

        options.sendCaptureStart({ sessionId, sttWarmStart: true });
        options.setHudState({ state: 'listening' });
        return;
      }

      const activeSessionId = options.getActiveSessionId();
      if (!activeSessionId) return;
      options.onReleaseActiveSession(activeSessionId);
    }

    const onKeyDown = (event: unknown) => {
      const keyEvent = event as UiohookKeyEvent;
      if (typeof keyEvent.keycode === 'number') pressed.add(keyEvent.keycode);
      ctrlDown = Boolean(keyEvent.ctrlKey) || pressed.has(29) || pressed.has(3613);
      metaDown = Boolean(keyEvent.metaKey) || pressed.has(3675) || pressed.has(3676);
      recomputeChordActive();
    };

    const onKeyUp = (event: unknown) => {
      const keyEvent = event as UiohookKeyEvent;
      if (typeof keyEvent.keycode === 'number') pressed.delete(keyEvent.keycode);
      ctrlDown = Boolean(keyEvent.ctrlKey);
      metaDown = Boolean(keyEvent.metaKey);
      recomputeChordActive();
    };

    const onHookError = (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error ?? 'unknown');
      const errorMessage = `Hook global falhou: ${message}`;
      stopHoldHook = null;
      options.emitAppError(errorMessage);
      options.setRuntimeBlocked(errorMessage);
      options.setHudState({ state: 'error', message: errorMessage });
      scheduleHoldHookRecovery();
    };

    uIOhook.on('keydown', onKeyDown);
    uIOhook.on('keyup', onKeyUp);
    if (typeof uIOhook.on === 'function') {
      uIOhook.on('error', onHookError);
    }
    uIOhook.start();

    options.updateRuntimeInfo({
      ...options.getRuntimeInfo(),
      hotkeyLabel: acceleratorToLabel(options.primaryHotkey),
      hotkeyMode: 'hold',
      holdToTalkActive: true,
      holdRequired: true,
    });
    stopHoldHookRecovery();
    options.refreshCaptureBlockedReason();

    return () => {
      try {
        if (typeof uIOhook.off === 'function') {
          uIOhook.off('keydown', onKeyDown);
          uIOhook.off('keyup', onKeyUp);
          uIOhook.off('error', onHookError);
        }
        if (uIOhook.stop) uIOhook.stop();
      } catch {
        // ignore
      }
    };
  }

  async function retryHoldHook() {
    if (process.platform !== 'win32') {
      return { ok: false, message: 'Recuperacao de hook e suportada apenas no Windows.' };
    }
    if (!options.holdToTalkEnabled) {
      return { ok: false, message: 'VOICE_HOLD_TO_TALK esta desativado.' };
    }
    if (stopHoldHook) {
      options.refreshCaptureBlockedReason();
      return { ok: true, message: 'Hook global ja esta ativo.' };
    }

    try {
      const stopper = await tryStartHoldToTalkHook();
      if (!stopper) {
        const message = 'Falha ao inicializar hook global (uiohook-napi).';
        options.setRuntimeBlocked(message);
        options.setHudState({ state: 'error', message });
        options.emitAppError(message);
        scheduleHoldHookRecovery();
        return { ok: false, message };
      }

      stopHoldHook = stopper;
      options.refreshCaptureBlockedReason();
      options.setHudState({ state: 'idle' });
      stopHoldHookRecovery();
      return { ok: true, message: 'Hook global recuperado com sucesso.' };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      options.setRuntimeBlocked(message);
      options.setHudState({ state: 'error', message });
      options.emitAppError(message);
      scheduleHoldHookRecovery();
      return { ok: false, message };
    }
  }

  function setStopHoldHook(stopper: (() => void) | null) {
    stopHoldHook = stopper;
  }

  function getStopHoldHook() {
    return stopHoldHook;
  }

  function stop() {
    stopHoldHookRecovery();
    try {
      stopHoldHook?.();
    } catch {
      // ignore
    }
    stopHoldHook = null;
  }

  return {
    registerToggleHotkey,
    tryStartHoldToTalkHook,
    retryHoldHook,
    scheduleHoldHookRecovery,
    stopHoldHookRecovery,
    setStopHoldHook,
    getStopHoldHook,
    stop,
  };
}
