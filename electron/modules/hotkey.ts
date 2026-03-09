import { globalShortcut } from 'electron';
import { randomUUID } from 'node:crypto';
import { hotkeyLabelFromAccelerator, parseHoldHotkeyChord } from '../hotkey-config.js';

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
  altKey?: boolean;
  shiftKey?: boolean;
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
  getPrimaryHotkey: () => string;
  getFallbackHotkey: () => string;
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

export function createHotkeyService(options: HotkeyServiceOptions) {
  let stopHoldHook: null | (() => void) = null;
  let holdHookRecoveryTimer: NodeJS.Timeout | null = null;

  function resolveHotkeys(overrides?: { primaryHotkey?: string; fallbackHotkey?: string }) {
    return {
      primaryHotkey: overrides?.primaryHotkey ?? options.getPrimaryHotkey(),
      fallbackHotkey: overrides?.fallbackHotkey ?? options.getFallbackHotkey(),
    };
  }

  function reportHotkeyFailure(message: string) {
    options.setRuntimeBlocked(message);
    options.emitAppError(message);
    options.setHudState({ state: 'error', message });
    return { ok: false as const, message };
  }

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

  function registerToggleHotkey(hotkeys = resolveHotkeys()) {
    globalShortcut.unregisterAll();
    const { primaryHotkey, fallbackHotkey } = hotkeys;

    const primaryOk = globalShortcut.register(primaryHotkey, startSessionFromHotkey);
    if (primaryOk) {
      options.updateRuntimeInfo({
        ...options.getRuntimeInfo(),
        hotkeyLabel: hotkeyLabelFromAccelerator(primaryHotkey),
        hotkeyMode: 'toggle-primary',
        holdToTalkActive: false,
        holdRequired: false,
      });
      return { ok: true as const };
    }

    const fallbackOk = globalShortcut.register(fallbackHotkey, startSessionFromHotkey);
    if (fallbackOk) {
      options.updateRuntimeInfo({
        ...options.getRuntimeInfo(),
        hotkeyLabel: hotkeyLabelFromAccelerator(fallbackHotkey),
        hotkeyMode: 'toggle-fallback',
        holdToTalkActive: false,
        holdRequired: false,
      });
      return { ok: true as const };
    }

    const errorMessage = `Nao foi possivel registrar hotkey global (${primaryHotkey} ou ${fallbackHotkey}).`;
    return reportHotkeyFailure(errorMessage);
  }

  async function tryStartHoldToTalkHook(primaryHotkey = options.getPrimaryHotkey()) {
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

    const chord = parseHoldHotkeyChord(primaryHotkey);
    const pressed = new Set<number>();
    let chordActive = false;
    let ctrlDown = false;
    let altDown = false;
    let shiftDown = false;
    let metaDown = false;

    function recomputeChordActive() {
      const modifiersActive =
        (!chord.ctrl || ctrlDown) &&
        (!chord.alt || altDown) &&
        (!chord.shift || shiftDown) &&
        (!chord.meta || metaDown);
      const keysActive = chord.keys.every((keycode) => pressed.has(keycode));
      const next = modifiersActive && keysActive;
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
      altDown = Boolean(keyEvent.altKey) || pressed.has(56) || pressed.has(3640);
      shiftDown = Boolean(keyEvent.shiftKey) || pressed.has(42) || pressed.has(54);
      metaDown = Boolean(keyEvent.metaKey) || pressed.has(3675) || pressed.has(3676);
      recomputeChordActive();
    };

    const onKeyUp = (event: unknown) => {
      const keyEvent = event as UiohookKeyEvent;
      if (typeof keyEvent.keycode === 'number') pressed.delete(keyEvent.keycode);
      ctrlDown = Boolean(keyEvent.ctrlKey);
      altDown = Boolean(keyEvent.altKey);
      shiftDown = Boolean(keyEvent.shiftKey);
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
      hotkeyLabel: hotkeyLabelFromAccelerator(chord.accelerator),
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
      return { ok: false, message: 'O modo segurar para falar esta desativado.' };
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
    globalShortcut.unregisterAll();
    try {
      stopHoldHook?.();
    } catch {
      // ignore
    }
    stopHoldHook = null;
  }

  function validateHotkeyConfiguration(hotkeys = resolveHotkeys()) {
    if (process.platform === 'win32' && options.holdToTalkEnabled) {
      try {
        parseHoldHotkeyChord(hotkeys.primaryHotkey);
      } catch (error) {
        return {
          ok: false as const,
          message: error instanceof Error ? error.message : String(error),
        };
      }
    }

    return { ok: true as const };
  }

  async function reloadHotkeys(overrides?: { primaryHotkey?: string; fallbackHotkey?: string }) {
    const hotkeys = resolveHotkeys(overrides);
    const validation = validateHotkeyConfiguration(hotkeys);
    if (!validation.ok) {
      return reportHotkeyFailure(validation.message);
    }

    stop();

    if (process.platform === 'win32') {
      if (!options.holdToTalkEnabled) {
        const message = 'PTT indisponivel: o modo segurar para falar esta desativado.';
        return reportHotkeyFailure(message);
      }

      try {
        const stopper = await tryStartHoldToTalkHook(hotkeys.primaryHotkey);
        setStopHoldHook(stopper);
        if (stopper) {
          options.setHudState({ state: 'idle' });
          return { ok: true as const };
        }
      } catch {
        setStopHoldHook(null);
      }

      const message = 'PTT indisponivel: hook global nao carregou (uiohook-napi).';
      reportHotkeyFailure(message);
      scheduleHoldHookRecovery();
      return { ok: false as const, message };
    }

    return registerToggleHotkey(hotkeys);
  }

  return {
    registerToggleHotkey,
    tryStartHoldToTalkHook,
    validateHotkeyConfiguration,
    retryHoldHook,
    reloadHotkeys,
    scheduleHoldHookRecovery,
    stopHoldHookRecovery,
    setStopHoldHook,
    getStopHoldHook,
    stop,
  };
}
