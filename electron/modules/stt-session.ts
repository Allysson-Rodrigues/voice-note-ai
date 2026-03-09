import type { BrowserWindow, IpcMain } from 'electron';
import {
  MAX_PCM_CHUNK_BYTES,
  MIN_AUDIO_CHUNK_INTERVAL_MS,
  validateSttAudioPayload,
  validateSttStartPayload,
  validateSttStopPayload,
} from '../ipc-validation.js';
import { logInfo, logPerf, logWarn } from '../logger.js';
import type { AppProfile, AppSettings } from '../settings-store.js';
import type { InjectResult } from './text-injection.js';
import { createSttProvider } from './stt/stt-factory.js';
import type { SttProvider, SttResult } from './stt/types.js';
import type { TranscriptIntent } from './transcript-intent.js';

const HUD_SUCCESS_VISIBLE_MS = 1100;
const HUD_ERROR_VISIBLE_MS = 900;

type HudVisualState = 'idle' | 'listening' | 'finalizing' | 'injecting' | 'success' | 'error';
type HudState = {
  state: HudVisualState;
  message?: string;
};

type SessionLanguage = 'pt-BR' | 'en-US' | 'dual';

type SttSession = {
  sessionId: string;
  sender: Electron.WebContents;
  provider: SttProvider;
  startedAtMs: number;
  sttReadyAtMs: number | null;
  firstPartialAtMs: number | null;
  finalAtMs: number | null;
  injectAtMs: number | null;
  retryCount: number;
  ending: boolean;
  targetWindowHandle: string | null;
  appKey: string | null;
  timeoutTimer: NodeJS.Timeout | null;
  lastAudioChunkAtMs: number | null;
  audioThrottleDrops: number;
  timedOut: boolean;
  lastResult?: SttResult;
};

type PostprocessResult = {
  text: string;
  appliedRules: string[];
  intent: TranscriptIntent;
  rewriteApplied: boolean;
  rewriteRisk: 'low' | 'medium' | 'high';
};

type SessionCompletedEntry = {
  sessionId: string;
  text: string;
  rawText: string;
  pasted: boolean;
  skippedReason?: InjectResult['skippedReason'];
  pttToFirstPartialMs?: number;
  pttToFinalMs?: number;
  retryCount: number;
  sessionDurationMs: number;
  injectTotalMs: number;
  resolveWindowMs?: number;
  pasteAttemptMs?: number;
  clipboardRestoreMs?: number;
  languageChosen: string;
  confidenceBucket: 'high' | 'medium' | 'low';
  appKey?: string | null;
  intent: TranscriptIntent;
  appliedRules?: string[];
  rewriteApplied: boolean;
  rewriteRisk: 'low' | 'medium' | 'high';
  injectionMethod?: InjectResult['method'];
};

type SttSessionManager = {
  markPhraseCacheDirty: () => void;
  invalidateRuntimeCaches: () => void;
  prewarmStt: () => Promise<void>;
  primeTargetWindowForSession: (sessionId: string) => Promise<void>;
  startSessionFromHotkey: (sender: Electron.WebContents, sid: string) => Promise<{ ok: boolean }>;
  getActiveSessionId: () => string | null;
  hasActiveSession: () => boolean;
  scheduleStop: (sessionId: string) => void;
  cancelPendingStop: () => void;
  registerIpcHandlers: (ipcMain: IpcMain) => void;
  getPhraseBoostCount: () => Promise<number>;
  dispose: () => void;
};

type SttSessionManagerOptions = {
  isPackagedApp: boolean;
  getSettings: () => AppSettings;
  getAzureCredentials: () => { key: string; region: string };
  getCaptureBlockedReason: () => string | null | undefined;
  broadcast: (channel: string, payload: unknown) => void;
  setHudState: (state: HudState) => void;
  emitAppError: (message: string) => void;
  postprocessTranscript: (args: {
    rawText: string;
    language: 'pt-BR' | 'en-US';
    appKey?: string | null;
    confidence?: number;
  }) => Promise<PostprocessResult>;
  getMainWindow: () => BrowserWindow | null;
  getForegroundWindowHandle: () => Promise<string | null>;
  getWindowAppKey?: (handle: string | null) => Promise<string | null>;
  resolveInjectionTargetWindowHandle: (
    sessionTargetWindowHandle: string | null,
  ) => Promise<string | null>;
  injectText: (
    text: string,
    targetWindowHandle: string | null,
    request?: { forceCopyOnly?: boolean },
  ) => Promise<InjectResult>;
  getDictionaryPhrases: (seedPhrases: string[]) => Promise<string[]>;
  onSessionCompleted?: (entry: SessionCompletedEntry) => Promise<void> | void;
  getAppProfile?: (appKey: string | null) => AppProfile | undefined;
  resolveLowConfidencePolicy?: (confidence?: number) => 'paste' | 'copy-only' | 'review';
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export function createSttSessionManager(options: SttSessionManagerOptions): SttSessionManager {
  let activeSession: SttSession | null = null;
  let prewarmedProvider: SttProvider | null = null;
  let prewarmPromise: Promise<void> | null = null;
  let prewarmedConfigSignature: string | null = null;
  let phraseCache: string[] | null = null;
  let phraseCacheDirty = true;
  let lastPhraseBoostCount = 0;
  let pendingStopTimer: NodeJS.Timeout | null = null;
  let pendingStopSessionId: string | null = null;

  const pendingSttStartBySession = new Map<string, Promise<{ ok: boolean }>>();
  const pendingTargetWindowBySession = new Map<string, string | null>();

  function isCurrentSession(sessionId: string) {
    return Boolean(activeSession && activeSession.sessionId === sessionId);
  }

  function isCurrentSessionOwner(sender: Electron.WebContents, sessionId: string) {
    return Boolean(
      activeSession &&
      activeSession.sessionId === sessionId &&
      !activeSession.sender.isDestroyed?.() &&
      activeSession.sender.id === sender.id,
    );
  }

  function setHudStateIfCurrent(sessionId: string, state: HudState) {
    if (!isCurrentSession(sessionId)) return false;
    options.setHudState(state);
    return true;
  }

  function releaseActiveSession(sessionId: string) {
    if (activeSession && activeSession.sessionId === sessionId) {
      clearSessionTimeout(activeSession);
      activeSession = null;
    }
  }

  function getAzureConfigSignature(config: { key: string; region: string }) {
    return `${config.region}::${config.key.slice(0, 12)}`;
  }

  function resolveSessionLanguage(
    payloadLanguage: string | undefined,
    settings: AppSettings,
    appProfile: AppProfile | undefined,
  ): SessionLanguage {
    if (payloadLanguage === 'pt-BR' || payloadLanguage === 'en-US') {
      return payloadLanguage;
    }

    if (appProfile?.languageBias === 'mixed') {
      return 'dual';
    }
    if (appProfile?.languageBias === 'pt-BR' || appProfile?.languageBias === 'en-US') {
      return appProfile.languageBias;
    }

    return settings.languageMode;
  }

  function clearSessionTimeout(session: SttSession | null) {
    if (!session?.timeoutTimer) return;
    clearTimeout(session.timeoutTimer);
    session.timeoutTimer = null;
  }

  function armSessionTimeout(session: SttSession) {
    clearSessionTimeout(session);
    const maxSessionSeconds = clamp(options.getSettings().maxSessionSeconds, 30, 600);
    session.timeoutTimer = setTimeout(() => {
      if (!isCurrentSession(session.sessionId) || session.ending) return;
      session.timedOut = true;
      session.ending = true;
      const message = `Sessão encerrada após ${maxSessionSeconds} s para evitar captura contínua.`;
      options.broadcast('stt:error', { sessionId: session.sessionId, message });
      options.emitAppError(message);
      options.setHudState({ state: 'error', message });

      const mainWindow = options.getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('capture:stop', { sessionId: session.sessionId });
      }
    }, maxSessionSeconds * 1000);
  }

  async function failSession(session: SttSession, message: string) {
    if (!isCurrentSession(session.sessionId) || session.ending) return;
    session.ending = true;
    clearSessionTimeout(session);
    options.broadcast('stt:error', { sessionId: session.sessionId, message });
    options.setHudState({ state: 'error', message });
    options.emitAppError(message);

    try {
      if (!session.sender.isDestroyed?.()) {
        session.sender.send('capture:stop', { sessionId: session.sessionId });
      }
    } catch {
      // ignore renderer stop propagation failures
    }

    try {
      await session.provider.stop(session.sessionId);
    } catch {
      // provider may already be faulted; cleanup still needs to continue
    } finally {
      releaseActiveSession(session.sessionId);
      if (!activeSession) void prewarmStt();
    }
  }

  function cancelPendingStop() {
    if (pendingStopTimer) clearTimeout(pendingStopTimer);
    pendingStopTimer = null;
    pendingStopSessionId = null;
  }

  function scheduleStop(sessionId: string) {
    cancelPendingStop();
    pendingStopSessionId = sessionId;
    const ms = Math.max(0, Math.min(2000, options.getSettings().stopGraceMs));

    pendingStopTimer = setTimeout(() => {
      pendingStopTimer = null;
      const sid = pendingStopSessionId;
      pendingStopSessionId = null;
      if (!sid) return;
      if (!activeSession || activeSession.sessionId !== sid) return;

      const mainWindow = options.getMainWindow();
      if (!mainWindow || mainWindow.isDestroyed()) return;

      activeSession.ending = true;
      mainWindow.webContents.send('capture:stop', { sessionId: sid });
      options.setHudState({ state: 'finalizing' });
    }, ms);
  }

  function markPhraseCacheDirty() {
    phraseCacheDirty = true;
  }

  async function getActivePhrasesCached(appKey?: string | null) {
    if (phraseCacheDirty || !phraseCache) {
      const settings = options.getSettings();
      const seed: string[] = [];
      if (settings.extraPhrases) seed.push(...settings.extraPhrases);
      phraseCache = await options.getDictionaryPhrases(seed);
      lastPhraseBoostCount = phraseCache.length;
      phraseCacheDirty = false;
    }
    const appPhrases = appKey ? (options.getAppProfile?.(appKey)?.extraPhrases ?? []) : [];
    return Array.from(new Set([...phraseCache, ...appPhrases]));
  }

  async function prewarmStt() {
    if (activeSession || prewarmPromise) return;

    const azureConfig = options.getAzureCredentials();
    if (!azureConfig.key || !azureConfig.region) return;
    const configSignature = getAzureConfigSignature(azureConfig);

    if (prewarmedProvider) {
      if (prewarmedConfigSignature === configSignature) return;
      prewarmedProvider.close();
      prewarmedProvider = null;
      prewarmedConfigSignature = null;
    }

    const provider = createSttProvider('azure', azureConfig, async () => {
      const mod = await import('microsoft-cognitiveservices-speech-sdk');
      return mod.default || mod;
    });

    prewarmPromise = (async () => {
      try {
        await provider.prewarm?.();
        prewarmedProvider = provider;
        prewarmedConfigSignature = configSignature;
        logInfo('stt prewarm completed');
      } catch (error) {
        provider.close();
        prewarmedConfigSignature = null;
        logWarn('stt prewarm failed', { error });
      } finally {
        prewarmPromise = null;
      }
    })();

    await prewarmPromise;
  }

  async function primeTargetWindowForSession(sessionId: string) {
    const target = await options.getForegroundWindowHandle().catch(() => null);
    pendingTargetWindowBySession.set(sessionId, target);
  }

  async function startSttSession(
    sender: Electron.WebContents,
    payload: { sessionId: string; language?: string },
  ) {
    const blockedReason = options.getCaptureBlockedReason();
    if (blockedReason) throw new Error(blockedReason);

    if (activeSession) {
      if (activeSession.sessionId === payload.sessionId) {
        const pendingCurrentSession = pendingSttStartBySession.get(payload.sessionId);
        return pendingCurrentSession ? await pendingCurrentSession : { ok: true };
      }
      throw new Error('A session is already active.');
    }

    const started = (async () => {
      try {
        const settings = options.getSettings();
        const targetWindowHandle =
          pendingTargetWindowBySession.get(payload.sessionId) ??
          (await options.getForegroundWindowHandle());
        pendingTargetWindowBySession.delete(payload.sessionId);
        const appKey = options.getWindowAppKey
          ? await options.getWindowAppKey(targetWindowHandle).catch(() => null)
          : null;
        const appProfile = options.getAppProfile?.(appKey);
        const phrases = await getActivePhrasesCached(appKey);
        const language = resolveSessionLanguage(payload.language, settings, appProfile);
        const azureConfig = options.getAzureCredentials();
        const configSignature = getAzureConfigSignature(azureConfig);

        if (prewarmPromise) {
          await prewarmPromise.catch(() => undefined);
        }

        if (prewarmedProvider && prewarmedConfigSignature !== configSignature) {
          prewarmedProvider.close();
          prewarmedProvider = null;
          prewarmedConfigSignature = null;
        }

        const provider =
          prewarmedProvider ??
          createSttProvider('azure', azureConfig, async () => {
            const mod = await import('microsoft-cognitiveservices-speech-sdk');
            return mod.default || mod;
          });
        prewarmedProvider = null;
        prewarmedConfigSignature = null;

        const session: SttSession = {
          sessionId: payload.sessionId,
          sender,
          provider,
          startedAtMs: Date.now(),
          sttReadyAtMs: null,
          firstPartialAtMs: null,
          finalAtMs: null,
          injectAtMs: null,
          retryCount: 0,
          ending: false,
          targetWindowHandle,
          appKey,
          timeoutTimer: null,
          lastAudioChunkAtMs: null,
          audioThrottleDrops: 0,
          timedOut: false,
        };

        activeSession = session;
        armSessionTimeout(session);
        await provider.start(
          payload.sessionId,
          language,
          phrases,
          {
            onRecognizing: (sid, text) => {
              if (!isCurrentSession(sid)) return;
              if (session.firstPartialAtMs === null) session.firstPartialAtMs = Date.now();
              options.broadcast('stt:partial', { sessionId: sid, text });
            },
            onRecognized: (sid, result) => {
              if (!isCurrentSession(sid)) return;
              session.lastResult = result;
            },
            onError: (sid, message) => {
              if (!isCurrentSession(sid)) return;
              void failSession(session, message);
            },
          },
          {
            dualLanguageStrategy: settings.dualLanguageStrategy,
          },
        );

        if (!isCurrentSession(payload.sessionId) || session.ending) {
          throw new Error('A sessão foi encerrada durante a inicialização do STT.');
        }

        options.setHudState({ state: 'listening' });
        return { ok: true };
      } catch (error) {
        releaseActiveSession(payload.sessionId);
        logWarn('failed to start stt session', { error });
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

  async function stopSession(payload: { sessionId: string }) {
    if (!activeSession || activeSession.sessionId !== payload.sessionId) return { ok: false };

    const session = activeSession;
    session.ending = true;
    cancelPendingStop();
    clearSessionTimeout(session);
    options.setHudState({ state: 'finalizing' });

    try {
      await session.provider.stop(session.sessionId);
      session.finalAtMs = Date.now();

      const result = session.lastResult;
      if (!result || !result.text) {
        if (session.timedOut) {
          options.setHudState({ state: 'error', message: 'Sessão encerrada por tempo máximo.' });
          await sleep(HUD_ERROR_VISIBLE_MS);
          setHudStateIfCurrent(session.sessionId, { state: 'idle' });
          return {
            ok: false,
            text: '',
            timedOut: true,
            message: 'Sessão encerrada por tempo máximo.',
          };
        }
        setHudStateIfCurrent(session.sessionId, { state: 'idle' });
        return { ok: true, text: '' };
      }

      const postprocessed = await options.postprocessTranscript({
        rawText: result.text,
        language: result.language as 'pt-BR' | 'en-US',
        appKey: session.appKey,
        confidence: result.confidence,
      });
      const lowConfidencePolicy =
        options.resolveLowConfidencePolicy?.(result.confidence) ?? 'paste';
      const forceCopyOnly = lowConfidencePolicy === 'copy-only' || lowConfidencePolicy === 'review';

      options.broadcast('stt:final', { sessionId: session.sessionId, text: postprocessed.text });
      options.setHudState({ state: 'injecting' });

      const targetWindowHandle = await options.resolveInjectionTargetWindowHandle(
        session.targetWindowHandle,
      );
      const injection = await options.injectText(postprocessed.text, targetWindowHandle, {
        forceCopyOnly,
      });
      session.injectAtMs = Date.now();
      const completionMessage =
        lowConfidencePolicy === 'review'
          ? 'Texto copiado para revisão antes de colar.'
          : lowConfidencePolicy === 'copy-only'
            ? 'Texto copiado sem colagem automática devido à baixa confiança.'
            : session.timedOut
              ? 'Sessão encerrada por tempo máximo.'
              : undefined;

      if (options.onSessionCompleted) {
        await options.onSessionCompleted({
          sessionId: session.sessionId,
          text: postprocessed.text,
          rawText: result.text,
          pasted: injection.pasted,
          skippedReason: injection.skippedReason,
          pttToFirstPartialMs:
            session.firstPartialAtMs === null
              ? undefined
              : session.firstPartialAtMs - session.startedAtMs,
          pttToFinalMs:
            session.finalAtMs === null ? undefined : session.finalAtMs - session.startedAtMs,
          retryCount: session.retryCount,
          sessionDurationMs: Date.now() - session.startedAtMs,
          injectTotalMs: session.injectAtMs - session.finalAtMs,
          resolveWindowMs: injection.metrics?.resolveWindowMs,
          pasteAttemptMs: injection.metrics?.pasteAttemptMs,
          clipboardRestoreMs: injection.metrics?.clipboardRestoreMs,
          languageChosen: result.language,
          confidenceBucket:
            result.confidence >= 0.8 ? 'high' : result.confidence >= 0.6 ? 'medium' : 'low',
          appKey: session.appKey,
          intent: postprocessed.intent,
          appliedRules: postprocessed.appliedRules,
          rewriteApplied: postprocessed.rewriteApplied,
          rewriteRisk: postprocessed.rewriteRisk,
          injectionMethod: injection.method,
        });
      }

      options.setHudState({ state: 'success' });
      await sleep(HUD_SUCCESS_VISIBLE_MS);
      setHudStateIfCurrent(session.sessionId, { state: 'idle' });
      return {
        ok: true,
        text: postprocessed.text,
        timedOut: session.timedOut,
        message: completionMessage,
      };
    } catch (error) {
      logWarn('failed to stop stt session', { error });
      options.setHudState({ state: 'error', message: String(error) });
      await sleep(HUD_ERROR_VISIBLE_MS);
      setHudStateIfCurrent(session.sessionId, { state: 'idle' });
      return { ok: false };
    } finally {
      releaseActiveSession(session.sessionId);
      if (!activeSession) void prewarmStt();
    }
  }

  function registerIpcHandlers(ipcMain: IpcMain) {
    ipcMain.handle('stt:start', async (event, payload: unknown) => {
      const validated = validateSttStartPayload(payload);
      if (
        activeSession &&
        activeSession.sessionId === validated.sessionId &&
        activeSession.sender.id !== event.sender.id
      ) {
        throw new Error('Another renderer owns the active session.');
      }
      return await startSttSession(event.sender, validated);
    });

    ipcMain.on('stt:audio', (event, payload: unknown) => {
      try {
        const validated = validateSttAudioPayload(payload);
        if (!activeSession || activeSession.sessionId !== validated.sessionId) return;
        if (!isCurrentSessionOwner(event.sender, validated.sessionId)) {
          logWarn('ignored stt audio from non-owner renderer', {
            sessionId: validated.sessionId,
            senderId: event.sender.id,
          });
          return;
        }

        const now = Date.now();
        if (
          activeSession.lastAudioChunkAtMs !== null &&
          now - activeSession.lastAudioChunkAtMs < MIN_AUDIO_CHUNK_INTERVAL_MS
        ) {
          activeSession.audioThrottleDrops += 1;
          activeSession.lastAudioChunkAtMs = now;
          return;
        }

        activeSession.lastAudioChunkAtMs = now;
        const pcmBuffer =
          validated.pcm16kMonoInt16 instanceof Uint8Array
            ? Buffer.from(validated.pcm16kMonoInt16)
            : Buffer.from(new Uint8Array(validated.pcm16kMonoInt16));
        activeSession.provider.writeAudio(validated.sessionId, pcmBuffer);
      } catch (error) {
        logWarn('ignored malformed stt audio payload', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    ipcMain.handle('stt:stop', async (event, payload: unknown) => {
      const validated = validateSttStopPayload(payload);
      if (
        activeSession &&
        activeSession.sessionId === validated.sessionId &&
        !isCurrentSessionOwner(event.sender, validated.sessionId)
      ) {
        throw new Error('Another renderer owns the active session.');
      }
      return await stopSession(validated);
    });
  }

  return {
    markPhraseCacheDirty,
    invalidateRuntimeCaches: () => {
      if (activeSession) {
        clearSessionTimeout(activeSession);
      }
      prewarmedProvider?.close();
      prewarmedProvider = null;
      prewarmedConfigSignature = null;
    },
    prewarmStt,
    primeTargetWindowForSession,
    startSessionFromHotkey: (sender: Electron.WebContents, sid: string) =>
      startSttSession(sender, { sessionId: sid }),
    getActiveSessionId: () => activeSession?.sessionId ?? null,
    hasActiveSession: () => !!activeSession,
    scheduleStop,
    cancelPendingStop,
    registerIpcHandlers,
    getPhraseBoostCount: async () => {
      await getActivePhrasesCached();
      return lastPhraseBoostCount;
    },
    dispose: () => {
      cancelPendingStop();
      clearSessionTimeout(activeSession);
      prewarmedProvider?.close();
      prewarmedProvider = null;
      prewarmedConfigSignature = null;
      activeSession = null;
    },
  };
}
