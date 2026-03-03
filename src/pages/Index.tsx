import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  onCaptureIssue,
  primeMicrophone,
  setInputGain,
  startCapture,
  stopCapture,
  warmupCapturePipeline,
} from '@/audio/capture';
import HudIndicator from '@/components/HudIndicator';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import {
  STOP_GRACE_BY_PROFILE,
  latencyProfileFromStopGrace,
  type LatencyProfile,
} from '@/lib/latency';
import type {
  CanonicalTerm,
  DictionaryTerm,
  HealthStatus,
  HistoryEntry,
  RuntimeInfo,
} from '@/electron';
import { BookOpen, History, Mic, Settings } from 'lucide-react';

type Status = 'idle' | 'listening' | 'finalizing' | 'error';
// Extensão para mapeamento de cores (injeta os novos estados virtuais se necessários no futuro)
type ExtendedStatus = Status | 'injecting' | 'success';

type AudioDevice = { deviceId: string; label: string };
type ToneMode = 'formal' | 'casual' | 'very-casual';
type LanguageMode = 'pt-BR' | 'en-US' | 'dual';

const MIC_STORAGE_KEY = 'voice-note-ai:micDeviceId';
const MIC_GAIN_STORAGE_KEY = 'voice-note-ai:micInputGain';

// Mapping de Cores do HUD Premium
function statusDotClass(status: ExtendedStatus) {
  switch (status) {
    case 'listening':
      return 'bg-state-listening shadow-[0_0_0_3px_rgba(244,63,94,0.15)]';
    case 'finalizing':
      return 'bg-state-finalizing shadow-[0_0_0_3px_rgba(139,92,246,0.15)]';
    case 'injecting':
      return 'bg-state-injecting shadow-[0_0_0_3px_rgba(14,165,233,0.15)]';
    case 'success':
      return 'bg-state-success shadow-[0_0_0_3px_rgba(16,185,129,0.15)]';
    case 'error':
      return 'bg-state-error shadow-[0_0_0_3px_rgba(249,115,22,0.15)]';
    default:
      return 'bg-white/30'; // idle
  }
}

const DEFAULT_RUNTIME_INFO: RuntimeInfo = {
  hotkeyLabel: 'Ctrl+Win',
  hotkeyMode: 'unavailable',
  holdToTalkActive: false,
  holdRequired: true,
  captureBlockedReason: 'PTT indisponível: hook global não carregou.',
};

const HOTKEY_MODE_LABEL: Record<RuntimeInfo['hotkeyMode'], string> = {
  hold: 'Hold-to-talk',
  'toggle-primary': 'Toggle (primary)',
  'toggle-fallback': 'Toggle (fallback)',
  unavailable: 'Indisponível',
};

type UiHealthItem = {
  id: 'azure' | 'network' | 'hook' | 'microphone';
  status: HealthStatus;
  message: string;
};

function healthDotClass(status: HealthStatus) {
  if (status === 'ok') return 'bg-state-success';
  if (status === 'warn') return 'bg-state-finalizing';
  return 'bg-state-error';
}

function healthLabel(status: HealthStatus) {
  if (status === 'ok') return 'OK';
  if (status === 'warn') return 'Aviso';
  return 'Erro';
}

function normalizeCanonicalValue(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function clampHistoryRetentionDays(value: number) {
  if (!Number.isFinite(value)) return 30;
  return Math.max(1, Math.min(365, Math.round(value)));
}

function formatHistoryDate(value: string) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return new Date(parsed).toLocaleString();
}

const Index = () => {
  const { toast } = useToast();
  const hasDesktopApi = typeof window !== 'undefined' && Boolean(window.voiceNoteAI);
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
  const [activeTab, setActiveTab] = useState<'capture' | 'dictionary' | 'history' | 'settings'>(
    'capture',
  );
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
  const partialFrameRef = useRef<number | null>(null);
  const partialPendingRef = useRef<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  const canControl = useMemo(
    () => hasDesktopApi && !runtimeInfo.captureBlockedReason,
    [hasDesktopApi, runtimeInfo.captureBlockedReason],
  );
  const hotkeyLabel = runtimeInfo.hotkeyLabel || DEFAULT_RUNTIME_INFO.hotkeyLabel;
  const effectiveHotkeyLabel = runtimeInfo.holdRequired ? 'Ctrl+Win' : hotkeyLabel;
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

  const refreshDevices = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return;
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioInputs = devices
      .filter((d) => d.kind === 'audioinput')
      .map((d) => ({
        deviceId: d.deviceId,
        label: d.label || `Microfone (${d.deviceId.slice(0, 6)}…)`,
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
    const audioInputs = devices.filter((d) => d.kind === 'audioinput');
    if (audioInputs.length === 0) {
      return {
        id: 'microphone',
        status: 'error',
        message: 'Nenhum microfone detectado.',
      };
    }

    if (micDeviceId && !audioInputs.some((d) => d.deviceId === micDeviceId)) {
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
      const settings = await window.voiceNoteAI.getSettings();
      setAutoPasteEnabled(Boolean(settings.autoPasteEnabled));
      setToneMode(
        settings.toneMode === 'formal'
          ? 'formal'
          : settings.toneMode === 'very-casual'
            ? 'very-casual'
            : 'casual',
      );
      setLanguageMode(
        settings.languageMode === 'dual'
          ? 'dual'
          : settings.languageMode === 'en-US'
            ? 'en-US'
            : 'pt-BR',
      );
      setLatencyProfile(latencyProfileFromStopGrace(settings.stopGraceMs));
      setExtraPhrasesText((settings.extraPhrases ?? []).join('\n'));
      setCanonicalTerms(settings.canonicalTerms ?? []);
      setFormatCommandsEnabled(settings.formatCommandsEnabled !== false);
      setHistoryEnabled(settings.historyEnabled !== false);
      setHistoryRetentionDays(clampHistoryRetentionDays(settings.historyRetentionDays ?? 30));
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
    async (newSessionId: string, options?: { sttWarmStart?: boolean }) => {
      setError(null);
      setFinalText('');
      setPartial('');
      partialPendingRef.current = null;
      setSessionId(newSessionId);
      sessionIdRef.current = newSessionId;
      setStatusSafely('listening');

      void options;
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
    },
    [micDeviceId, micInputGain, setStatusSafely],
  );

  const end = useCallback(
    async (currentSessionId: string) => {
      setStatusSafely('finalizing');
      await stopCapture();
      await window.voiceNoteAI.stopStt(currentSessionId);
      setStatusSafely('idle');
      setSessionId(null);
      sessionIdRef.current = null;
    },
    [setStatusSafely],
  );

  useEffect(() => {
    return () => {
      if (partialFrameRef.current !== null) cancelAnimationFrame(partialFrameRef.current);
    };
  }, []);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

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
    if (!hasDesktopApi) return;

    void warmupCapturePipeline();
    void primeMicrophone();
    void ensureSelectedMicrophoneAvailable();
    void loadSettings();
    void loadRuntimeInfo();
    void loadDictionary();
    void loadHistory('');
    void runHealthCheck();

    const offCaptureIssue = onCaptureIssue((event) => {
      if (event.code === 'devicechange') {
        void ensureSelectedMicrophoneAvailable();
        void runHealthCheck();
        return;
      }

      if (event.code === 'device-missing-fallback') {
        setMicDeviceId('');
        toast({ title: 'Fallback de microfone', description: event.message });
        void ensureSelectedMicrophoneAvailable();
        void runHealthCheck();
        return;
      }

      if (event.code === 'device-disconnected') {
        toast({
          title: 'Microfone desconectado',
          description: event.message,
          variant: 'destructive',
        });
        void ensureSelectedMicrophoneAvailable();
        void runHealthCheck();
      }
    });

    const offStart = window.voiceNoteAI.onCaptureStart(async ({ sessionId, sttWarmStart }) => {
      try {
        await begin(sessionId, { sttWarmStart });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        setStatusSafely('error');
        setError(message);
        toast({ title: 'Falha na captura', description: message, variant: 'destructive' });
      }
    });

    const offStop = window.voiceNoteAI.onCaptureStop(async ({ sessionId }) => {
      if (sessionIdRef.current !== sessionId) return;
      try {
        await end(sessionId);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        setStatusSafely('error');
        setError(message);
        toast({ title: 'Falha na finalização', description: message, variant: 'destructive' });
      }
    });

    const offPartial = window.voiceNoteAI.onSttPartial((e) => {
      if (e.sessionId !== sessionIdRef.current) return;
      pushPartial(e.text);
    });

    const offFinal = window.voiceNoteAI.onSttFinal((e) => {
      if (e.sessionId !== sessionIdRef.current) return;
      setFinalText(e.text);
      partialPendingRef.current = null;
      setPartial('');
    });

    const offErr = window.voiceNoteAI.onSttError((e) => {
      if (e.sessionId !== sessionIdRef.current) return;
      setStatusSafely('error');
      setError(e.message);
    });

    const offAppError = window.voiceNoteAI.onAppError((e) => {
      setStatusSafely('error');
      setError(e.message);
      toast({ title: 'Aviso do sistema', description: e.message, variant: 'destructive' });
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
    begin,
    end,
    ensureSelectedMicrophoneAvailable,
    hasDesktopApi,
    loadDictionary,
    loadHistory,
    loadRuntimeInfo,
    loadSettings,
    pushPartial,
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
    if (!hasDesktopApi || activeTab !== 'history') return;
    const timer = window.setTimeout(() => {
      void loadHistory(historyQuery);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [activeTab, hasDesktopApi, historyQuery, loadHistory]);

  async function onToggleAutoPaste() {
    const next = !autoPasteEnabled;
    setAutoPasteEnabled(next);
    if (hasDesktopApi) await window.voiceNoteAI.setAutoPasteEnabled(next);
  }

  async function onChangeToneMode(next: ToneMode) {
    setToneMode(next);
    if (hasDesktopApi) await window.voiceNoteAI.setToneMode(next);
  }

  async function onChangeLatencyProfile(next: LatencyProfile) {
    setLatencyProfile(next);
    if (hasDesktopApi)
      await window.voiceNoteAI.updateSettings({ stopGraceMs: STOP_GRACE_BY_PROFILE[next] });
  }

  function normalizeExtraPhrases(raw: string) {
    return raw
      .split(/\r?\n|,/g)
      .map((s) => s.replace(/\s+/g, ' ').trim())
      .filter(Boolean);
  }

  async function onSaveComprehensionSettings() {
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
  }

  async function persistCanonicalTerms(nextTerms: CanonicalTerm[]) {
    if (!hasDesktopApi) return;
    await window.voiceNoteAI.updateSettings({ canonicalTerms: nextTerms });
    setCanonicalTerms(nextTerms);
  }

  async function onAddCanonicalTerm() {
    if (!hasDesktopApi || dictionaryBusy) return;
    const from = normalizeCanonicalValue(newCanonicalFrom);
    const to = normalizeCanonicalValue(newCanonicalTo);
    if (!from || !to)
      return toast({
        title: 'Aviso',
        description: 'Informe origem e destino.',
        variant: 'destructive',
      });

    const exists = canonicalTerms.some(
      (item) =>
        `${item.from.toLowerCase()}=>${item.to.toLowerCase()}` ===
        `${from.toLowerCase()}=>${to.toLowerCase()}`,
    );
    if (exists)
      return toast({ title: 'Aviso', description: 'Regra já existe.', variant: 'destructive' });

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
  }

  async function onToggleCanonicalTerm(index: number, enabled: boolean) {
    if (!hasDesktopApi || dictionaryBusy) return;
    try {
      setDictionaryBusy(true);
      await persistCanonicalTerms(
        canonicalTerms.map((item, i) => (i === index ? { ...item, enabled } : item)),
      );
    } finally {
      setDictionaryBusy(false);
    }
  }

  async function onRemoveCanonicalTerm(index: number) {
    if (!hasDesktopApi || dictionaryBusy) return;
    try {
      setDictionaryBusy(true);
      await persistCanonicalTerms(canonicalTerms.filter((_, i) => i !== index));
    } finally {
      setDictionaryBusy(false);
    }
  }

  async function onManualStart() {
    if (!canControl || status !== 'idle') return;
    try {
      await begin(crypto.randomUUID());
    } catch (e) {
      setStatusSafely('error');
      setError(String(e));
      toast({ title: 'Falha ao iniciar', description: String(e), variant: 'destructive' });
    }
  }

  async function onManualStop() {
    if (!canControl || !sessionId) return;
    try {
      await end(sessionId);
    } catch (e) {
      setStatusSafely('error');
      setError(String(e));
      toast({ title: 'Falha ao parar', description: String(e), variant: 'destructive' });
    }
  }

  async function onAddDictionaryTerm() {
    if (!hasDesktopApi || dictionaryBusy || !dictionaryAvailable) return;
    const term = newTerm.trim();
    if (!term)
      return toast({
        title: 'Aviso',
        description: 'Informe um termo válido.',
        variant: 'destructive',
      });

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
  }

  async function onToggleTermEnabled(item: DictionaryTerm, enabled: boolean) {
    if (!hasDesktopApi || dictionaryBusy || !dictionaryAvailable) return;
    try {
      setDictionaryBusy(true);
      const result = await window.voiceNoteAI.updateDictionaryTerm({ id: item.id, enabled });
      setDictionary((curr) =>
        curr.map((entry) => (entry.id === result.term.id ? result.term : entry)),
      );
    } finally {
      setDictionaryBusy(false);
    }
  }

  async function onRemoveDictionaryTerm(id: string) {
    if (!hasDesktopApi || dictionaryBusy || !dictionaryAvailable) return;
    try {
      setDictionaryBusy(true);
      await window.voiceNoteAI.removeDictionaryTerm(id);
      setDictionary((curr) => curr.filter((item) => item.id !== id));
    } finally {
      setDictionaryBusy(false);
    }
  }

  async function onCopyHistoryEntry(entry: HistoryEntry) {
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
  }

  async function onRemoveHistoryEntry(id: string) {
    if (!hasDesktopApi || historyBusy) return;
    try {
      setHistoryBusy(true);
      await window.voiceNoteAI.removeHistoryEntry(id);
      setHistoryEntries((curr) => curr.filter((entry) => entry.id !== id));
    } finally {
      setHistoryBusy(false);
    }
  }

  async function onClearHistory() {
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
  }

  return (
    <div className="min-h-screen overflow-y-auto bg-transparent text-foreground">
      <div className="mx-auto w-full max-w-[1240px] px-[clamp(0.8rem,1.8vw,1.4rem)] py-[clamp(0.8rem,1.8vw,1.2rem)]">
        <div className="workspace-shell relative w-full overflow-hidden rounded-[28px]">
          <Tabs
            value={activeTab}
            onValueChange={(v) =>
              setActiveTab(v as 'capture' | 'dictionary' | 'history' | 'settings')
            }
            className="flex w-full min-h-[85vh]"
          >
            {/* Sidebar Tabs */}
            <aside className="flex w-[80px] flex-col items-center gap-4 border-r border-white/5 bg-black/20 py-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 shadow-sm">
                <div className="h-5 w-5 rounded-md bg-white/90" />
              </div>
              <TabsList className="flex h-auto w-full flex-col items-center justify-start gap-2 bg-transparent p-2">
                <TabsTrigger
                  value="capture"
                  title="Captura"
                  className="h-12 w-12 rounded-xl bg-transparent text-white/50 hover:bg-white/5 hover:text-white data-[state=active]:bg-white/10 data-[state=active]:text-white data-[state=active]:shadow-none transition-colors"
                >
                  <Mic className="h-5 w-5" />
                </TabsTrigger>
                <TabsTrigger
                  value="dictionary"
                  title="Dicionário"
                  className="h-12 w-12 rounded-xl bg-transparent text-white/50 hover:bg-white/5 hover:text-white data-[state=active]:bg-white/10 data-[state=active]:text-white data-[state=active]:shadow-none transition-colors"
                >
                  <BookOpen className="h-5 w-5" />
                </TabsTrigger>
                <TabsTrigger
                  value="settings"
                  title="Configurações"
                  className="h-12 w-12 rounded-xl bg-transparent text-white/50 hover:bg-white/5 hover:text-white data-[state=active]:bg-white/10 data-[state=active]:text-white data-[state=active]:shadow-none transition-colors"
                >
                  <Settings className="h-5 w-5" />
                </TabsTrigger>
                <TabsTrigger
                  value="history"
                  title="Histórico"
                  className="h-12 w-12 rounded-xl bg-transparent text-white/50 hover:bg-white/5 hover:text-white data-[state=active]:bg-white/10 data-[state=active]:text-white data-[state=active]:shadow-none transition-colors"
                >
                  <History className="h-5 w-5" />
                </TabsTrigger>
              </TabsList>
            </aside>

            {/* Main Content Area */}
            <div className="flex min-w-0 flex-1 flex-col bg-transparent">
              {/* Header */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 bg-black/10 px-8 py-6">
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold tracking-widest text-white/40 uppercase">
                    Voice Note AI
                  </div>
                  <div className="mt-1 text-2xl font-medium tracking-tight text-white/90">
                    Studio Control
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2.5 rounded-full border border-white/10 bg-black/30 px-3.5 py-1.5 backdrop-blur-md">
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${statusDotClass(status)} transition-colors duration-300`}
                      aria-hidden
                    />
                    <span className="text-xs font-medium text-white/70 capitalize">{status}</span>
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className="min-h-0 flex-1 overflow-y-auto px-8 py-8">
                {!hasDesktopApi && (
                  <div className="mb-6 rounded-2xl border border-state-error/30 bg-state-error/10 p-4 text-sm text-state-error">
                    Executando em ambiente Web. A API{' '}
                    <span className="font-mono bg-black/20 px-1 rounded">window.voiceNoteAI</span>{' '}
                    está indisponível.
                  </div>
                )}
                {hasDesktopApi && runtimeInfo.captureBlockedReason && (
                  <div className="mb-6 rounded-2xl border border-state-error/30 bg-state-error/10 p-4 text-sm text-state-error">
                    {runtimeInfo.captureBlockedReason}
                  </div>
                )}

                {/* TAB: CAPTURE */}
                <TabsContent value="capture" className="mt-0 space-y-4 outline-none">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle>Health Check</CardTitle>
                      <CardDescription>
                        Verificação de ambiente (Azure, rede, hook e microfone).
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void runHealthCheck()}
                          disabled={!hasDesktopApi || healthLoading}
                        >
                          {healthLoading ? 'Verificando...' : 'Rodar Health Check'}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void onRetryHoldHook()}
                          disabled={!hasDesktopApi || healthLoading}
                        >
                          Recuperar Hook
                        </Button>
                      </div>
                      <div className="space-y-2">
                        {visibleHealthItems.map((item) => (
                          <div
                            key={item.id}
                            className="flex items-start gap-3 rounded-xl border border-white/5 bg-black/20 px-3 py-2.5"
                          >
                            <span
                              className={`mt-1 h-2.5 w-2.5 rounded-full ${healthDotClass(item.status)}`}
                            />
                            <div className="min-w-0">
                              <div className="text-xs font-semibold uppercase tracking-wide text-white/60">
                                {item.id} · {healthLabel(item.status)}
                              </div>
                              <div className="text-sm text-white/80">{item.message}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  <div className="mb-6 rounded-[24px] border border-white/5 bg-black/20 px-8 py-8 shadow-inner">
                    <div className="text-2xl font-medium text-white/90 tracking-tight">
                      Dite em qualquer app, sem atrito
                    </div>
                    <div className="mt-2 max-w-2xl text-sm leading-relaxed text-white/60">
                      Aperte e segure{' '}
                      <span className="font-mono bg-white/10 px-1.5 py-0.5 rounded text-white/80">
                        {effectiveHotkeyLabel}
                      </span>
                      , fale naturalmente e solte. O HUD confirmará o estado e tentará colar o texto
                      automaticamente.
                    </div>
                    <div className="mt-6 flex flex-wrap gap-3">
                      <Button
                        onClick={() => void onManualStart()}
                        disabled={!canControl || status !== 'idle'}
                      >
                        Testar agora
                      </Button>
                      <Button variant="outline" onClick={() => setActiveTab('settings')}>
                        Configurações
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <Card>
                      <CardHeader>
                        <CardTitle>Controle Manual</CardTitle>
                        <CardDescription>Para debug e testes de injeção local.</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="flex gap-2">
                          <Button
                            onClick={onManualStart}
                            disabled={!canControl || status !== 'idle'}
                          >
                            Start
                          </Button>
                          <Button
                            variant="outline"
                            onClick={onManualStop}
                            disabled={!canControl || !sessionId || status === 'idle'}
                          >
                            Stop
                          </Button>
                        </div>
                        <div className="flex items-center justify-between rounded-xl border border-white/5 bg-white/5 px-4 py-3">
                          <span className="text-sm text-white/80">Auto-paste (Windows)</span>
                          <Switch
                            checked={autoPasteEnabled}
                            onCheckedChange={() => void onToggleAutoPaste()}
                            disabled={!canControl}
                          />
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle>HUD Preview</CardTitle>
                        <CardDescription>Indicador visual (always-on-top).</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="rounded-xl border border-white/5 bg-black/40 p-4 flex items-center justify-center min-h-[120px]">
                          <HudIndicator state={status} />
                        </div>
                        {error && (
                          <div className="mt-3 text-sm text-state-error">Erro: {error}</div>
                        )}
                      </CardContent>
                    </Card>
                  </div>

                  <Card>
                    <CardHeader>
                      <CardTitle>Console de Transcrição</CardTitle>
                      <CardDescription>Saída de texto em tempo real.</CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-4 lg:grid-cols-2">
                      <div className="space-y-2">
                        <div className="text-xs font-medium text-white/50 uppercase tracking-wider">
                          Partial
                        </div>
                        <div className="min-h-[80px] rounded-xl border border-white/5 bg-black/20 p-3 text-sm text-white/80 font-mono transition-colors">
                          {partial || <span className="text-white/20">Aguardando fala...</span>}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="text-xs font-medium text-white/50 uppercase tracking-wider">
                          Final
                        </div>
                        <div className="min-h-[80px] rounded-xl border border-white/5 bg-black/20 p-3 text-sm text-white/90 whitespace-pre-wrap">
                          {finalText || <span className="text-white/20">—</span>}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* TAB: DICTIONARY */}
                <TabsContent value="dictionary" className="mt-0 space-y-4 outline-none">
                  <Card>
                    <CardHeader>
                      <CardTitle>Dicionário Primário</CardTitle>
                      <CardDescription>
                        Refine a engine de STT para reconhecer termos complexos ou jargões.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {!dictionaryAvailable && (
                        <div className="rounded-xl border border-state-error/20 bg-state-error/10 p-3 text-sm text-state-error">
                          Indisponível. Reinicie o App Desktop.
                        </div>
                      )}
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Input
                          placeholder="Termo em inglês (ex: Tailwind)"
                          value={newTerm}
                          onChange={(e) => setNewTerm(e.target.value)}
                          disabled={!hasDesktopApi || dictionaryBusy || !dictionaryAvailable}
                        />
                        <Input
                          placeholder="Hint de pronúncia PT (opcional)"
                          value={newHintPt}
                          onChange={(e) => setNewHintPt(e.target.value)}
                          disabled={!hasDesktopApi || dictionaryBusy || !dictionaryAvailable}
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          onClick={() => void onAddDictionaryTerm()}
                          disabled={!hasDesktopApi || dictionaryBusy || !dictionaryAvailable}
                        >
                          Adicionar Regra
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => void loadDictionary()}
                          disabled={!hasDesktopApi || dictionaryBusy || !dictionaryAvailable}
                        >
                          Recarregar
                        </Button>
                      </div>

                      <div className="max-h-[350px] space-y-2 overflow-y-auto pr-2 mt-4">
                        {dictionary.length === 0 ? (
                          <div className="rounded-xl border border-white/5 bg-white/5 p-4 text-sm text-white/40 text-center">
                            Nenhum termo cadastrado.
                          </div>
                        ) : (
                          dictionary.map((item) => (
                            <div
                              key={item.id}
                              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/5 bg-white/5 p-3 hover:bg-white/10 transition-colors"
                            >
                              <div>
                                <div className="text-sm font-medium text-white/90">{item.term}</div>
                                <div className="text-xs text-white/50">
                                  {item.hintPt ? `Dica PT: ${item.hintPt}` : 'Sem dica'}
                                </div>
                              </div>
                              <div className="flex items-center gap-4">
                                <Switch
                                  checked={item.enabled}
                                  disabled={
                                    dictionaryBusy || !hasDesktopApi || !dictionaryAvailable
                                  }
                                  onCheckedChange={(enabled) =>
                                    void onToggleTermEnabled(item, enabled)
                                  }
                                />
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 px-3 text-xs"
                                  disabled={
                                    dictionaryBusy || !hasDesktopApi || !dictionaryAvailable
                                  }
                                  onClick={() => void onRemoveDictionaryTerm(item.id)}
                                >
                                  Remover
                                </Button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Correções Pós-Processamento</CardTitle>
                      <CardDescription>
                        Normalização textual exata (RegEx e Case Matching).
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                        <Input
                          placeholder="Origem (ex: react native|reactnative)"
                          value={newCanonicalFrom}
                          onChange={(e) => setNewCanonicalFrom(e.target.value)}
                          disabled={!hasDesktopApi || dictionaryBusy}
                        />
                        <Input
                          placeholder="Destino (ex: React Native)"
                          value={newCanonicalTo}
                          onChange={(e) => setNewCanonicalTo(e.target.value)}
                          disabled={!hasDesktopApi || dictionaryBusy}
                        />
                        <Button
                          onClick={() => void onAddCanonicalTerm()}
                          disabled={!hasDesktopApi || dictionaryBusy}
                        >
                          Adicionar
                        </Button>
                      </div>

                      <div className="max-h-[300px] space-y-2 overflow-y-auto pr-2">
                        {canonicalTerms.length === 0 ? (
                          <div className="rounded-xl border border-white/5 bg-white/5 p-4 text-sm text-white/40 text-center">
                            Nenhuma correção pós-processo.
                          </div>
                        ) : (
                          canonicalTerms.map((item, index) => (
                            <div
                              key={`${item.from}-${index}`}
                              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/5 bg-white/5 p-3 hover:bg-white/10 transition-colors"
                            >
                              <div>
                                <div className="text-sm font-medium font-mono text-white/80">
                                  {item.from} <span className="text-white/40 mx-2">→</span>{' '}
                                  <span className="text-white/90">{item.to}</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-4">
                                <Switch
                                  checked={item.enabled}
                                  disabled={!hasDesktopApi || dictionaryBusy}
                                  onCheckedChange={(enabled) =>
                                    void onToggleCanonicalTerm(index, enabled)
                                  }
                                />
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 px-3 text-xs"
                                  disabled={!hasDesktopApi || dictionaryBusy}
                                  onClick={() => void onRemoveCanonicalTerm(index)}
                                >
                                  Remover
                                </Button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* TAB: HISTORY */}
                <TabsContent value="history" className="mt-0 space-y-4 outline-none">
                  <Card>
                    <CardHeader>
                      <CardTitle>Histórico Local</CardTitle>
                      <CardDescription>
                        Transcrições finais salvas localmente para consulta rápida.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Input
                          placeholder="Buscar por trecho..."
                          value={historyQuery}
                          onChange={(e) => setHistoryQuery(e.target.value)}
                          disabled={!hasDesktopApi || historyLoading}
                        />
                        <Button
                          variant="outline"
                          onClick={() => void loadHistory(historyQuery)}
                          disabled={!hasDesktopApi || historyLoading}
                        >
                          {historyLoading ? 'Carregando...' : 'Recarregar'}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => void onClearHistory()}
                          disabled={!hasDesktopApi || historyBusy}
                        >
                          Limpar Histórico
                        </Button>
                      </div>

                      <div className="max-h-[470px] space-y-2 overflow-y-auto pr-2">
                        {historyEntries.length === 0 ? (
                          <div className="rounded-xl border border-white/5 bg-white/5 p-4 text-sm text-white/40 text-center">
                            Nenhuma transcrição salva.
                          </div>
                        ) : (
                          historyEntries.map((entry) => (
                            <div
                              key={entry.id}
                              className="rounded-xl border border-white/5 bg-white/5 p-3"
                            >
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                  <div className="text-xs uppercase tracking-wide text-white/45">
                                    {formatHistoryDate(entry.createdAt)} · sessão{' '}
                                    {entry.sessionId.slice(0, 8)} ·{' '}
                                    {entry.pasted ? 'colado' : 'copiado'}
                                  </div>
                                  <div className="mt-2 whitespace-pre-wrap text-sm text-white/90">
                                    {entry.text}
                                  </div>
                                  <div className="mt-2 text-xs text-white/50">
                                    duração {entry.sessionDurationMs}ms · injeção{' '}
                                    {entry.injectTotalMs}ms · retries {entry.retryCount}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 px-3 text-xs"
                                    onClick={() => void onCopyHistoryEntry(entry)}
                                  >
                                    Copiar
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 px-3 text-xs"
                                    disabled={historyBusy}
                                    onClick={() => void onRemoveHistoryEntry(entry.id)}
                                  >
                                    Remover
                                  </Button>
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* TAB: SETTINGS */}
                <TabsContent value="settings" className="mt-0 space-y-4 outline-none">
                  <Card>
                    <CardHeader>
                      <CardTitle>Configurações de Áudio e IA</CardTitle>
                      <CardDescription>
                        Parâmetros avançados de captura e estilo de transcrição.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-6 sm:grid-cols-2">
                      {/* Mic Select */}
                      <div className="space-y-2">
                        <label className="text-xs font-medium text-white/60 uppercase tracking-wider">
                          Interface de Áudio
                        </label>
                        <select
                          className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-white/20"
                          value={micDeviceId}
                          onChange={(e) => setMicDeviceId(e.target.value)}
                          disabled={!hasDesktopApi}
                        >
                          <option value="">Sistema (Padrão)</option>
                          {micDevices.map((d) => (
                            <option key={d.deviceId} value={d.deviceId}>
                              {d.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Mic Gain */}
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <label className="text-xs font-medium text-white/60 uppercase tracking-wider">
                            Ganho Analógico
                          </label>
                          <span className="text-xs font-mono text-white/40">
                            {micInputGain.toFixed(2)}x
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0.5}
                          max={2}
                          step={0.05}
                          value={micInputGain}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            setMicInputGain(v);
                            setInputGain(v);
                          }}
                          disabled={!hasDesktopApi}
                          className="w-full accent-white"
                        />
                      </div>

                      {/* Latency */}
                      <div className="space-y-2">
                        <label className="text-xs font-medium text-white/60 uppercase tracking-wider">
                          Perfil de Latência
                        </label>
                        <select
                          className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-white/20"
                          value={latencyProfile}
                          onChange={(e) =>
                            void onChangeLatencyProfile(e.target.value as LatencyProfile)
                          }
                          disabled={!hasDesktopApi}
                        >
                          <option value="fast">Fast (Baixa retenção)</option>
                          <option value="balanced">Balanced</option>
                          <option value="accurate">Accurate (Maior buffer)</option>
                        </select>
                      </div>

                      {/* Tone */}
                      <div className="space-y-2">
                        <label className="text-xs font-medium text-white/60 uppercase tracking-wider">
                          Estilo de Escrita
                        </label>
                        <select
                          className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-white/20"
                          value={toneMode}
                          onChange={(e) => void onChangeToneMode(e.target.value as ToneMode)}
                          disabled={!hasDesktopApi}
                        >
                          <option value="formal">Formal</option>
                          <option value="casual">Casual (Padrão)</option>
                          <option value="very-casual">Very Casual</option>
                        </select>
                      </div>

                      {/* Language */}
                      <div className="space-y-2">
                        <label className="text-xs font-medium text-white/60 uppercase tracking-wider">
                          Motor Primário
                        </label>
                        <select
                          className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-white/20"
                          value={languageMode}
                          onChange={(e) => setLanguageMode(e.target.value as LanguageMode)}
                          disabled={!hasDesktopApi}
                        >
                          <option value="pt-BR">Português (Brasil)</option>
                          <option value="en-US">Inglês (US)</option>
                          <option value="dual">Auto-detect (Dual Pass)</option>
                        </select>
                      </div>

                      {/* Toggles */}
                      <div className="space-y-4 pt-2">
                        <div className="flex items-center justify-between rounded-xl border border-white/5 bg-white/5 px-4 py-3">
                          <span className="text-sm text-white/80">
                            Comandos Estruturais{' '}
                            <span className="text-white/40 text-xs">(Nova linha, ponto)</span>
                          </span>
                          <Switch
                            checked={formatCommandsEnabled}
                            onCheckedChange={setFormatCommandsEnabled}
                            disabled={!hasDesktopApi}
                          />
                        </div>
                        <div className="flex items-center justify-between rounded-xl border border-white/5 bg-white/5 px-4 py-3">
                          <span className="text-sm text-white/80">Salvar histórico local</span>
                          <Switch
                            checked={historyEnabled}
                            onCheckedChange={setHistoryEnabled}
                            disabled={!hasDesktopApi}
                          />
                        </div>
                        <div className="space-y-2 rounded-xl border border-white/5 bg-white/5 px-4 py-3">
                          <label className="text-xs font-medium text-white/60 uppercase tracking-wider">
                            Retenção (dias)
                          </label>
                          <Input
                            type="number"
                            min={1}
                            max={365}
                            value={historyRetentionDays}
                            onChange={(e) =>
                              setHistoryRetentionDays(
                                clampHistoryRetentionDays(Number(e.target.value)),
                              )
                            }
                            disabled={!hasDesktopApi}
                          />
                        </div>
                      </div>

                      {/* Phrase List */}
                      <div className="col-span-1 sm:col-span-2 space-y-2 pt-2">
                        <div className="flex items-center justify-between gap-3">
                          <label className="text-xs font-medium text-white/60 uppercase tracking-wider">
                            Phrase List Global (Azure)
                          </label>
                          <Button
                            size="sm"
                            onClick={() => void onSaveComprehensionSettings()}
                            disabled={!hasDesktopApi}
                          >
                            Aplicar Configurações
                          </Button>
                        </div>
                        <textarea
                          className="min-h-[120px] w-full resize-y rounded-xl border border-white/10 bg-black/30 p-3 text-sm text-white font-mono placeholder:text-white/20 focus:outline-none focus:ring-1 focus:ring-white/20"
                          placeholder={'Wispr\nReact Native\nDeploy'}
                          value={extraPhrasesText}
                          onChange={(e) => setExtraPhrasesText(e.target.value)}
                          disabled={!hasDesktopApi}
                        />
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </div>
            </div>
          </Tabs>
        </div>
      </div>
    </div>
  );
};

export default Index;
