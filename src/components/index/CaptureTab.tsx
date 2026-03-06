import HudIndicator from '@/components/HudIndicator';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Activity, Mic, Settings, Wand2 } from 'lucide-react';
import { memo } from 'react';
import type { Status, UiHealthItem } from './types';
import { healthDotClass } from './utils';

const HEALTH_LABELS: Record<UiHealthItem['id'], string> = {
  stt: 'Transcrição',
  network: 'Rede',
  hook: 'Atalho global',
  history: 'Histórico',
  phrases: 'Vocabulário',
  injection: 'Inserção automática',
  security: 'Segurança',
  microphone: 'Microfone',
};

const STATUS_COPY: Record<Status, { badge: string; helper: string }> = {
  idle: {
    badge: 'Pronto para ditar',
    helper: 'Segure o atalho ou use o inicio manual para começar uma nova captura.',
  },
  listening: {
    badge: 'Capturando sua voz',
    helper: 'Fale naturalmente. O texto parcial aparece em tempo real enquanto você dita.',
  },
  finalizing: {
    badge: 'Revisando texto',
    helper: 'O app está encerrando a captura e preparando a versão final para inserção.',
  },
  error: {
    badge: 'Atenção necessária',
    helper: 'Revise a mensagem de erro e use o diagnóstico para identificar a causa.',
  },
};

type CaptureTabProps = {
  autoPasteEnabled: boolean;
  canControl: boolean;
  canStop: boolean;
  error: string | null;
  finalText: string;
  hasDesktopApi: boolean;
  healthItems: UiHealthItem[];
  healthLoading: boolean;
  hotkeyLabel: string;
  onGoToSettings: () => void;
  onManualStart: () => void;
  onManualStop: () => void;
  onRetryHoldHook: () => void;
  onRunHealthCheck: () => void;
  onToggleAutoPaste: () => void;
  partial: string;
  status: Status;
};

const CaptureTab = memo(function CaptureTab({
  autoPasteEnabled,
  canControl,
  canStop,
  error,
  finalText,
  hasDesktopApi,
  healthItems,
  healthLoading,
  hotkeyLabel,
  onGoToSettings,
  onManualStart,
  onManualStop,
  onRetryHoldHook,
  onRunHealthCheck,
  onToggleAutoPaste,
  partial,
  status,
}: CaptureTabProps) {
  const statusCopy = STATUS_COPY[status];
  const finalPreview = finalText || 'O texto revisado aparecerá aqui assim que a captura terminar.';

  return (
    <div className="space-y-8">
      <div className="relative overflow-hidden rounded-[28px] border border-black/10 bg-[linear-gradient(135deg,#17181f_0%,#111319_48%,#1e2128_100%)] px-8 py-8 shadow-[0_26px_70px_rgba(0,0,0,0.22)] dark:border-white/10">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.14),transparent_32%),radial-gradient(circle_at_80%_20%,rgba(56,189,248,0.16),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(245,158,11,0.14),transparent_24%)]" />
        <div className="pointer-events-none absolute right-4 top-2 opacity-20">
          <HudIndicator state={status} />
        </div>

        <div className="relative z-10 grid gap-8 xl:grid-cols-[minmax(0,1.7fr)_minmax(300px,0.9fr)]">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/8 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/72">
              <span className="h-2 w-2 rounded-full bg-cyan-300 shadow-[0_0_0_4px_rgba(125,211,252,0.14)]" />
              Fluxo principal de ditado
            </div>

            <h2 className="mt-5 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Dite em qualquer aplicativo, <span className="text-white/55">com revisão rápida</span>
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-white/68">
              Segure{' '}
              <kbd className="mx-1 rounded-md border border-white/20 bg-white/10 px-2 py-0.5 font-mono text-sm text-white/90 shadow-sm">
                {hotkeyLabel}
              </kbd>
              , fale com naturalidade e solte. O Vox Type acompanha a captura, revisa o texto e
              tenta inserir no aplicativo em foco sem tirar você do fluxo.
            </p>

            <div className="mt-6 flex flex-wrap gap-3 text-sm text-white/75">
              <div className="rounded-2xl border border-white/10 bg-white/6 px-4 py-3">
                <span className="block text-[11px] uppercase tracking-[0.2em] text-white/42">
                  1. Capturar
                </span>
                <span className="mt-1 block">Fale como você falaria ao vivo.</span>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/6 px-4 py-3">
                <span className="block text-[11px] uppercase tracking-[0.2em] text-white/42">
                  2. Revisar
                </span>
                <span className="mt-1 block">O app organiza e limpa o texto final.</span>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/6 px-4 py-3">
                <span className="block text-[11px] uppercase tracking-[0.2em] text-white/42">
                  3. Inserir
                </span>
                <span className="mt-1 block">Use auto colagem ou controle manual.</span>
              </div>
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Button
                size="lg"
                className="h-12 rounded-xl bg-white px-8 font-medium text-black shadow-[0_0_20px_rgba(255,255,255,0.1)] transition-all hover:scale-105 hover:bg-white/90 hover:shadow-[0_0_25px_rgba(255,255,255,0.2)] disabled:opacity-50 disabled:hover:scale-100"
                onClick={onManualStart}
                disabled={!canControl || status !== 'idle'}
              >
                <Mic className="mr-2 h-5 w-5" />
                Iniciar ditado manual
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="h-12 rounded-xl border-white/10 bg-white/5 px-6 text-white hover:bg-white/10 hover:text-white"
                onClick={onGoToSettings}
              >
                <Settings className="mr-2 h-5 w-5 opacity-70" />
                Ajustar preferências
              </Button>
            </div>
          </div>

          <div className="rounded-[24px] border border-white/10 bg-black/16 p-5 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/46">
                  Status agora
                </div>
                <div className="mt-2 text-lg font-semibold">{statusCopy.badge}</div>
              </div>
              <div className="rounded-full border border-white/12 bg-white/8 px-3 py-1 text-xs font-medium text-white/80">
                {status === 'idle'
                  ? 'Em espera'
                  : status === 'listening'
                    ? 'Ouvindo'
                    : status === 'finalizing'
                      ? 'Revisando'
                      : 'Com erro'}
              </div>
            </div>

            <p className="mt-3 text-sm leading-relaxed text-white/68">{statusCopy.helper}</p>

            <div className="mt-5 grid gap-3">
              <div className="rounded-2xl border border-white/8 bg-white/6 px-4 py-3">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/45">
                  <Activity className="h-3.5 w-3.5" />
                  Atalho rápido
                </div>
                <div className="mt-2 text-sm text-white/82">
                  Segure <span className="font-mono text-white">{hotkeyLabel}</span> para gravar sem
                  sair do app em foco.
                </div>
              </div>
              <div className="rounded-2xl border border-white/8 bg-white/6 px-4 py-3">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/45">
                  <Wand2 className="h-3.5 w-3.5" />
                  Resultado esperado
                </div>
                <div className="mt-2 text-sm text-white/82">
                  Seu texto final chega revisado e pronto para uso no mesmo fluxo.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Card className="overflow-hidden border-border bg-card shadow-sm">
        <CardHeader className="border-b border-border/40 bg-muted/20 pb-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg font-medium text-foreground">
                <div
                  className={`h-2 w-2 rounded-full ${status === 'listening' ? 'bg-rose-500 animate-pulse' : status === 'finalizing' ? 'bg-purple-500 animate-pulse' : 'bg-muted-foreground'}`}
                />
                Acompanhe sua fala
              </CardTitle>
              <CardDescription className="mt-1">
                Veja o que está sendo ouvido e compare com a versão final revisada.
              </CardDescription>
            </div>
            <div className="rounded-2xl border border-border/40 bg-background px-4 py-3 text-sm text-muted-foreground">
              <span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/80">
                Dica
              </span>
              <span className="mt-1 block max-w-[280px]">
                Fale frases completas. O texto final costuma ficar melhor do que o parcial.
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-6 pt-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <div className="space-y-3">
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
              Rascunho ao vivo
            </div>
            <div className="min-h-[160px] rounded-2xl border border-border bg-muted/40 p-5 font-mono text-sm leading-relaxed text-foreground shadow-inner transition-all">
              {partial ? (
                partial
              ) : (
                <span className="opacity-40 italic">Aguardando sua fala...</span>
              )}
            </div>
          </div>
          <div className="space-y-3">
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-500/70">
              Texto final revisado
            </div>
            <div className="min-h-[160px] rounded-2xl border border-emerald-500/20 bg-emerald-50 p-5 text-base leading-relaxed text-foreground shadow-inner dark:bg-emerald-500/5">
              {finalText ? finalText : <span className="opacity-55">{finalPreview}</span>}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-border bg-card shadow-sm">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-foreground">
                Diagnóstico rápido
              </CardTitle>
              <button
                type="button"
                className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
                onClick={onRunHealthCheck}
              >
                Atualizar diagnóstico
              </button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {healthItems.map((item) => (
                <div
                  key={item.id}
                  className="group flex items-start gap-4 rounded-2xl border border-border/40 bg-muted/20 px-4 py-3 hover:bg-muted/60 transition-colors"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted border border-border">
                    <span className={`h-2 w-2 rounded-full ${healthDotClass(item.status)}`} />
                  </div>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground group-hover:text-foreground transition-colors">
                      {HEALTH_LABELS[item.id]}
                    </div>
                    <div className="mt-1 text-sm text-foreground/90 leading-snug">
                      {item.message}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-6 pt-4 border-t border-border/50">
              <Button
                size="sm"
                variant="ghost"
                className="w-full text-xs text-muted-foreground hover:text-foreground h-8 font-normal"
                onClick={onRetryHoldHook}
                disabled={!hasDesktopApi || healthLoading}
              >
                Tentar recuperar atalho global
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-sm font-medium text-foreground">
              Controles imediatos
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-2xl border border-border/40 bg-muted/20 p-5 hover:bg-muted/60 transition-colors">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-foreground">Inserir automaticamente</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Ao finalizar, tenta colar o texto no aplicativo que está em foco.
                  </div>
                </div>
                <Switch
                  checked={autoPasteEnabled}
                  onCheckedChange={onToggleAutoPaste}
                  disabled={!canControl}
                />
              </div>
            </div>
            <div className="rounded-2xl border border-border/40 bg-muted/20 p-5">
              <div className="mb-2 text-sm font-medium text-foreground">Controle manual</div>
              <div className="mb-4 text-xs text-muted-foreground">
                Use esses botões se quiser testar o fluxo sem depender do atalho global.
              </div>
              <div className="flex items-center gap-3">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 rounded-xl bg-background hover:bg-muted"
                  onClick={onManualStart}
                  disabled={!canControl || status !== 'idle'}
                >
                  Iniciar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 rounded-xl bg-background hover:bg-muted"
                  onClick={onManualStop}
                  disabled={!canControl || !canStop}
                >
                  Parar
                </Button>
              </div>
              {error && (
                <div className="mt-4 rounded-xl border border-orange-500/20 bg-orange-500/10 p-3 text-xs text-orange-600 dark:text-orange-400">
                  Erro: {error}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
});

export default CaptureTab;
