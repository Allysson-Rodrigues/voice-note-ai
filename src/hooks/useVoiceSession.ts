import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  onCaptureIssue,
  primeMicrophone,
  setInputGain,
  startCapture,
  stopCapture,
  warmupCapturePipeline,
} from '@/audio/capture';
import type { ActiveTab, AudioDevice, Status, UiHealthItem } from '@/components/index/types';
import type { RuntimeInfo } from '@/electron';
import type { AppToast } from './app-toast';

const MIC_STORAGE_KEY = 'voice-note-ai:micDeviceId';
const MIC_GAIN_STORAGE_KEY = 'voice-note-ai:micInputGain';

const DEFAULT_RUNTIME_INFO: RuntimeInfo = {
  hotkeyLabel: 'Ctrl+Win',
  hotkeyMode: 'unavailable',
  holdToTalkActive: false,
  holdRequired: true,
  captureBlockedReason: 'PTT indisponível: o atalho global não foi carregado.',
};

type UseVoiceSessionOptions = {
  activeTab: ActiveTab;
  hasDesktopApi: boolean;
  toast: AppToast;
};

export function useVoiceSession({ activeTab, hasDesktopApi, toast }: UseVoiceSessionOptions) {
  const [status, setStatus] = useState<Status>('idle');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [partial, setPartial] = useState('');
  const [finalText, setFinalText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [runtimeInfo, setRuntimeInfo] = useState<RuntimeInfo>(DEFAULT_RUNTIME_INFO);
  const [healthItems, setHealthItems] = useState<UiHealthItem[]>([]);
  const [healthLoading, setHealthLoading] = useState(false);
  const [micDevices, setMicDevices] = useState<AudioDevice[]>([]);
  const [micDeviceId, setMicDeviceId] = useState<string>(() => {
    try {
      return localStorage.getItem(MIC_STORAGE_KEY) ?? '';
    } catch {
      return '';
    }
  });
  const [micInputGain, setMicInputGain] = useState<number>(() => {
    try {
      const raw = localStorage.getItem(MIC_GAIN_STORAGE_KEY);
      const parsed = raw ? Number(raw) : 1;
      return Number.isFinite(parsed) ? parsed : 1;
    } catch {
      return 1;
    }
  });

  const partialFrameRef = useRef<number | null>(null);
  const partialPendingRef = useRef<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const activeTabRef = useRef(activeTab);
  const micDeviceIdRef = useRef(micDeviceId);
  const micInputGainRef = useRef(micInputGain);
  const toastRef = useRef(toast);

  activeTabRef.current = activeTab;
  micDeviceIdRef.current = micDeviceId;
  micInputGainRef.current = micInputGain;
  toastRef.current = toast;

  const canControl = useMemo(
    () => hasDesktopApi && !runtimeInfo.captureBlockedReason,
    [hasDesktopApi, runtimeInfo.captureBlockedReason],
  );
  const canStop = status !== 'idle' || Boolean(error) || Boolean(sessionId);
  const hotkeyLabel = runtimeInfo.hotkeyLabel || DEFAULT_RUNTIME_INFO.hotkeyLabel;
  const visibleHealthItems = useMemo<UiHealthItem[]>(
    () =>
      healthItems.length === 0
        ? [{ id: 'network', status: 'warn', message: 'O diagnóstico ainda não foi executado.' }]
        : healthItems,
    [healthItems],
  );

  const setStatusSafely = useCallback((next: Status) => {
    setStatus((prev) => (prev === next ? prev : next));
  }, []);

  const resetSessionState = useCallback(
    (nextStatus: Status = 'idle') => {
      partialPendingRef.current = null;
      setSessionId(null);
      sessionIdRef.current = null;
      setStatusSafely(nextStatus);
    },
    [setStatusSafely],
  );

  const refreshDevices = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return [];

    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioInputs = devices
      .filter((device) => device.kind === 'audioinput')
      .map((device) => ({
        deviceId: device.deviceId,
        label: device.label || `Microfone (${device.deviceId.slice(0, 6)}…)`,
      }));
    setMicDevices(audioInputs);
    return audioInputs;
  }, []);

  const buildMicrophoneHealthItem = useCallback(async (): Promise<UiHealthItem> => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
      return {
        id: 'microphone',
        status: 'error',
        message: 'A API de microfone não está disponível neste ambiente.',
      };
    }

    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioInputs = devices.filter((device) => device.kind === 'audioinput');
    if (audioInputs.length === 0) {
      return {
        id: 'microphone',
        status: 'error',
        message: 'Nenhum microfone foi detectado.',
      };
    }

    if (
      micDeviceIdRef.current &&
      !audioInputs.some((device) => device.deviceId === micDeviceIdRef.current)
    ) {
      return {
        id: 'microphone',
        status: 'warn',
        message: 'O microfone selecionado não está disponível. O app usará o dispositivo padrão.',
      };
    }

    return {
      id: 'microphone',
      status: 'ok',
      message: 'Microfone disponível e pronto para captura.',
    };
  }, []);

  const runHealthCheck = useCallback(async () => {
    if (!hasDesktopApi) return;

    setHealthLoading(true);
    try {
      const [report, micItem] = await Promise.all([
        window.voiceNoteAI.getHealthCheck(),
        buildMicrophoneHealthItem(),
      ]);
      const backendItems = report.items.map((item) => ({
        id: item.id,
        status: item.status,
        message: item.message,
      })) as UiHealthItem[];
      setHealthItems([...backendItems, micItem]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setHealthItems([
        {
          id: 'network',
          status: 'error',
          message: `Falha ao executar o diagnóstico: ${message}`,
        },
      ]);
    } finally {
      setHealthLoading(false);
    }
  }, [buildMicrophoneHealthItem, hasDesktopApi]);

  const ensureSelectedMicrophoneAvailable = useCallback(async () => {
    const refreshed = await refreshDevices();
    if (!refreshed.length || !micDeviceIdRef.current) return;

    const exists = refreshed.some((entry) => entry.deviceId === micDeviceIdRef.current);
    if (exists) return;

    setMicDeviceId('');
    toastRef.current({
      title: 'Microfone ajustado',
      description: 'O dispositivo selecionado não foi encontrado. O app voltou ao microfone padrão.',
    });
  }, [refreshDevices]);

  const loadRuntimeInfo = useCallback(async () => {
    if (!hasDesktopApi) return;

    try {
      const info = await window.voiceNoteAI.getRuntimeInfo();
      setRuntimeInfo(info);
      if (info.captureBlockedReason) {
        setError(info.captureBlockedReason);
        setStatusSafely('error');
      } else if (!sessionIdRef.current) {
        setError(null);
        setStatusSafely('idle');
      }
    } catch {
      // ignore
    }
  }, [hasDesktopApi, setStatusSafely]);

  const pushPartial = useCallback((text: string) => {
    partialPendingRef.current = text;
    if (partialFrameRef.current !== null) return;

    partialFrameRef.current = requestAnimationFrame(() => {
      partialFrameRef.current = null;
      if (partialPendingRef.current == null) return;
      setPartial(partialPendingRef.current);
      partialPendingRef.current = null;
    });
  }, []);

  const begin = useCallback(
    async (newSessionId: string) => {
      setError(null);
      setFinalText('');
      setPartial('');
      partialPendingRef.current = null;
      setSessionId(newSessionId);
      sessionIdRef.current = newSessionId;
      setStatusSafely('listening');

      try {
        const sttStart = window.voiceNoteAI.startStt({ sessionId: newSessionId });
        const captureStart = startCapture(
          newSessionId,
          micDeviceIdRef.current || null,
          micInputGainRef.current,
        );
        const [sttResult, captureResult] = await Promise.allSettled([sttStart, captureStart]);

        if (sttResult.status === 'rejected' || captureResult.status === 'rejected') {
          if (sttResult.status === 'fulfilled') {
            try {
              await window.voiceNoteAI.stopStt(newSessionId);
            } catch {
              // ignore
            }
          }

          try {
            await stopCapture();
          } catch {
            // ignore
          }

          throw sttResult.status === 'rejected'
            ? sttResult.reason
            : captureResult.status === 'rejected'
              ? captureResult.reason
              : new Error('Falha ao iniciar a sessão de ditado.');
        }
      } catch (captureError) {
        resetSessionState('error');
        throw captureError;
      }
    },
    [resetSessionState, setStatusSafely],
  );

  const end = useCallback(
    async (currentSessionId: string) => {
      setStatusSafely('finalizing');
      await stopCapture();
      await window.voiceNoteAI.stopStt(currentSessionId);
      setStatusSafely('idle');
      resetSessionState();
    },
    [resetSessionState, setStatusSafely],
  );

  const retryHoldHook = useCallback(async () => {
    if (!hasDesktopApi) return;

    const result = await window.voiceNoteAI.retryHoldHook();
    if (result.ok) {
      toastRef.current({
        title: 'Atalho recuperado',
        description: result.message,
      });
      await loadRuntimeInfo();
      await runHealthCheck();
      return;
    }

    toastRef.current({
      title: 'Falha ao recuperar atalho',
      description: result.message,
      variant: 'destructive',
    });
    await loadRuntimeInfo();
    await runHealthCheck();
  }, [hasDesktopApi, loadRuntimeInfo, runHealthCheck]);

  const manualStart = useCallback(async () => {
    if (!canControl || status !== 'idle') return;

    try {
      await begin(crypto.randomUUID());
    } catch (error) {
      setStatusSafely('error');
      setError(String(error));
      toastRef.current({
        title: 'Falha ao iniciar ditado',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    }
  }, [begin, canControl, setStatusSafely, status]);

  const manualStop = useCallback(async () => {
    if (!canControl) return;

    try {
      await end(sessionIdRef.current || 'force');
    } catch (error) {
      setStatusSafely('error');
      setError(String(error));
      toastRef.current({
        title: 'Falha ao encerrar ditado',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    }
  }, [canControl, end, setStatusSafely]);

  const updateMicInputGain = useCallback((value: number) => {
    setMicInputGain(value);
    setInputGain(value);
  }, []);

  useEffect(() => {
    return () => {
      if (partialFrameRef.current !== null) cancelAnimationFrame(partialFrameRef.current);
    };
  }, []);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    if (!hasDesktopApi) return;

    void warmupCapturePipeline();
    void primeMicrophone();
    void ensureSelectedMicrophoneAvailable();
    void loadRuntimeInfo();

    const offCaptureIssue = onCaptureIssue((event) => {
      if (event.code === 'devicechange') {
        void ensureSelectedMicrophoneAvailable();
        if (activeTabRef.current === 'settings') void runHealthCheck();
        return;
      }

      if (event.code === 'device-missing-fallback') {
        setMicDeviceId('');
        toastRef.current({
          title: 'Microfone ajustado',
          description: event.message,
        });
        void ensureSelectedMicrophoneAvailable();
        if (activeTabRef.current === 'settings') void runHealthCheck();
        return;
      }

      if (event.code === 'device-disconnected') {
        toastRef.current({
          title: 'Microfone desconectado',
          description: event.message,
          variant: 'destructive',
        });
        void ensureSelectedMicrophoneAvailable();
        if (activeTabRef.current === 'settings') void runHealthCheck();
      }
    });

    const offStart = window.voiceNoteAI.onCaptureStart(async ({ sessionId: nextSessionId }) => {
      try {
        await begin(nextSessionId);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setStatusSafely('error');
        setError(message);
        toastRef.current({
          title: 'Falha na captura',
          description: message,
          variant: 'destructive',
        });
      }
    });

    const offStop = window.voiceNoteAI.onCaptureStop(async ({ sessionId: nextSessionId }) => {
      if (sessionIdRef.current !== nextSessionId) return;
      try {
        await end(nextSessionId);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setStatusSafely('error');
        setError(message);
        toastRef.current({
          title: 'Falha ao finalizar captura',
          description: message,
          variant: 'destructive',
        });
      }
    });

    const offPartial = window.voiceNoteAI.onSttPartial((event) => {
      if (event.sessionId !== sessionIdRef.current) return;
      pushPartial(event.text);
    });

    const offFinal = window.voiceNoteAI.onSttFinal((event) => {
      if (event.sessionId !== sessionIdRef.current) return;
      setFinalText(event.text);
      partialPendingRef.current = null;
      setPartial('');
    });

    const offErr = window.voiceNoteAI.onSttError((event) => {
      if (event.sessionId !== sessionIdRef.current) return;
      setStatusSafely('error');
      setError(event.message);
      void stopCapture().catch(() => undefined);
      resetSessionState('error');
    });

    const offAppError = window.voiceNoteAI.onAppError((event) => {
      setStatusSafely('error');
      setError(event.message);
      toastRef.current({
        title: 'Aviso do sistema',
        description: event.message,
        variant: 'destructive',
      });
    });

    return () => {
      offStart();
      offStop();
      offPartial();
      offFinal();
      offErr();
      offAppError();
      offCaptureIssue();
      const pendingSession = sessionIdRef.current;
      if (pendingSession) {
        void stopCapture().catch(() => undefined);
        void window.voiceNoteAI.stopStt(pendingSession).catch(() => undefined);
      }
    };
  }, [begin, end, ensureSelectedMicrophoneAvailable, hasDesktopApi, loadRuntimeInfo, pushPartial, resetSessionState, runHealthCheck, setStatusSafely]);

  useEffect(() => {
    if (hasDesktopApi) void primeMicrophone(micDeviceId || null);
  }, [hasDesktopApi, micDeviceId]);

  useEffect(() => {
    try {
      localStorage.setItem(MIC_STORAGE_KEY, micDeviceId);
    } catch {
      // ignore
    }
  }, [micDeviceId]);

  useEffect(() => {
    try {
      localStorage.setItem(MIC_GAIN_STORAGE_KEY, String(micInputGain));
    } catch {
      // ignore
    }
  }, [micInputGain]);

  useEffect(() => {
    if (activeTab !== 'settings') return;
    void refreshDevices();
    void runHealthCheck();
  }, [activeTab, refreshDevices, runHealthCheck]);

  return {
    canControl,
    canStop,
    error,
    finalText,
    healthItems: visibleHealthItems,
    healthLoading,
    hotkeyLabel,
    loadRuntimeInfo,
    manualStart,
    manualStop,
    micDeviceId,
    micDevices,
    micInputGain,
    partial,
    refreshDevices,
    retryHoldHook,
    runHealthCheck,
    runtimeInfo,
    sessionId,
    setMicDeviceId,
    setMicInputGain: updateMicInputGain,
    status,
  };
}
