import type { BrowserWindow, IpcMain } from 'electron';
import type { AppSettings, LanguageMode } from '../settings-store.js';
import type { InjectResult } from './text-injection.js';

const MAX_WARMUP_BUFFER_BYTES = 64 * 1024;
const MAX_RING_BUFFER_BYTES_30S = 16000 * 2 * 30;
const RETRY_REPLAY_BYTES = 16000 * 2 * 6;
const RETRY_BACKOFF_MS = 250;
const HUD_SUCCESS_VISIBLE_MS = 1100;
const HUD_ERROR_VISIBLE_MS = 900;

type HudVisualState = 'idle' | 'listening' | 'finalizing' | 'injecting' | 'success' | 'error';
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

type SttSessionManagerOptions = {
  getSettings: () => AppSettings;
  getCaptureBlockedReason: () => string | null | undefined;
  broadcast: (channel: string, payload: unknown) => void;
  setHudState: (state: HudState) => void;
  emitAppError: (message: string) => void;
  postprocessTranscript: (rawText: string) => string;
  getMainWindow: () => BrowserWindow | null;
  getForegroundWindowHandle: () => Promise<string | null>;
  resolveInjectionTargetWindowHandle: (
    sessionTargetWindowHandle: string | null,
  ) => Promise<string | null>;
  injectText: (text: string, targetWindowHandle: string | null) => Promise<InjectResult>;
  getDictionaryPhrases: (seedPhrases: string[]) => Promise<string[]>;
  onSessionCompleted?: (entry: {
    sessionId: string;
    text: string;
    pasted: boolean;
    skippedReason?: 'WINDOW_CHANGED' | 'PASTE_FAILED' | 'TIMEOUT';
    retryCount: number;
    sessionDurationMs: number;
    injectTotalMs: number;
    resolveWindowMs?: number;
    pasteAttemptMs?: number;
    clipboardRestoreMs?: number;
  }) => Promise<void> | void;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function normalizeWhitespace(text: string) {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\s+([,.;!?])/g, '$1')
    .trim();
}

export function createSttSessionManager(options: SttSessionManagerOptions) {
  let cachedSpeechSDK: any | null = null;
  let phraseCache: string[] | null = null;
  let phraseCacheDirty = true;
  let activeSession: SttSession | null = null;
  let pendingStopTimer: NodeJS.Timeout | null = null;
  let pendingStopSessionId: string | null = null;

  const pendingSttStartBySession = new Map<string, Promise<{ ok: boolean }>>();
  const pendingTargetWindowBySession = new Map<string, string | null>();

  function getActiveSessionId() {
    return activeSession?.sessionId ?? null;
  }

  function hasActiveSession() {
    return Boolean(activeSession);
  }

  function isCurrentSession(sessionId: string) {
    return Boolean(activeSession && activeSession.sessionId === sessionId);
  }

  function setHudStateIfCurrent(sessionId: string, state: HudState) {
    if (!isCurrentSession(sessionId)) return false;
    options.setHudState(state);
    return true;
  }

  function releaseActiveSession(sessionId: string) {
    if (activeSession && activeSession.sessionId === sessionId) {
      activeSession = null;
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

  async function primeTargetWindowForSession(sessionId: string) {
    const target = await options.getForegroundWindowHandle().catch(() => null);
    pendingTargetWindowBySession.set(sessionId, target);
  }

  async function getSpeechSdk() {
    if (cachedSpeechSDK) return cachedSpeechSDK;
    const mod: any = await import('microsoft-cognitiveservices-speech-sdk');
    cachedSpeechSDK = mod.default ?? mod;
    return cachedSpeechSDK;
  }

  function markPhraseCacheDirty() {
    phraseCacheDirty = true;
  }

  function extractCanonicalPhrases() {
    const settings = options.getSettings();
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
    const settings = options.getSettings();
    const envPhrases = (process.env.VOICE_PHRASES ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

    phraseCache = await options.getDictionaryPhrases([
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

  function getAzureConfig() {
    const key = (process.env.AZURE_SPEECH_KEY ?? '').trim();
    const region = (process.env.AZURE_SPEECH_REGION ?? '').trim();
    const language = process.env.AZURE_SPEECH_LANGUAGE ?? 'pt-BR';
    if (!key || !region) {
      throw new Error(
        'Azure STT nao configurado: defina AZURE_SPEECH_KEY e AZURE_SPEECH_REGION em .env.local.',
      );
    }
    return { key, region, language };
  }

  function clearSessionTimeout(session: SttSession) {
    if (!session.timeoutTimer) return;
    clearTimeout(session.timeoutTimer);
    session.timeoutTimer = null;
  }

  function scheduleSessionTimeout(session: SttSession) {
    clearSessionTimeout(session);
    const maxSeconds = clamp(options.getSettings().maxSessionSeconds ?? 90, 30, 600);

    session.timeoutTimer = setTimeout(() => {
      if (!activeSession || activeSession.sessionId !== session.sessionId) return;
      if (session.ending) return;

      session.ending = true;
      options.setHudState({ state: 'finalizing', message: `Sessao limitada a ${maxSeconds}s` });
      options.emitAppError(`Sessao encerrada ao atingir ${maxSeconds}s.`);
      const mainWindow = options.getMainWindow();
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

  function createRecognizerSlot(
    SpeechSDK: any,
    language: string,
    key: string,
    region: string,
    phrases: string[],
  ): SttSlot {
    const speechConfig = SpeechSDK.SpeechConfig.fromSubscription(key, region);
    speechConfig.speechRecognitionLanguage = language;

    if (SpeechSDK.PropertyId?.SpeechServiceResponse_PostProcessingOption) {
      speechConfig.setProperty(
        SpeechSDK.PropertyId.SpeechServiceResponse_PostProcessingOption,
        'TrueText',
      );
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
            slot.recognizer.startContinuousRecognitionAsync(() => {
              slot.ready = true;
              for (const chunk of slot.buffered) slot.pushStream.write(chunk);
              slot.buffered = [];
              slot.bufferedBytes = 0;
              resolve();
            }, reject);
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
    if (
      details.includes('authentication') ||
      details.includes('forbidden') ||
      details.includes('invalid')
    )
      return false;
    return true;
  }

  async function rebuildSessionRecognizers(session: SttSession) {
    const SpeechSDK = await getSpeechSdk();
    const { key, region } = getAzureConfig();
    const phrases = await getActivePhrasesCached();

    await closeAllSlots(session);
    session.slots = session.languages.map((language) =>
      createRecognizerSlot(SpeechSDK, language, key, region, phrases),
    );

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
    console.warn(
      `[retry] retrying STT session ${session.sessionId} (attempt=${session.retryCount})`,
    );
    await sleep(RETRY_BACKOFF_MS);

    if (!activeSession || activeSession.sessionId !== session.sessionId || session.ending)
      return false;
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

  function computePcm16Level(chunk: Buffer) {
    const sampleCount = Math.floor(chunk.byteLength / 2);
    if (sampleCount <= 0) return 0;

    let sumSq = 0;
    for (let offset = 0; offset + 1 < chunk.byteLength; offset += 2) {
      const sample = chunk.readInt16LE(offset) / 32768;
      sumSq += sample * sample;
    }

    const rms = Math.sqrt(sumSq / sampleCount);
    if (rms < 0.008) return 0;
    return clamp(rms * 3.2, 0, 1);
  }

  function logSessionPerf(session: SttSession) {
    const durationMs = sessionAgeMs(session);
    const firstPartialMs = session.firstPartialAtMs
      ? session.firstPartialAtMs - session.startedAtMs
      : -1;
    const finalMs = session.finalAtMs ? session.finalAtMs - session.startedAtMs : -1;
    const injectMs =
      session.injectAtMs && session.finalAtMs ? session.injectAtMs - session.finalAtMs : -1;

    console.log(
      `[perf] session_duration_ms=${durationMs} ptt_to_first_partial_ms=${firstPartialMs} ptt_to_final_ms=${finalMs} inject_total_ms=${injectMs} retry_count=${session.retryCount}`,
    );
  }

  async function persistCompletedSession(
    session: SttSession,
    finalText: string,
    injection: Pick<InjectResult, 'pasted' | 'skippedReason' | 'metrics'>,
  ) {
    if (!finalText || !options.onSessionCompleted) return;
    const sessionDurationMs = sessionAgeMs(session);
    const injectTotalMs =
      session.injectAtMs && session.finalAtMs ? session.injectAtMs - session.finalAtMs : -1;
    await options.onSessionCompleted({
      sessionId: session.sessionId,
      text: finalText,
      pasted: injection.pasted,
      skippedReason: injection.skippedReason,
      retryCount: session.retryCount,
      sessionDurationMs,
      injectTotalMs,
      resolveWindowMs: injection.metrics?.resolveWindowMs,
      pasteAttemptMs: injection.metrics?.pasteAttemptMs,
      clipboardRestoreMs: injection.metrics?.clipboardRestoreMs,
    });
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

      options.broadcast('stt:partial', { sessionId: session.sessionId, text });
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
          slot.bestConfidence =
            slot.bestConfidence == null ? confidence : Math.max(slot.bestConfidence, confidence);
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
        options.broadcast('stt:error', { sessionId: session.sessionId, message });
        setHudStateIfCurrent(session.sessionId, { state: 'error', message });

        session.ending = true;
        clearSessionTimeout(session);
        cancelPendingStop();
        await closeAllSlots(session);
        await sleep(500);
        setHudStateIfCurrent(session.sessionId, { state: 'idle' });
        releaseActiveSession(session.sessionId);
      })();
    };
  }

  function pickSessionLanguages(payloadLanguage?: string) {
    const settings = options.getSettings();
    const mode: LanguageMode =
      settings.languageMode === 'dual'
        ? 'dual'
        : settings.languageMode === 'en-US'
          ? 'en-US'
          : 'pt-BR';

    if (mode === 'dual') return ['pt-BR', 'en-US'];
    if (mode === 'en-US') return ['en-US'];
    return [payloadLanguage ?? process.env.AZURE_SPEECH_LANGUAGE ?? 'pt-BR'];
  }

  async function startSttSession(
    sender: Electron.WebContents,
    payload: { sessionId: string; language?: string },
  ) {
    const blockedReason = options.getCaptureBlockedReason();
    if (blockedReason) {
      throw new Error(blockedReason);
    }

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
          pendingTargetWindowBySession.get(payload.sessionId) ??
          (await options.getForegroundWindowHandle());
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

        session.slots = languages.map((entry) =>
          createRecognizerSlot(SpeechSDK, entry, key, region, phrases),
        );
        for (const slot of session.slots) {
          attachSlotHandlers(session, slot, slot === session.slots[0]);
        }

        activeSession = session;
        scheduleSessionTimeout(session);
        options.setHudState({ state: 'listening' });

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

  async function startSessionFromHotkey(sender: Electron.WebContents, sessionId: string) {
    return await startSttSession(sender, { sessionId });
  }

  function onAudioChunk(payload: { sessionId: string; pcm16kMonoInt16: ArrayBuffer }) {
    if (!activeSession || activeSession.sessionId !== payload.sessionId) return;
    if (activeSession.ending) return;

    const chunk = Buffer.from(payload.pcm16kMonoInt16);
    const level = computePcm16Level(chunk);
    options.broadcast('hud:level', { sessionId: payload.sessionId, level });
    feedAudioChunk(activeSession, chunk);
  }

  async function stopSession(payload: { sessionId: string }) {
    if (!activeSession || activeSession.sessionId !== payload.sessionId) {
      return { ok: false };
    }

    const session = activeSession;
    session.ending = true;
    cancelPendingStop();
    clearSessionTimeout(session);
    const setHudForSession = (state: HudState) => setHudStateIfCurrent(session.sessionId, state);

    try {
      setHudForSession({ state: 'finalizing' });

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
        // ignore stop failures
      });

      for (const slot of session.slots) {
        try {
          slot.recognizer.close();
        } catch {
          // ignore
        }
      }

      const bestRawText = chooseBestFinalText(session) ?? '';
      const finalText = bestRawText ? options.postprocessTranscript(bestRawText) : '';
      session.finalAtMs = Date.now();

      if (!finalText) {
        setHudForSession({ state: 'idle' });
        return { ok: true, text: finalText };
      }

      options.broadcast('stt:final', { sessionId: payload.sessionId, text: finalText });
      setHudForSession({ state: 'injecting' });

      const targetWindowHandle = await options.resolveInjectionTargetWindowHandle(
        session.targetWindowHandle,
      );
      const injection = await options.injectText(finalText, targetWindowHandle);
      session.injectAtMs = Date.now();

      await persistCompletedSession(session, finalText, injection);

      if (injection.skippedReason === 'WINDOW_CHANGED') {
        const message = 'Janela mudou durante o ditado. Texto copiado para colagem manual.';
        options.emitAppError(message);
        setHudForSession({ state: 'error', message });
        await sleep(900);
        setHudForSession({ state: 'idle' });
        return { ok: true, text: finalText };
      }

      if (!injection.pasted) {
        setHudForSession({ state: 'success', message: 'Texto copiado' });
      } else {
        setHudForSession({ state: 'success' });
      }
      await sleep(HUD_SUCCESS_VISIBLE_MS);
      setHudForSession({ state: 'idle' });
      return { ok: true, text: finalText };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      options.broadcast('stt:error', { sessionId: session.sessionId, message });
      setHudForSession({ state: 'error', message });
      await sleep(HUD_ERROR_VISIBLE_MS);
      setHudForSession({ state: 'idle' });
      return { ok: false };
    } finally {
      logSessionPerf(session);
      releaseActiveSession(session.sessionId);
    }
  }

  function registerIpcHandlers(ipcMain: IpcMain) {
    ipcMain.handle(
      'stt:start',
      async (event, payload: { sessionId: string; language?: string }) => {
        return await startSttSession(event.sender, payload);
      },
    );

    ipcMain.on(
      'stt:audio',
      (_event, payload: { sessionId: string; pcm16kMonoInt16: ArrayBuffer }) => {
        onAudioChunk(payload);
      },
    );

    ipcMain.handle('stt:stop', async (_event, payload: { sessionId: string }) => {
      return await stopSession(payload);
    });
  }

  function dispose() {
    cancelPendingStop();
    if (!activeSession) return;
    clearSessionTimeout(activeSession);
    activeSession = null;
  }

  return {
    markPhraseCacheDirty,
    prewarmStt,
    primeTargetWindowForSession,
    startSessionFromHotkey,
    getActiveSessionId,
    hasActiveSession,
    scheduleStop,
    cancelPendingStop,
    registerIpcHandlers,
    dispose,
  };
}
