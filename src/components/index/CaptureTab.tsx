import HudIndicator from '@/components/HudIndicator';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Mic, Settings } from 'lucide-react';
import { memo } from 'react';
import type { Status, UiHealthItem } from './types';
import { healthDotClass } from './utils';

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
  return (
    <div className="space-y-8">
      {/* FLOW HERO CARD */}
      <div className="relative overflow-hidden rounded-2xl border border-black/10 dark:border-white/10 bg-[#161616] px-8 py-10 shadow-xl flex-shrink-0">
        <div className="absolute top-0 right-0 p-8 opacity-20 pointer-events-none">
          <HudIndicator state={status} />
        </div>

        <div className="relative z-10 max-w-2xl">
          <h2 className="text-3xl font-semibold text-white tracking-tight">
            Dite em qualquer app, <span className="text-white/50">sem atrito</span>
          </h2>
          <p className="mt-3 text-base leading-relaxed text-white/60">
            Aperte e segure{' '}
            <kbd className="mx-1 rounded-md border border-white/20 bg-white/10 px-2 py-0.5 font-mono text-sm text-white/90 shadow-sm">
              {hotkeyLabel}
            </kbd>
            , fale naturalmente e solte. O HUD confirmará o estado e tentará colar o texto
            automaticamente.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Button
              size="lg"
              className="h-12 rounded-xl px-8 font-medium bg-white text-black hover:bg-white/90 shadow-[0_0_20px_rgba(255,255,255,0.1)] transition-all hover:scale-105 hover:shadow-[0_0_25px_rgba(255,255,255,0.2)] disabled:opacity-50 disabled:hover:scale-100"
              onClick={onManualStart}
              disabled={!canControl || status !== 'idle'}
            >
              <Mic className="mr-2 h-5 w-5" />
              Iniciar Captura Manual
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-12 rounded-xl border-white/10 bg-white/5 text-white hover:text-white hover:bg-white/10 px-6"
              onClick={onGoToSettings}
            >
              <Settings className="mr-2 h-5 w-5 opacity-70" />
              Opções
            </Button>
          </div>
        </div>
      </div>

      <Card className="border-border bg-card shadow-sm overflow-hidden">
        <CardHeader className="border-b border-border/40 bg-muted/20 pb-4">
          <CardTitle className="text-lg font-medium text-foreground flex items-center gap-2">
            <div
              className={`h-2 w-2 rounded-full ${status === 'listening' ? 'bg-rose-500 animate-pulse' : status === 'finalizing' ? 'bg-purple-500 animate-pulse' : 'bg-muted-foreground'}`}
            />
            Console de Transcrição
          </CardTitle>
          <CardDescription>Saída de texto em tempo real.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 lg:grid-cols-2 pt-6">
          <div className="space-y-3">
            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em]">
              Transcrevendo...
            </div>
            <div className="min-h-[120px] rounded-2xl border border-border bg-muted/40 p-5 text-sm leading-relaxed text-foreground font-mono transition-all shadow-inner">
              {partial ? partial : <span className="opacity-40 italic">Aguardando fala...</span>}
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-[10px] font-bold text-emerald-600 dark:text-emerald-500/70 uppercase tracking-[0.2em] flex items-center gap-2">
                {finalText && <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
                Texto Final
              </div>
            </div>
            <div className="min-h-[120px] rounded-2xl border border-emerald-500/20 bg-emerald-50 dark:bg-emerald-500/5 p-5 text-base leading-relaxed text-foreground shadow-inner">
              {finalText ? finalText : <span className="opacity-40 italic">—</span>}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-border bg-card shadow-sm">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-foreground">Monitor de Saúde</CardTitle>
              <button
                type="button"
                className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
                onClick={onRunHealthCheck}
              >
                Atualizar
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
                      {item.id}
                    </div>
                    <div className="mt-1 text-sm text-foreground/90 leading-snug">{item.message}</div>
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
                Forçar reload do hook (PTT)
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-sm font-medium text-foreground">
              Recursos Administrativos
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-2xl border border-border/40 bg-muted/20 p-5 hover:bg-muted/60 transition-colors">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-foreground">Auto-paste (Windows)</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Colar texto automaticamente no app em foco.
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
              <div className="text-sm font-medium text-foreground mb-3">Controle Manual (Debug)</div>
              <div className="flex items-center gap-3">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 rounded-xl bg-background hover:bg-muted"
                  onClick={onManualStart}
                  disabled={!canControl || status !== 'idle'}
                >
                  Start
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 rounded-xl bg-background hover:bg-muted"
                  onClick={onManualStop}
                  disabled={!canControl || !canStop}
                >
                  Stop
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
