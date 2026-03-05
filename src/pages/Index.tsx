import {
    onCaptureIssue,
    primeMicrophone,
    setInputGain,
    startCapture,
    stopCapture,
    warmupCapturePipeline,
} from '@/audio/capture';
import CaptureTab from '@/components/index/CaptureTab';
import type {
    ActiveTab,
    AudioDevice,
    LanguageMode,
    Status,
    ToneMode,
    UiHealthItem,
} from '@/components/index/types';
import { clampHistoryRetentionDays, statusDotClass } from '@/components/index/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import WindowTitleBar from '@/components/WindowTitleBar';
import type { CanonicalTerm, DictionaryTerm, HistoryEntry, RuntimeInfo } from '@/electron';
import { useToast } from '@/hooks/use-toast';
import {
    STOP_GRACE_BY_PROFILE,
    latencyProfileFromStopGrace,
    type LatencyProfile,
} from '@/lib/latency';
import { BookOpen, History, Mic, Moon, PanelLeftClose, PanelLeftOpen, Settings, Sun } from 'lucide-react';
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';

const DictionaryTab = lazy(() => import('@/components/index/DictionaryTab'));
const HistoryTab = lazy(() => import('@/components/index/HistoryTab'));
const SettingsTab = lazy(() => import('@/components/index/SettingsTab'));

const MIC_STORAGE_KEY = 'voice-note-ai:micDeviceId';
const MIC_GAIN_STORAGE_KEY = 'voice-note-ai:micInputGain';

const DEFAULT_RUNTIME_INFO: RuntimeInfo = {
  hotkeyLabel: 'Ctrl+Win',
  hotkeyMode: 'unavailable',
  holdToTalkActive: false,
  holdRequired: true,
  captureBlockedReason: 'PTT indisponível: hook global não carregou.',
};

function normalizeCanonicalValue(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function tabFallback(label: string) {
  return (
    <div className="rounded-2xl border border-border/40 bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
      {label}
    </div>
  );
}

const Index = () => {
  const { toast } = useToast();
  const hasDesktopApi = typeof window !== 'undefined' && Boolean(window.voiceNoteAI);

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof document !== 'undefined') {
      return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
    }
    return 'dark';
  });
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(true);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const [status, setStatus] = useState<Status>('idle');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [partial, setPartial] = useState('');
  const [finalText, setFinalText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [autoPasteEnabled, setAutoPasteEnabled] = useState(false);
  const [toneMode, setToneMode] = useState<ToneMode>('casual');
  const [languageMode, setLanguageMode] = useState<LanguageMode>('pt-BR');
  const [latencyProfile, setLatencyProfile] = useState<LatencyProfile>('balanced');
  const [runtimeInfo, setRuntimeInfo] = useState<RuntimeInfo>(DEFAULT_RUNTIME_INFO);
  const [healthItems, setHealthItems] = useState<UiHealthItem[]>([]);
  const [healthLoading, setHealthLoading] = useState(false);
  const [formatCommandsEnabled, setFormatCommandsEnabled] = useState(true);
  const [activeTab, setActiveTab] = useState<ActiveTab>('capture');
  const [extraPhrasesText, setExtraPhrasesText] = useState('');
  const [historyEnabled, setHistoryEnabled] = useState(true);
  const [historyRetentionDays, setHistoryRetentionDays] = useState(30);
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
  const [historyQuery, setHistoryQuery] = useState('');
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyBusy, setHistoryBusy] = useState(false);
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
  const [dictionary, setDictionary] = useState<DictionaryTerm[]>([]);
  const [dictionaryBusy, setDictionaryBusy] = useState(false);
  const [dictionaryAvailable, setDictionaryAvailable] = useState(true);
  const [newTerm, setNewTerm] = useState('');
  const [newHintPt, setNewHintPt] = useState('');
  const [canonicalTerms, setCanonicalTerms] = useState<CanonicalTerm[]>([]);
  const [newCanonicalFrom, setNewCanonicalFrom] = useState('');
  const [newCanonicalTo, setNewCanonicalTo] = useState('');

  const dictionaryLoadedRef = useRef(false);
  const partialFrameRef = useRef<number | null>(null);
  const partialPendingRef = useRef<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  const canControl = useMemo(
    () => hasDesktopApi && !runtimeInfo.captureBlockedReason,
    [hasDesktopApi, runtimeInfo.captureBlockedReason],
  );
  const hotkeyLabel = runtimeInfo.hotkeyLabel || DEFAULT_RUNTIME_INFO.hotkeyLabel;
  const visibleHealthItems = useMemo<UiHealthItem[]>(
    () =>
      healthItems.length === 0
        ? [{ id: 'network', status: 'warn', message: 'Health check ainda não executado.' }]
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
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return;
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
        message: 'API de microfone indisponível neste ambiente.',
      };
    }

    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioInputs = devices.filter((device) => device.kind === 'audioinput');
    if (audioInputs.length === 0) {
      return {
        id: 'microphone',
        status: 'error',
        message: 'Nenhum microfone detectado.',
      };
    }

    if (micDeviceId && !audioInputs.some((device) => device.deviceId === micDeviceId)) {
      return {
        id: 'microphone',
        status: 'warn',
        message: 'Microfone selecionado não está disponível. O app usará o dispositivo padrão.',
      };
    }

    return {
      id: 'microphone',
      status: 'ok',
      message: 'Microfone disponível e pronto para captura.',
    };
  }, [micDeviceId]);

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
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setHealthItems([
        {
          id: 'network',
          status: 'error',
          message: `Falha ao executar health check: ${message}`,
        },
      ]);
    } finally {
      setHealthLoading(false);
    }
  }, [buildMicrophoneHealthItem, hasDesktopApi]);

  const ensureSelectedMicrophoneAvailable = useCallback(async () => {
    const refreshed = await refreshDevices();
    if (!refreshed || !micDeviceId) return;
    const exists = refreshed.some((entry) => entry.deviceId === micDeviceId);
    if (exists) return;

    setMicDeviceId('');
    toast({
      title: 'Microfone ajustado',
      description: 'Dispositivo selecionado não encontrado. Alternado para microfone padrão.',
    });
  }, [micDeviceId, refreshDevices, toast]);

  const loadDictionary = useCallback(async () => {
    if (!hasDesktopApi || !dictionaryAvailable) return;
    setDictionaryBusy(true);
    try {
      const terms = await window.voiceNoteAI.listDictionary();
      setDictionary(terms);
      dictionaryLoadedRef.current = true;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (message.includes("No handler registered for 'dictionary:list'")) {
        setDictionaryAvailable(false);
        toast({
          title: 'Dicionário indisponível',
          description: 'Reinicie o app com npm run dev:desktop',
        });
        return;
      }
      toast({
        title: 'Falha ao carregar dicionário',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setDictionaryBusy(false);
    }
  }, [dictionaryAvailable, hasDesktopApi, toast]);

  const loadHistory = useCallback(
    async (query: string) => {
      if (!hasDesktopApi) return;
      setHistoryLoading(true);
      try {
        const entries = await window.voiceNoteAI.listHistory({ query, limit: 120 });
        setHistoryEntries(entries);
      } catch (e) {
        toast({
          title: 'Falha ao carregar histórico',
          description: e instanceof Error ? e.message : String(e),
          variant: 'destructive',
        });
      } finally {
        setHistoryLoading(false);
      }
    },
    [hasDesktopApi, toast],
  );

  const loadSettings = useCallback(async () => {
    if (!hasDesktopApi) return;
    try {
      const nextSettings = await window.voiceNoteAI.getSettings();
      setAutoPasteEnabled(Boolean(nextSettings.autoPasteEnabled));
      setToneMode(
        nextSettings.toneMode === 'formal'
          ? 'formal'
          : nextSettings.toneMode === 'very-casual'
            ? 'very-casual'
            : 'casual',
      );
      setLanguageMode(
        nextSettings.languageMode === 'dual'
          ? 'dual'
          : nextSettings.languageMode === 'en-US'
            ? 'en-US'
            : 'pt-BR',
      );
      setLatencyProfile(latencyProfileFromStopGrace(nextSettings.stopGraceMs));
      setExtraPhrasesText((nextSettings.extraPhrases ?? []).join('\n'));
      setCanonicalTerms(nextSettings.canonicalTerms ?? []);
      setFormatCommandsEnabled(nextSettings.formatCommandsEnabled !== false);
      setHistoryEnabled(nextSettings.historyEnabled !== false);
      setHistoryRetentionDays(clampHistoryRetentionDays(nextSettings.historyRetentionDays ?? 30));
    } catch {
      // ignore
    }
  }, [hasDesktopApi]);

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

  const onRetryHoldHook = useCallback(async () => {
    if (!hasDesktopApi) return;
    const result = await window.voiceNoteAI.retryHoldHook();
    if (result.ok) {
      toast({ title: 'Hook recuperado', description: result.message });
      await loadRuntimeInfo();
      await runHealthCheck();
      return;
    }
    toast({
      title: 'Falha ao recuperar hook',
      description: result.message,
      variant: 'destructive',
    });
    await loadRuntimeInfo();
    await runHealthCheck();
  }, [hasDesktopApi, loadRuntimeInfo, runHealthCheck, toast]);

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
        const captureStart = startCapture(newSessionId, micDeviceId || null, micInputGain);
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
              : new Error('Falha no boot');
        }
      } catch (captureError) {
        resetSessionState('error');
        throw captureError;
      }
    },
    [micDeviceId, micInputGain, resetSessionState, setStatusSafely],
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
    void loadSettings();
    void loadRuntimeInfo();

    const offCaptureIssue = onCaptureIssue((event) => {
      if (event.code === 'devicechange') {
        void ensureSelectedMicrophoneAvailable();
        if (activeTab === 'settings') void runHealthCheck();
        return;
      }

      if (event.code === 'device-missing-fallback') {
        setMicDeviceId('');
        toast({ title: 'Fallback de microfone', description: event.message });
        void ensureSelectedMicrophoneAvailable();
        if (activeTab === 'settings') void runHealthCheck();
        return;
      }

      if (event.code === 'device-disconnected') {
        toast({
          title: 'Microfone desconectado',
          description: event.message,
          variant: 'destructive',
        });
        void ensureSelectedMicrophoneAvailable();
        if (activeTab === 'settings') void runHealthCheck();
      }
    });

    const offStart = window.voiceNoteAI.onCaptureStart(async ({ sessionId: nextSessionId }) => {
      try {
        await begin(nextSessionId);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        setStatusSafely('error');
        setError(message);
        toast({ title: 'Falha na captura', description: message, variant: 'destructive' });
      }
    });

    const offStop = window.voiceNoteAI.onCaptureStop(async ({ sessionId: nextSessionId }) => {
      if (sessionIdRef.current !== nextSessionId) return;
      try {
        await end(nextSessionId);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        setStatusSafely('error');
        setError(message);
        toast({ title: 'Falha na finalização', description: message, variant: 'destructive' });
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
      toast({ title: 'Aviso do sistema', description: event.message, variant: 'destructive' });
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
        void stopCapture().catch(() => {});
        void window.voiceNoteAI.stopStt(pendingSession).catch(() => {});
      }
    };
  }, [
    activeTab,
    begin,
    end,
    ensureSelectedMicrophoneAvailable,
    hasDesktopApi,
    loadRuntimeInfo,
    loadSettings,
    pushPartial,
    resetSessionState,
    runHealthCheck,
    setStatusSafely,
    toast,
  ]);

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
    if (activeTab !== 'dictionary' || dictionaryLoadedRef.current) return;
    void loadDictionary();
  }, [activeTab, loadDictionary]);

  useEffect(() => {
    if (activeTab !== 'settings') return;
    void refreshDevices();
    void runHealthCheck();
  }, [activeTab, refreshDevices, runHealthCheck]);

  useEffect(() => {
    if (!hasDesktopApi || activeTab !== 'history') return;
    const timer = window.setTimeout(() => {
      void loadHistory(historyQuery);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [activeTab, hasDesktopApi, historyQuery, loadHistory]);

  const onToggleAutoPaste = useCallback(async () => {
    const next = !autoPasteEnabled;
    setAutoPasteEnabled(next);
    if (hasDesktopApi) await window.voiceNoteAI.setAutoPasteEnabled(next);
  }, [autoPasteEnabled, hasDesktopApi]);

  const onChangeToneMode = useCallback(
    async (next: ToneMode) => {
      setToneMode(next);
      if (hasDesktopApi) await window.voiceNoteAI.setToneMode(next);
    },
    [hasDesktopApi],
  );

  const onChangeLatencyProfile = useCallback(
    async (next: LatencyProfile) => {
      setLatencyProfile(next);
      if (hasDesktopApi) {
        await window.voiceNoteAI.updateSettings({ stopGraceMs: STOP_GRACE_BY_PROFILE[next] });
      }
    },
    [hasDesktopApi],
  );

  const normalizeExtraPhrases = useCallback((raw: string) => {
    return raw
      .split(/\r?\n|,/g)
      .map((entry) => entry.replace(/\s+/g, ' ').trim())
      .filter(Boolean);
  }, []);

  const onSaveComprehensionSettings = useCallback(async () => {
    if (!hasDesktopApi) return;
    const extraPhrases = normalizeExtraPhrases(extraPhrasesText);
    const retention = clampHistoryRetentionDays(historyRetentionDays);
    setHistoryRetentionDays(retention);
    await window.voiceNoteAI.updateSettings({
      languageMode,
      extraPhrases,
      formatCommandsEnabled,
      historyEnabled,
      historyRetentionDays: retention,
    });
    toast({ title: 'Salvo com sucesso', description: 'Configurações atualizadas.' });
    if (activeTab === 'history') {
      await loadHistory(historyQuery);
    }
    await runHealthCheck();
  }, [
    activeTab,
    extraPhrasesText,
    formatCommandsEnabled,
    hasDesktopApi,
    historyEnabled,
    historyQuery,
    historyRetentionDays,
    languageMode,
    loadHistory,
    normalizeExtraPhrases,
    runHealthCheck,
    toast,
  ]);

  const persistCanonicalTerms = useCallback(
    async (nextTerms: CanonicalTerm[]) => {
      if (!hasDesktopApi) return;
      await window.voiceNoteAI.updateSettings({ canonicalTerms: nextTerms });
      setCanonicalTerms(nextTerms);
    },
    [hasDesktopApi],
  );

  const onAddCanonicalTerm = useCallback(async () => {
    if (!hasDesktopApi || dictionaryBusy) return;
    const from = normalizeCanonicalValue(newCanonicalFrom);
    const to = normalizeCanonicalValue(newCanonicalTo);
    if (!from || !to) {
      toast({
        title: 'Aviso',
        description: 'Informe origem e destino.',
        variant: 'destructive',
      });
      return;
    }

    const exists = canonicalTerms.some(
      (item) =>
        `${item.from.toLowerCase()}=>${item.to.toLowerCase()}` ===
        `${from.toLowerCase()}=>${to.toLowerCase()}`,
    );
    if (exists) {
      toast({ title: 'Aviso', description: 'Regra já existe.', variant: 'destructive' });
      return;
    }

    try {
      setDictionaryBusy(true);
      await persistCanonicalTerms([...canonicalTerms, { from, to, enabled: true }]);
      setNewCanonicalFrom('');
      setNewCanonicalTo('');
      toast({ title: 'Regra adicionada', description: `${from} → ${to}` });
    } catch (e) {
      toast({ title: 'Falha', description: String(e), variant: 'destructive' });
    } finally {
      setDictionaryBusy(false);
    }
  }, [
    canonicalTerms,
    dictionaryBusy,
    hasDesktopApi,
    newCanonicalFrom,
    newCanonicalTo,
    persistCanonicalTerms,
    toast,
  ]);

  const onToggleCanonicalTerm = useCallback(
    async (index: number, enabled: boolean) => {
      if (!hasDesktopApi || dictionaryBusy) return;
      try {
        setDictionaryBusy(true);
        await persistCanonicalTerms(
          canonicalTerms.map((item, itemIndex) =>
            itemIndex === index ? { ...item, enabled } : item,
          ),
        );
      } finally {
        setDictionaryBusy(false);
      }
    },
    [canonicalTerms, dictionaryBusy, hasDesktopApi, persistCanonicalTerms],
  );

  const onRemoveCanonicalTerm = useCallback(
    async (index: number) => {
      if (!hasDesktopApi || dictionaryBusy) return;
      try {
        setDictionaryBusy(true);
        await persistCanonicalTerms(canonicalTerms.filter((_, itemIndex) => itemIndex !== index));
      } finally {
        setDictionaryBusy(false);
      }
    },
    [canonicalTerms, dictionaryBusy, hasDesktopApi, persistCanonicalTerms],
  );

  const onManualStart = useCallback(async () => {
    if (!canControl || status !== 'idle') return;
    try {
      await begin(crypto.randomUUID());
    } catch (e) {
      setStatusSafely('error');
      setError(String(e));
      toast({ title: 'Falha ao iniciar', description: String(e), variant: 'destructive' });
    }
  }, [begin, canControl, setStatusSafely, status, toast]);

  const onManualStop = useCallback(async () => {
    if (!canControl) return;
    try {
      await end(sessionId || 'force');
    } catch (e) {
      setStatusSafely('error');
      setError(String(e));
      toast({ title: 'Falha ao parar', description: String(e), variant: 'destructive' });
    }
  }, [canControl, end, sessionId, setStatusSafely, toast]);

  const onAddDictionaryTerm = useCallback(async () => {
    if (!hasDesktopApi || dictionaryBusy || !dictionaryAvailable) return;
    const term = newTerm.trim();
    if (!term) {
      toast({
        title: 'Aviso',
        description: 'Informe um termo válido.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setDictionaryBusy(true);
      await window.voiceNoteAI.addDictionaryTerm({ term, hintPt: newHintPt.trim() || undefined });
      setNewTerm('');
      setNewHintPt('');
      await loadDictionary();
      toast({ title: 'Termo adicionado', description: term });
    } catch (e) {
      toast({ title: 'Falha', description: String(e), variant: 'destructive' });
    } finally {
      setDictionaryBusy(false);
    }
  }, [
    dictionaryAvailable,
    dictionaryBusy,
    hasDesktopApi,
    loadDictionary,
    newHintPt,
    newTerm,
    toast,
  ]);

  const onToggleTermEnabled = useCallback(
    async (item: DictionaryTerm, enabled: boolean) => {
      if (!hasDesktopApi || dictionaryBusy || !dictionaryAvailable) return;
      try {
        setDictionaryBusy(true);
        const result = await window.voiceNoteAI.updateDictionaryTerm({ id: item.id, enabled });
        setDictionary((current) =>
          current.map((entry) => (entry.id === result.term.id ? result.term : entry)),
        );
      } finally {
        setDictionaryBusy(false);
      }
    },
    [dictionaryAvailable, dictionaryBusy, hasDesktopApi],
  );

  const onRemoveDictionaryTerm = useCallback(
    async (id: string) => {
      if (!hasDesktopApi || dictionaryBusy || !dictionaryAvailable) return;
      try {
        setDictionaryBusy(true);
        await window.voiceNoteAI.removeDictionaryTerm(id);
        setDictionary((current) => current.filter((item) => item.id !== id));
      } finally {
        setDictionaryBusy(false);
      }
    },
    [dictionaryAvailable, dictionaryBusy, hasDesktopApi],
  );

  const onCopyHistoryEntry = useCallback(
    async (entry: HistoryEntry) => {
      try {
        if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(entry.text);
        }
        toast({ title: 'Copiado', description: 'Transcrição copiada para o clipboard.' });
      } catch (e) {
        toast({
          title: 'Falha ao copiar',
          description: e instanceof Error ? e.message : String(e),
          variant: 'destructive',
        });
      }
    },
    [toast],
  );

  const onRemoveHistoryEntry = useCallback(
    async (id: string) => {
      if (!hasDesktopApi || historyBusy) return;
      try {
        setHistoryBusy(true);
        await window.voiceNoteAI.removeHistoryEntry(id);
        setHistoryEntries((current) => current.filter((entry) => entry.id !== id));
      } finally {
        setHistoryBusy(false);
      }
    },
    [hasDesktopApi, historyBusy],
  );

  const onClearHistory = useCallback(async () => {
    if (!hasDesktopApi || historyBusy) return;
    try {
      setHistoryBusy(true);
      const result = await window.voiceNoteAI.clearHistory();
      setHistoryEntries([]);
      toast({ title: 'Histórico limpo', description: `${result.removed} itens removidos.` });
    } catch (e) {
      toast({
        title: 'Falha ao limpar histórico',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setHistoryBusy(false);
    }
  }, [hasDesktopApi, historyBusy, toast]);

  const onSetMicInputGain = useCallback((value: number) => {
    setMicInputGain(value);
    setInputGain(value);
  }, []);

  return (
    <div className={`h-screen w-screen overflow-hidden text-foreground flex flex-col transition-colors duration-300 ${theme === 'dark' ? 'bg-[#0a0a0c]' : 'bg-[#f8f7f4]'}`}>
      <div className="workspace-shell relative flex-1 w-full overflow-hidden flex bg-transparent">
        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as ActiveTab)}
          className="flex w-full h-full"
        >
          {/* SIDEBAR COMPLETA ESTILO FLOW */}
          <aside
            className={`relative z-10 flex flex-col items-center gap-6 py-6 transition-all duration-300 ease-in-out border-r border-border/10 bg-transparent ${isSidebarExpanded ? 'w-[240px] items-start px-4' : 'w-[80px] px-2'}`}
          >
            {/* LOGO & TITLE */}
            <div className={`flex items-center gap-3 w-full titlebar-drag ${isSidebarExpanded ? 'px-2' : 'justify-center'}`}>
              <div className="flex h-10 w-10 shrink-0 select-none items-center justify-center rounded-xl overflow-hidden shadow-sm bg-black dark:bg-white/10 ring-1 ring-black/5 dark:ring-white/10">
                <img src="./favicon.png" alt="VoxType Logo" className="h-full w-full object-cover" />
              </div>
              {isSidebarExpanded && (
                <div className="flex flex-col select-none overflow-hidden whitespace-nowrap titlebar-drag">
                  <span className="text-base font-bold tracking-tight text-foreground">VoxType</span>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Pro Trial</span>
                </div>
              )}
            </div>

            {/* NAV TABS */}
            <TabsList className="mt-4 flex h-auto w-full flex-col justify-start gap-2 bg-transparent p-0 titlebar-no-drag">
              <TabsTrigger
                value="capture"
                title="Captura"
                className={`group relative flex h-10 w-full items-center rounded-xl bg-transparent text-muted-foreground transition-all duration-200 hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5 data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm border border-transparent data-[state=active]:border-border/50 cursor-pointer outline-none ${isSidebarExpanded ? 'justify-start gap-3 px-3' : 'justify-center px-0'}`}
              >
                <Mic className={`h-4 w-4 shrink-0 transition-transform ${!isSidebarExpanded && 'group-hover:scale-110'}`} />
                {isSidebarExpanded && <span className="text-sm font-medium">Capture</span>}
              </TabsTrigger>

              <TabsTrigger
                value="dictionary"
                title="Dicionário"
                className={`group relative flex h-10 w-full items-center rounded-xl bg-transparent text-muted-foreground transition-all duration-200 hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5 data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm border border-transparent data-[state=active]:border-border/50 cursor-pointer outline-none ${isSidebarExpanded ? 'justify-start gap-3 px-3' : 'justify-center px-0'}`}
              >
                <BookOpen className={`h-4 w-4 shrink-0 transition-transform ${!isSidebarExpanded && 'group-hover:scale-110'}`} />
                {isSidebarExpanded && <span className="text-sm font-medium">Dictionary</span>}
              </TabsTrigger>

              <TabsTrigger
                value="history"
                title="Histórico"
                className={`group relative flex h-10 w-full items-center rounded-xl bg-transparent text-muted-foreground transition-all duration-200 hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5 data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm border border-transparent data-[state=active]:border-border/50 cursor-pointer outline-none ${isSidebarExpanded ? 'justify-start gap-3 px-3' : 'justify-center px-0'}`}
              >
                <History className={`h-4 w-4 shrink-0 transition-transform ${!isSidebarExpanded && 'group-hover:scale-110'}`} />
                {isSidebarExpanded && <span className="text-sm font-medium">History</span>}
              </TabsTrigger>

              <TabsTrigger
                value="settings"
                title="Configurações"
                className={`group relative flex h-10 w-full items-center rounded-xl bg-transparent text-muted-foreground transition-all duration-200 hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5 data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm border border-transparent data-[state=active]:border-border/50 cursor-pointer outline-none mt-4 ${isSidebarExpanded ? 'justify-start gap-3 px-3' : 'justify-center px-0'}`}
              >
                <Settings className={`h-4 w-4 shrink-0 transition-transform ${!isSidebarExpanded && 'group-hover:scale-110'}`} />
                {isSidebarExpanded && <span className="text-sm font-medium">Settings</span>}
              </TabsTrigger>
            </TabsList>

            {/* BOTTOM CONTROLS (Theme & Expand/Collapse) */}
            <div className="mt-auto flex flex-col w-full gap-2 titlebar-no-drag">
              <button
                onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
                title="Alternar Tema"
                className={`flex items-center h-10 rounded-xl text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5 transition-all ${isSidebarExpanded ? 'justify-start gap-3 px-3' : 'justify-center'}`}
              >
                {theme === 'dark' ? <Sun className="h-4 w-4 shrink-0" /> : <Moon className="h-4 w-4 shrink-0" />}
                {isSidebarExpanded && <span className="text-sm font-medium">Alternar Tema</span>}
              </button>

              <button
                onClick={() => setIsSidebarExpanded(!isSidebarExpanded)}
                title={isSidebarExpanded ? "Recolher menu" : "Expandir menu"}
                className={`flex items-center h-10 rounded-xl text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5 transition-all ${isSidebarExpanded ? 'justify-start gap-3 px-3' : 'justify-center'}`}
              >
                {isSidebarExpanded ? <PanelLeftClose className="h-4 w-4 shrink-0" /> : <PanelLeftOpen className="h-4 w-4 shrink-0" />}
                {isSidebarExpanded && <span className="text-sm font-medium">Recolher</span>}
              </button>
            </div>
          </aside>

          {/* MAIN WINDOW WHITE CARD (Flow Style) */}
          <div className="flex min-w-0 flex-1 flex-col relative py-2 pr-2">
            <div className="absolute inset-0 pointer-events-none opacity-[0.03] dark:opacity-[0.15] bg-[radial-gradient(circle_at_50%_0%,_currentColor,_transparent_70%)]" />

            {/* Inner Content Card matches the white center in Flow */}
            <div className="flex-1 flex flex-col bg-card relative z-10 rounded-2xl shadow-sm border border-border overflow-hidden">
              <header className="titlebar-drag relative z-10 flex flex-wrap items-center justify-between gap-4 border-b border-border/40 bg-card/40 px-8 py-4 backdrop-blur-md">
                <div className="min-w-0 titlebar-no-drag">
                  <div className="mt-1 flex items-center gap-3">
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                      Studio Control
                    </h1>
                  </div>
                </div>
                <div className="flex items-center gap-3 titlebar-no-drag">
                  <div className="group flex cursor-default relative items-center gap-3 rounded-full border border-border/50 bg-background px-4 py-2 shadow-sm transition-all">
                    <span
                      className={`relative h-2 w-2 rounded-full ${statusDotClass(status)} transition-colors duration-300`}
                      aria-hidden
                    />
                    <span className="relative text-xs font-semibold tracking-wide text-foreground uppercase">
                      {status}
                    </span>
                  </div>
                  <WindowTitleBar />
                </div>
              </header>

              {/* MAIN SCROLL AREA inside the card */}
              <main className="relative z-10 min-h-0 flex-1 overflow-y-auto px-8 py-6 custom-scrollbar titlebar-no-drag">
                {!hasDesktopApi && (
                  <div className="mb-6 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                    Executando em ambiente Web. A API{' '}
                    <span className="font-mono bg-black/20 dark:bg-white/20 px-1 rounded">window.voiceNoteAI</span>{' '}
                    está indisponível.
                  </div>
                )}
                {hasDesktopApi && runtimeInfo.captureBlockedReason && (
                  <div className="mb-6 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                    {runtimeInfo.captureBlockedReason}
                  </div>
                )}

                <TabsContent
                  value="capture"
                  className="mt-0 outline-none animate-in fade-in slide-in-from-bottom-4 duration-500"
                >
                  <CaptureTab
                    autoPasteEnabled={autoPasteEnabled}
                    canControl={canControl}
                    canStop={status !== 'idle' || Boolean(error) || Boolean(sessionId)}
                    error={error}
                    finalText={finalText}
                    hasDesktopApi={hasDesktopApi}
                    healthItems={visibleHealthItems}
                    healthLoading={healthLoading}
                    hotkeyLabel={hotkeyLabel}
                    onGoToSettings={() => setActiveTab('settings')}
                    onManualStart={() => void onManualStart()}
                    onManualStop={() => void onManualStop()}
                    onRetryHoldHook={() => void onRetryHoldHook()}
                    onRunHealthCheck={() => void runHealthCheck()}
                    onToggleAutoPaste={() => void onToggleAutoPaste()}
                    partial={partial}
                    status={status}
                  />
                </TabsContent>

                <TabsContent
                  value="dictionary"
                  className="mt-0 outline-none animate-in fade-in slide-in-from-bottom-4 duration-500"
                >
                  {activeTab === 'dictionary' ? (
                    <Suspense fallback={tabFallback('Carregando dicionário...')}>
                      <DictionaryTab
                        canonicalTerms={canonicalTerms}
                        dictionary={dictionary}
                        dictionaryAvailable={dictionaryAvailable}
                        dictionaryBusy={dictionaryBusy}
                        hasDesktopApi={hasDesktopApi}
                        newCanonicalFrom={newCanonicalFrom}
                        newCanonicalTo={newCanonicalTo}
                        newHintPt={newHintPt}
                        newTerm={newTerm}
                        onAddCanonicalTerm={() => void onAddCanonicalTerm()}
                        onAddDictionaryTerm={() => void onAddDictionaryTerm()}
                        onDictionaryReload={() => void loadDictionary()}
                        onRemoveCanonicalTerm={(index) => void onRemoveCanonicalTerm(index)}
                        onRemoveDictionaryTerm={(id) => void onRemoveDictionaryTerm(id)}
                        onSetNewCanonicalFrom={setNewCanonicalFrom}
                        onSetNewCanonicalTo={setNewCanonicalTo}
                        onSetNewHintPt={setNewHintPt}
                        onSetNewTerm={setNewTerm}
                        onToggleCanonicalTerm={(index, enabled) =>
                          void onToggleCanonicalTerm(index, enabled)
                        }
                        onToggleTermEnabled={(item, enabled) =>
                          void onToggleTermEnabled(item, enabled)
                        }
                      />
                    </Suspense>
                  ) : null}
                </TabsContent>

                <TabsContent
                  value="history"
                  className="mt-0 outline-none animate-in fade-in slide-in-from-bottom-4 duration-500"
                >
                  {activeTab === 'history' ? (
                    <Suspense fallback={tabFallback('Carregando histórico...')}>
                      <HistoryTab
                        hasDesktopApi={hasDesktopApi}
                        historyBusy={historyBusy}
                        historyEntries={historyEntries}
                        historyLoading={historyLoading}
                        historyQuery={historyQuery}
                        onClearHistory={() => void onClearHistory()}
                        onCopyHistoryEntry={(entry) => void onCopyHistoryEntry(entry)}
                        onRefreshHistory={() => void loadHistory(historyQuery)}
                        onRemoveHistoryEntry={(id) => void onRemoveHistoryEntry(id)}
                        onSetHistoryQuery={setHistoryQuery}
                      />
                    </Suspense>
                  ) : null}
                </TabsContent>

                <TabsContent
                  value="settings"
                  className="mt-0 outline-none animate-in fade-in slide-in-from-bottom-4 duration-500"
                >
                  {activeTab === 'settings' ? (
                    <Suspense fallback={tabFallback('Carregando configurações...')}>
                      <SettingsTab
                        extraPhrasesText={extraPhrasesText}
                        formatCommandsEnabled={formatCommandsEnabled}
                        hasDesktopApi={hasDesktopApi}
                        historyEnabled={historyEnabled}
                        historyRetentionDays={historyRetentionDays}
                        languageMode={languageMode}
                        latencyProfile={latencyProfile}
                        micDeviceId={micDeviceId}
                        micDevices={micDevices}
                        micInputGain={micInputGain}
                        onChangeLatencyProfile={(value) => void onChangeLatencyProfile(value)}
                        onChangeToneMode={(value) => void onChangeToneMode(value)}
                        onSaveComprehensionSettings={() => void onSaveComprehensionSettings()}
                        onSetExtraPhrasesText={setExtraPhrasesText}
                        onSetFormatCommandsEnabled={setFormatCommandsEnabled}
                        onSetHistoryEnabled={setHistoryEnabled}
                        onSetHistoryRetentionDays={(value) =>
                          setHistoryRetentionDays(clampHistoryRetentionDays(value))
                        }
                        onSetInputGain={onSetMicInputGain}
                        onSetLanguageMode={setLanguageMode}
                        onSetMicDeviceId={setMicDeviceId}
                        toneMode={toneMode}
                      />
                    </Suspense>
                  ) : null}
                </TabsContent>
              </main>
            </div>
          </div>
        </Tabs>
      </div>
    </div>
  );
};

export default Index;
