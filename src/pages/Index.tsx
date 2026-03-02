import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { primeMicrophone, setInputGain, startCapture, stopCapture, warmupCapturePipeline } from "@/audio/capture";
import HudIndicator from "@/components/HudIndicator";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { STOP_GRACE_BY_PROFILE, latencyProfileFromStopGrace, type LatencyProfile } from "@/lib/latency";
import type { CanonicalTerm, DictionaryTerm, RuntimeInfo } from "@/electron";
import { BookOpen, Mic, Settings } from "lucide-react";

type Status = "idle" | "listening" | "finalizing" | "error";

type AudioDevice = { deviceId: string; label: string };
type ToneMode = "formal" | "casual" | "very-casual";
type LanguageMode = "pt-BR" | "en-US" | "dual";

const MIC_STORAGE_KEY = "voice-note-ai:micDeviceId";
const MIC_GAIN_STORAGE_KEY = "voice-note-ai:micInputGain";

function statusDotClass(status: Status) {
  if (status === "error") return "bg-rose-300/90 shadow-[0_0_0_3px_rgba(244,63,94,0.18)]";
  if (status === "listening") return "bg-cyan-300/90 shadow-[0_0_0_3px_rgba(34,211,238,0.18)]";
  if (status === "finalizing") return "bg-white/70 shadow-[0_0_0_3px_rgba(255,255,255,0.10)]";
  return "bg-white/40";
}

const DEFAULT_RUNTIME_INFO: RuntimeInfo = {
  hotkeyLabel: "Ctrl+Win",
  hotkeyMode: "unavailable",
  holdToTalkActive: false,
  holdRequired: true,
  captureBlockedReason: "PTT indisponível: hook global não carregou.",
};

const HOTKEY_MODE_LABEL: Record<RuntimeInfo["hotkeyMode"], string> = {
  hold: "Hold-to-talk",
  "toggle-primary": "Toggle (primary)",
  "toggle-fallback": "Toggle (fallback)",
  unavailable: "Indisponível",
};

function normalizeCanonicalValue(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

const Index = () => {
  const { toast } = useToast();
  const hasDesktopApi = typeof window !== "undefined" && Boolean(window.voiceNoteAI);
  const [status, setStatus] = useState<Status>("idle");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [partial, setPartial] = useState("");
  const [finalText, setFinalText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [autoPasteEnabled, setAutoPasteEnabled] = useState(false);
  const [toneMode, setToneMode] = useState<ToneMode>("casual");
  const [languageMode, setLanguageMode] = useState<LanguageMode>("pt-BR");
  const [latencyProfile, setLatencyProfile] = useState<LatencyProfile>("balanced");
  const [runtimeInfo, setRuntimeInfo] = useState<RuntimeInfo>(DEFAULT_RUNTIME_INFO);
  const [formatCommandsEnabled, setFormatCommandsEnabled] = useState(true);
  const [activeTab, setActiveTab] = useState<"capture" | "dictionary" | "settings">("capture");
  const [extraPhrasesText, setExtraPhrasesText] = useState("");
  const [micDevices, setMicDevices] = useState<AudioDevice[]>([]);
  const [micDeviceId, setMicDeviceId] = useState<string>(() => {
    try {
      return localStorage.getItem(MIC_STORAGE_KEY) ?? "";
    } catch {
      return "";
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
  const [newTerm, setNewTerm] = useState("");
  const [newHintPt, setNewHintPt] = useState("");
  const [canonicalTerms, setCanonicalTerms] = useState<CanonicalTerm[]>([]);
  const [newCanonicalFrom, setNewCanonicalFrom] = useState("");
  const [newCanonicalTo, setNewCanonicalTo] = useState("");
  const partialFrameRef = useRef<number | null>(null);
  const partialPendingRef = useRef<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  const canControl = useMemo(() => hasDesktopApi && !runtimeInfo.captureBlockedReason, [hasDesktopApi, runtimeInfo.captureBlockedReason]);
  const hotkeyLabel = runtimeInfo.hotkeyLabel || DEFAULT_RUNTIME_INFO.hotkeyLabel;
  const effectiveHotkeyLabel = runtimeInfo.holdRequired ? "Ctrl+Win" : hotkeyLabel;

  const setStatusSafely = useCallback((next: Status) => {
    setStatus((prev) => (prev === next ? prev : next));
  }, []);

  const refreshDevices = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) return;
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioInputs = devices
      .filter((d) => d.kind === "audioinput")
      .map((d) => ({
        deviceId: d.deviceId,
        label: d.label || `Microfone (${d.deviceId.slice(0, 6)}…)`,
      }));
    setMicDevices(audioInputs);
  }, []);

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
          title: "Dicionário indisponível nesta execução",
          description: "Reinicie o app com npm run dev:desktop (ou gere novo build:desktop).",
        });
        return;
      }
      toast({
        title: "Falha ao carregar dicionário",
        description: message,
        variant: "destructive",
      });
    } finally {
      setDictionaryBusy(false);
    }
  }, [dictionaryAvailable, hasDesktopApi, toast]);

  const loadSettings = useCallback(async () => {
    if (!hasDesktopApi) return;
    try {
      const settings = await window.voiceNoteAI.getSettings();
      setAutoPasteEnabled(Boolean(settings.autoPasteEnabled));
      setToneMode(
        settings.toneMode === "formal"
          ? "formal"
          : settings.toneMode === "very-casual"
            ? "very-casual"
            : "casual",
      );
      setLanguageMode(settings.languageMode === "dual" ? "dual" : settings.languageMode === "en-US" ? "en-US" : "pt-BR");
      setLatencyProfile(latencyProfileFromStopGrace(settings.stopGraceMs));
      setExtraPhrasesText((settings.extraPhrases ?? []).join("\n"));
      setCanonicalTerms(settings.canonicalTerms ?? []);
      setFormatCommandsEnabled(settings.formatCommandsEnabled !== false);
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
        const message = info.captureBlockedReason;
        setError(message);
        setStatusSafely("error");
      }
    } catch {
      // ignore
    }
  }, [hasDesktopApi, setStatusSafely]);

  const begin = useCallback(async (newSessionId: string, options?: { sttWarmStart?: boolean }) => {
    setError(null);
    setFinalText("");
    setPartial("");
    partialPendingRef.current = null;
    setSessionId(newSessionId);
    setStatusSafely("listening");

    void options;
    const sttStart = window.voiceNoteAI.startStt({ sessionId: newSessionId });
    const captureStart = startCapture(newSessionId, micDeviceId || null, micInputGain);
    const [sttResult, captureResult] = await Promise.allSettled([sttStart, captureStart]);

    if (sttResult.status === "rejected" || captureResult.status === "rejected") {
      if (sttResult.status === "fulfilled") {
        try {
          await window.voiceNoteAI.stopStt(newSessionId);
        } catch {
          // ignore rollback failure
        }
      }
      try {
        await stopCapture();
      } catch {
        // ignore rollback failure
      }
      throw sttResult.status === "rejected" ? sttResult.reason : captureResult.reason;
    }
  }, [micDeviceId, micInputGain, setStatusSafely]);

  const end = useCallback(async (currentSessionId: string) => {
    setStatusSafely("finalizing");
    await stopCapture();
    await window.voiceNoteAI.stopStt(currentSessionId);
    setStatusSafely("idle");
    setSessionId(null);
  }, [setStatusSafely]);

  useEffect(() => {
    return () => {
      if (partialFrameRef.current !== null) {
        cancelAnimationFrame(partialFrameRef.current);
      }
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
    void refreshDevices();
    void loadSettings();
    void loadRuntimeInfo();
    void loadDictionary();

    const offStart = window.voiceNoteAI.onCaptureStart(async ({ sessionId, sttWarmStart }) => {
      try {
        await begin(sessionId, { sttWarmStart });
      } catch (e) {
        setStatusSafely("error");
        setError(e instanceof Error ? e.message : String(e));
      }
    });

    const offStop = window.voiceNoteAI.onCaptureStop(async ({ sessionId }) => {
      if (sessionIdRef.current !== sessionId) return;
      try {
        await end(sessionId);
      } catch (e) {
        setStatusSafely("error");
        setError(e instanceof Error ? e.message : String(e));
      }
    });

    const offPartial = window.voiceNoteAI.onSttPartial((e) => {
      if (e.sessionId !== sessionId) return;
      pushPartial(e.text);
    });

    const offFinal = window.voiceNoteAI.onSttFinal((e) => {
      if (e.sessionId !== sessionId) return;
      setFinalText(e.text);
      partialPendingRef.current = null;
      setPartial("");
    });

    const offErr = window.voiceNoteAI.onSttError((e) => {
      if (e.sessionId !== sessionId) return;
        setStatusSafely("error");
        setError(e.message);
      });

    const offAppError = window.voiceNoteAI.onAppError((e) => {
      setStatusSafely("error");
      setError(e.message);
      toast({
        title: "Aviso do app",
        description: e.message,
        variant: "destructive",
      });
    });

    return () => {
      offStart();
      offStop();
      offPartial();
      offFinal();
      offErr();
      offAppError();

      const pendingSession = sessionIdRef.current;
      if (pendingSession) {
        void stopCapture().catch(() => {});
        void window.voiceNoteAI.stopStt(pendingSession).catch(() => {});
      }
    };
  }, [
    begin,
    end,
    hasDesktopApi,
    loadDictionary,
    loadRuntimeInfo,
    loadSettings,
    pushPartial,
    refreshDevices,
    sessionId,
    setStatusSafely,
    toast,
  ]);

  useEffect(() => {
    if (!hasDesktopApi) return;
    void primeMicrophone(micDeviceId || null);
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

  async function onToggleAutoPaste() {
    const next = !autoPasteEnabled;
    setAutoPasteEnabled(next);
    if (!hasDesktopApi) return;
    await window.voiceNoteAI.setAutoPasteEnabled(next);
  }

  async function onChangeToneMode(next: ToneMode) {
    setToneMode(next);
    if (!hasDesktopApi) return;
    await window.voiceNoteAI.setToneMode(next);
  }

  async function onChangeLatencyProfile(next: LatencyProfile) {
    setLatencyProfile(next);
    if (!hasDesktopApi) return;
    await window.voiceNoteAI.updateSettings({
      stopGraceMs: STOP_GRACE_BY_PROFILE[next],
    });
  }

  function normalizeExtraPhrases(raw: string) {
    return raw
      .split(/\r?\n|,/g)
      .map((s) => s.replace(/\s+/g, " ").trim())
      .filter(Boolean);
  }

  async function onSaveComprehensionSettings() {
    if (!hasDesktopApi) return;
    const extraPhrases = normalizeExtraPhrases(extraPhrasesText);
    await window.voiceNoteAI.updateSettings({
      languageMode,
      extraPhrases,
      formatCommandsEnabled,
    });
    toast({ title: "Configurações salvas", description: "Idioma e Phrase List atualizados." });
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
    if (!from || !to) {
      toast({ title: "Informe origem e destino", variant: "destructive" });
      return;
    }

    const dedupeKey = `${from.toLocaleLowerCase()}=>${to.toLocaleLowerCase()}`;
    const exists = canonicalTerms.some(
      (item) => `${item.from.toLocaleLowerCase()}=>${item.to.toLocaleLowerCase()}` === dedupeKey,
    );
    if (exists) {
      toast({ title: "Regra já existe", variant: "destructive" });
      return;
    }

    const next = [...canonicalTerms, { from, to, enabled: true }];
    try {
      setDictionaryBusy(true);
      await persistCanonicalTerms(next);
      setNewCanonicalFrom("");
      setNewCanonicalTo("");
      toast({ title: "Regra adicionada", description: `${from} -> ${to}` });
    } catch (error) {
      toast({
        title: "Falha ao salvar regra",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setDictionaryBusy(false);
    }
  }

  async function onToggleCanonicalTerm(index: number, enabled: boolean) {
    if (!hasDesktopApi || dictionaryBusy) return;
    const next = canonicalTerms.map((item, currentIndex) => (currentIndex === index ? { ...item, enabled } : item));
    try {
      setDictionaryBusy(true);
      await persistCanonicalTerms(next);
    } catch (error) {
      toast({
        title: "Falha ao atualizar regra",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setDictionaryBusy(false);
    }
  }

  async function onRemoveCanonicalTerm(index: number) {
    if (!hasDesktopApi || dictionaryBusy) return;
    const next = canonicalTerms.filter((_, currentIndex) => currentIndex !== index);
    try {
      setDictionaryBusy(true);
      await persistCanonicalTerms(next);
    } catch (error) {
      toast({
        title: "Falha ao remover regra",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setDictionaryBusy(false);
    }
  }

  async function onManualStart() {
    if (!canControl) return;
    if (status !== "idle") return;
    const id = crypto.randomUUID();
    await begin(id);
  }

  async function onManualStop() {
    if (!canControl) return;
    if (!sessionId) return;
    await end(sessionId);
  }

  async function onAddDictionaryTerm() {
    if (!hasDesktopApi || dictionaryBusy || !dictionaryAvailable) return;
    const term = newTerm.trim();
    if (!term) {
      toast({ title: "Informe um termo em inglês", variant: "destructive" });
      return;
    }

    try {
      setDictionaryBusy(true);
      await window.voiceNoteAI.addDictionaryTerm({
        term,
        hintPt: newHintPt.trim() || undefined,
      });
      setNewTerm("");
      setNewHintPt("");
      await loadDictionary();
      toast({ title: "Termo adicionado", description: `${term} foi salvo no dicionário.` });
    } catch (e) {
      toast({
        title: "Falha ao adicionar termo",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setDictionaryBusy(false);
    }
  }

  async function onToggleTermEnabled(item: DictionaryTerm, enabled: boolean) {
    if (!hasDesktopApi || dictionaryBusy || !dictionaryAvailable) return;
    try {
      setDictionaryBusy(true);
      const result = await window.voiceNoteAI.updateDictionaryTerm({
        id: item.id,
        enabled,
      });
      setDictionary((current) =>
        current.map((entry) => (entry.id === result.term.id ? result.term : entry)),
      );
    } catch (e) {
      toast({
        title: "Falha ao atualizar termo",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setDictionaryBusy(false);
    }
  }

  async function onRemoveDictionaryTerm(id: string) {
    if (!hasDesktopApi || dictionaryBusy || !dictionaryAvailable) return;
    try {
      setDictionaryBusy(true);
      await window.voiceNoteAI.removeDictionaryTerm(id);
      setDictionary((current) => current.filter((item) => item.id !== id));
    } catch (e) {
      toast({
        title: "Falha ao remover termo",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setDictionaryBusy(false);
    }
  }

  return (
    <div className="min-h-screen overflow-y-auto bg-background text-foreground">
      <div className="mx-auto w-full max-w-[1240px] px-[clamp(0.8rem,1.8vw,1.4rem)] py-[clamp(0.8rem,1.8vw,1.2rem)]">
          <div className="workspace-shell relative w-full overflow-hidden rounded-[28px]">
            <Tabs
              value={activeTab}
              onValueChange={(v) => setActiveTab(v === "dictionary" ? "dictionary" : v === "settings" ? "settings" : "capture")}
              className="flex w-full"
            >
              <aside className="flex w-[78px] flex-col items-center gap-3 border-r border-border/70 bg-background/40 py-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-border/70 bg-card shadow-[0_14px_38px_rgba(0,0,0,0.35)]">
                  <div className="h-5 w-5 rounded-md bg-primary/90" />
                </div>
                <TabsList className="h-auto w-full flex-col items-center justify-start gap-1 bg-transparent p-2 text-muted-foreground">
                  <TabsTrigger
                    value="capture"
                    title="Captura"
                    aria-label="Captura"
                    className="h-11 w-11 rounded-2xl bg-transparent p-0 data-[state=active]:bg-muted data-[state=active]:text-foreground data-[state=active]:shadow-none"
                  >
                    <Mic className="h-5 w-5" />
                    <span className="sr-only">Captura</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="dictionary"
                    title="Dicionário"
                    aria-label="Dicionário"
                    className="h-11 w-11 rounded-2xl bg-transparent p-0 data-[state=active]:bg-muted data-[state=active]:text-foreground data-[state=active]:shadow-none"
                  >
                    <BookOpen className="h-5 w-5" />
                    <span className="sr-only">Dicionário</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="settings"
                    title="Configurações"
                    aria-label="Configurações"
                    className="h-11 w-11 rounded-2xl bg-transparent p-0 data-[state=active]:bg-muted data-[state=active]:text-foreground data-[state=active]:shadow-none"
                  >
                    <Settings className="h-5 w-5" />
                    <span className="sr-only">Configurações</span>
                  </TabsTrigger>
                </TabsList>
              </aside>

              <div className="flex min-w-0 flex-1 flex-col bg-transparent">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 bg-background/40 px-6 py-5">
                  <div className="min-w-0">
                    <div className="text-xs font-medium tracking-[0.16em] text-muted-foreground">
                      VOICE NOTE AI
                    </div>
                    <div className="mt-1 text-[clamp(1.25rem,2.4vw,1.7rem)] font-semibold text-foreground">
                      Welcome back, Allysson
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 rounded-full border border-border/70 bg-muted/20 px-3 py-1.5">
                      <span className={`h-2 w-2 rounded-full ${statusDotClass(status)}`} aria-hidden />
                      <span className="text-xs text-muted-foreground">
                        {status === "listening"
                          ? "Listening"
                          : status === "finalizing"
                            ? "Finalizing"
                            : status === "error"
                              ? "Error"
                              : "Ready"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
                  {!hasDesktopApi ? (
                    <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm">
                      Rode em modo desktop (Electron). No browser, a API{" "}
                      <span className="font-mono">window.voiceNoteAI</span> não existe.
                    </div>
                  ) : null}
                  {hasDesktopApi && runtimeInfo.captureBlockedReason ? (
                    <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                      {runtimeInfo.captureBlockedReason}
                    </div>
                  ) : null}

                  <TabsContent value="capture" className="mt-3 space-y-3 pb-1 pr-1">
                    <div className="mb-5 rounded-3xl border border-border/70 bg-card/65 px-6 py-6 shadow-[0_20px_60px_rgba(0,0,0,0.45)]">
                      <div className="text-[clamp(1.6rem,3.4vw,2.15rem)] font-semibold text-foreground">
                        Dite em qualquer app, sem atrito
                      </div>
                      <div className="mt-2 max-w-3xl text-sm text-foreground/70">
                        Aperte <span className="font-mono">{effectiveHotkeyLabel}</span>, fale naturalmente e solte para finalizar.
                        O HUD confirma o estado e a sessão cola no app alvo capturado no início.
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button
                          className="rounded-2xl bg-primary px-5 text-primary-foreground hover:bg-primary/90"
                          onClick={() => void onManualStart()}
                          disabled={!canControl || status !== "idle"}
                        >
                          Testar agora
                        </Button>
                        <Button
                          variant="outline"
                          className="rounded-2xl border-border/70 bg-muted/20 px-5"
                          onClick={() => setActiveTab("settings")}
                        >
                          Configurações
                        </Button>
                      </div>
                    </div>

                    <div className="grid gap-3 lg:grid-cols-2">
                      <Card className="soft-panel">
                        <CardHeader className="pb-3">
                          <CardTitle className="text-base">Controle</CardTitle>
                        <CardDescription>Iniciar/parar sessão manualmente (debug).</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div className="flex gap-2">
                            <Button onClick={onManualStart} disabled={!canControl || status !== "idle"}>
                              Start
                            </Button>
                            <Button
                              variant="outline"
                              onClick={onManualStop}
                              disabled={!canControl || !sessionId || status === "idle"}
                            >
                              Stop
                            </Button>
                          </div>
                          <div className="flex items-center justify-between rounded-md border border-border/70 bg-muted/20 px-3 py-2">
                            <span className="text-sm">Auto-paste (Windows)</span>
                            <Switch checked={autoPasteEnabled} onCheckedChange={() => void onToggleAutoPaste()} disabled={!canControl} />
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Se ativo, tenta enviar <span className="font-mono">Ctrl+V</span> após transcrição final e restaura clipboard com segurança.
                          </p>
                        </CardContent>
                      </Card>

                      <Card className="soft-panel">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base">HUD</CardTitle>
                        <CardDescription>Indicador always-on-top discreto com animação de áudio.</CardDescription>
                      </CardHeader>
                        <CardContent className="space-y-3">
                          <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
                            <div className="mb-2 text-sm font-medium">Prévia</div>
                            <div className="mx-auto aspect-[10/3] w-[min(100%,260px)]">
                              <HudIndicator state={status} />
                            </div>
                          </div>
                          {error ? <div className="text-sm text-destructive">Erro: {error}</div> : null}
                        </CardContent>
                      </Card>
                    </div>

                    <Card className="soft-panel">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base">Transcrição</CardTitle>
                        <CardDescription>Prévia parcial e resultado final da sessão.</CardDescription>
                      </CardHeader>
                      <CardContent className="grid gap-3 lg:grid-cols-2">
                        <div className="space-y-2">
                          <div className="text-sm font-medium">Partial</div>
                          <div className="min-h-14 rounded-md border border-border/70 bg-muted/20 p-2 text-sm transition-colors duration-150">
                            {partial || "—"}
                          </div>
                        </div>
                        <div className="space-y-2">
                          <div className="text-sm font-medium">Final</div>
                          <div className="min-h-14 rounded-md border border-border/70 bg-muted/20 p-2 text-sm whitespace-pre-wrap">
                            {finalText || "—"}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="dictionary" className="mt-3 space-y-3 pb-1 pr-1">
                    <Card className="soft-panel">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base">Dicionário de reconhecimento</CardTitle>
                        <CardDescription>
                          Este dicionário melhora reconhecimento; não traduz a saída automaticamente.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {!dictionaryAvailable ? (
                          <div className="rounded-md border border-border/70 bg-muted/20 p-3 text-sm text-muted-foreground">
                            Dicionário não disponível nesta execução do app. Reinicie o desktop app para carregar os
                            handlers mais recentes.
                          </div>
                        ) : null}
                        <div className="grid gap-2 sm:grid-cols-2">
                          <Input
                            placeholder="Termo em inglês (ex: standup)"
                            value={newTerm}
                            onChange={(e) => setNewTerm(e.target.value)}
                            disabled={!hasDesktopApi || dictionaryBusy || !dictionaryAvailable}
                          />
                          <Input
                            placeholder="Hint em português (opcional)"
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
                            Adicionar termo
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => void loadDictionary()}
                            disabled={!hasDesktopApi || dictionaryBusy || !dictionaryAvailable}
                          >
                            Atualizar lista
                          </Button>
                        </div>

                        <div className="max-h-[clamp(260px,38vh,440px)] space-y-2 overflow-y-auto pr-1">
                          {dictionary.length === 0 ? (
                            <div className="rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground">
                              Nenhum termo cadastrado.
                            </div>
                          ) : (
                            dictionary.map((item) => (
                              <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border/70 bg-muted/20 p-3">
                                <div>
                                  <div className="text-sm font-medium">{item.term}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {item.hintPt ? `Hint PT: ${item.hintPt}` : "Sem hint PT"}
                                  </div>
                                </div>
                                <div className="flex items-center gap-3">
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <span>Ativo</span>
                                    <Switch
                                      checked={item.enabled}
                                      disabled={dictionaryBusy || !hasDesktopApi || !dictionaryAvailable}
                                      onCheckedChange={(enabled) => void onToggleTermEnabled(item, enabled)}
                                    />
                                  </div>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={dictionaryBusy || !hasDesktopApi || !dictionaryAvailable}
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

                    <Card className="soft-panel">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base">Correções inteligentes</CardTitle>
                        <CardDescription>
                          Ajusta termos de marca e palavras recorrentes após a transcrição.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                          <Input
                            placeholder="Origem (ex: anti gravity|antigravity)"
                            value={newCanonicalFrom}
                            onChange={(e) => setNewCanonicalFrom(e.target.value)}
                            disabled={!hasDesktopApi || dictionaryBusy}
                          />
                          <Input
                            placeholder="Destino (ex: Antigravity)"
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
                        <p className="text-xs text-muted-foreground">
                          Use <span className="font-mono">|</span> para alternativas de origem.
                        </p>

                        <div className="max-h-[clamp(180px,30vh,300px)] space-y-2 overflow-y-auto pr-1">
                          {canonicalTerms.length === 0 ? (
                            <div className="rounded-md border border-border/70 bg-muted/20 p-3 text-sm text-muted-foreground">
                              Nenhuma regra de correção configurada.
                            </div>
                          ) : (
                            canonicalTerms.map((item, index) => (
                              <div
                                key={`${item.from}-${item.to}-${index}`}
                                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border/70 bg-muted/20 p-3"
                              >
                                <div>
                                  <div className="text-sm font-medium">{item.from}</div>
                                  <div className="text-xs text-muted-foreground">{item.to}</div>
                                </div>
                                <div className="flex items-center gap-3">
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <span>Ativo</span>
                                    <Switch
                                      checked={item.enabled}
                                      disabled={!hasDesktopApi || dictionaryBusy}
                                      onCheckedChange={(enabled) => void onToggleCanonicalTerm(index, enabled)}
                                    />
                                  </div>
                                  <Button
                                    variant="ghost"
                                    size="sm"
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

                  <TabsContent value="settings" className="mt-3 space-y-3 pb-1 pr-1">
                    <Card className="soft-panel">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base">Privacidade</CardTitle>
                        <CardDescription>Transcricao por Azure Speech-to-Text (nuvem).</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-2 text-sm text-muted-foreground">
                        <p>
                          Ao ditar, o audio e enviado ao provedor de STT configurado (Azure) para gerar a transcricao.
                        </p>
                        <p>
                          Evite ditar dados sensiveis (senhas, dados bancarios, documentos). Para uso como produto, o ideal
                          e mover a autenticacao/credenciais para um backend e nao embutir chaves no app.
                        </p>
                      </CardContent>
                    </Card>

                    <Card className="soft-panel">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base">Captura e dispositivo</CardTitle>
                        <CardDescription>Selecione o microfone e revise as preferências de captura.</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="space-y-1">
                          <label className="text-sm font-medium" htmlFor="mic">
                            Microfone
                          </label>
                          <select
                            id="mic"
                            className="mt-1 w-full rounded-md border bg-background px-2 py-2 text-sm disabled:opacity-50"
                            value={micDeviceId}
                            onChange={(e) => setMicDeviceId(e.target.value)}
                            disabled={!hasDesktopApi}
                          >
                            <option value="">Padrão do sistema</option>
                            {micDevices.map((d) => (
                              <option key={d.deviceId} value={d.deviceId}>
                                {d.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button variant="outline" onClick={() => void refreshDevices()} disabled={!hasDesktopApi}>
                            Refresh devices
                          </Button>
                          <p className="text-xs text-muted-foreground">
                            Se os nomes estiverem vazios, clique Start uma vez e depois faça refresh.
                          </p>
                        </div>
                        <div className="space-y-1">
                          <label className="text-sm font-medium" htmlFor="mic-gain">
                            Ganho do microfone
                          </label>
                          <input
                            id="mic-gain"
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
                            className="w-full"
                          />
                          <div className="text-xs text-muted-foreground">Atual: {micInputGain.toFixed(2)}x</div>
                        </div>
                        <div className="rounded-md border border-border/70 bg-muted/20 p-3 text-sm">
                          Hotkey atual: <span className="font-mono">{effectiveHotkeyLabel}</span>{" "}
                          <span className="text-muted-foreground">({HOTKEY_MODE_LABEL[runtimeInfo.hotkeyMode]})</span>
                        </div>
                        <div className="flex items-center justify-between rounded-md border border-border/70 bg-muted/20 px-3 py-2">
                          <span className="text-sm">Comandos de formatação (bullet/item/new line)</span>
                          <Switch
                            checked={formatCommandsEnabled}
                            onCheckedChange={setFormatCommandsEnabled}
                            disabled={!hasDesktopApi}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-sm font-medium" htmlFor="latency-profile">
                            Perfil de latência
                          </label>
                          <select
                            id="latency-profile"
                            className="mt-1 w-full rounded-md border border-border/70 bg-muted/20 px-2 py-2 text-sm disabled:opacity-50"
                            value={latencyProfile}
                            onChange={(e) =>
                              void onChangeLatencyProfile(
                                e.target.value === "accurate" ? "accurate" : e.target.value === "fast" ? "fast" : "balanced",
                              )
                            }
                            disabled={!hasDesktopApi}
                          >
                            <option value="fast">Fast (recomendado)</option>
                            <option value="balanced">Balanced</option>
                            <option value="accurate">Accurate</option>
                          </select>
                          <p className="text-xs text-muted-foreground">
                            Fast finaliza mais rápido; Accurate segura um pouco mais para reduzir cortes no final da frase.
                          </p>
                        </div>
                        <div className="space-y-1">
                          <label className="text-sm font-medium" htmlFor="tone-mode">
                            Estilo do texto
                          </label>
                          <select
                            id="tone-mode"
                            className="mt-1 w-full rounded-md border border-border/70 bg-muted/20 px-2 py-2 text-sm disabled:opacity-50"
                            value={toneMode}
                            onChange={(e) =>
                              void onChangeToneMode(
                                e.target.value === "formal"
                                  ? "formal"
                                  : e.target.value === "very-casual"
                                    ? "very-casual"
                                    : "casual",
                              )
                            }
                            disabled={!hasDesktopApi}
                          >
                            <option value="formal">Formal (normalizado)</option>
                            <option value="casual">Casual (equilibrado)</option>
                            <option value="very-casual">Very casual (super natural)</option>
                          </select>
                          <p className="text-xs text-muted-foreground">
                            Formal prioriza gramática; Casual equilibra clareza; Very casual mantém estilo coloquial.
                          </p>
                        </div>
                        <div className="space-y-1">
                          <label className="text-sm font-medium" htmlFor="language-mode">
                            Idioma (Azure STT)
                          </label>
                          <select
                            id="language-mode"
                            className="mt-1 w-full rounded-md border border-border/70 bg-muted/20 px-2 py-2 text-sm disabled:opacity-50"
                            value={languageMode}
                            onChange={(e) => {
                              const v = e.target.value;
                              setLanguageMode(v === "dual" ? "dual" : v === "en-US" ? "en-US" : "pt-BR");
                            }}
                            disabled={!hasDesktopApi}
                          >
                            <option value="pt-BR">Português (pt-BR)</option>
                            <option value="en-US">Inglês (en-US)</option>
                            <option value="dual">Auto (PT + EN)</option>
                          </select>
                          <p className="text-xs text-muted-foreground">
                            Auto roda duas passadas (pt-BR e en-US) e escolhe a melhor.
                          </p>
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-3">
                            <label className="text-sm font-medium" htmlFor="extra-phrases">
                              Phrase list extra
                            </label>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => void onSaveComprehensionSettings()}
                              disabled={!hasDesktopApi}
                            >
                              Salvar
                            </Button>
                          </div>
                          <textarea
                            id="extra-phrases"
                            className="min-h-28 w-full resize-none rounded-md border border-border/70 bg-muted/20 p-2 text-sm disabled:opacity-50"
                            placeholder={"Termos, nomes, apps, siglas...\nEx:\nWispr\nVoxType\nNotepad\nSlack\nVS Code"}
                            value={extraPhrasesText}
                            onChange={(e) => setExtraPhrasesText(e.target.value)}
                            disabled={!hasDesktopApi}
                          />
                          <p className="text-xs text-muted-foreground">
                            Dica: um termo por linha (ou separado por vírgula).
                          </p>
                        </div>
                        <div className="rounded-md border border-border/70 bg-muted/20 p-3 text-sm">
                          <div className="font-medium text-foreground">Próximas features (base pronta)</div>
                          <div className="mt-1 text-muted-foreground">
                            Snippets por gatilho de voz e Notes rápidas locais entrarão na próxima rodada.
                          </div>
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
