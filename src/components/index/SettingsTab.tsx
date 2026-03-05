import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import type { LatencyProfile } from '@/lib/latency';
import { memo } from 'react';
import type { AudioDevice, LanguageMode, ToneMode } from './types';

type SettingsTabProps = {
  extraPhrasesText: string;
  formatCommandsEnabled: boolean;
  hasDesktopApi: boolean;
  historyEnabled: boolean;
  historyRetentionDays: number;
  languageMode: LanguageMode;
  latencyProfile: LatencyProfile;
  micDeviceId: string;
  micDevices: AudioDevice[];
  micInputGain: number;
  onChangeLatencyProfile: (value: LatencyProfile) => void;
  onChangeToneMode: (value: ToneMode) => void;
  onSaveComprehensionSettings: () => void;
  onSetExtraPhrasesText: (value: string) => void;
  onSetFormatCommandsEnabled: (value: boolean) => void;
  onSetHistoryEnabled: (value: boolean) => void;
  onSetHistoryRetentionDays: (value: number) => void;
  onSetInputGain: (value: number) => void;
  onSetLanguageMode: (value: LanguageMode) => void;
  onSetMicDeviceId: (value: string) => void;
  toneMode: ToneMode;
};

const SettingsTab = memo(function SettingsTab({
  extraPhrasesText,
  formatCommandsEnabled,
  hasDesktopApi,
  historyEnabled,
  historyRetentionDays,
  languageMode,
  latencyProfile,
  micDeviceId,
  micDevices,
  micInputGain,
  onChangeLatencyProfile,
  onChangeToneMode,
  onSaveComprehensionSettings,
  onSetExtraPhrasesText,
  onSetFormatCommandsEnabled,
  onSetHistoryEnabled,
  onSetHistoryRetentionDays,
  onSetInputGain,
  onSetLanguageMode,
  onSetMicDeviceId,
  toneMode,
}: SettingsTabProps) {
  return (
    <Card className="border-border bg-card shadow-sm overflow-hidden mb-6">
      <CardHeader className="border-b border-border/40 bg-muted/20 pb-5">
        <CardTitle className="text-lg font-medium text-foreground">
          Configurações de Áudio e IA
        </CardTitle>
        <CardDescription>
          Parâmetros avançados de captura, transcrição e estilo.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-8 sm:grid-cols-2 pt-6">
        <div className="space-y-3">
          <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
            Interface de Áudio
          </label>
          <select
            className="h-11 w-full rounded-xl border border-border/50 bg-background px-4 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring transition-all hover:bg-muted cursor-pointer appearance-none"
            value={micDeviceId}
            onChange={(e) => onSetMicDeviceId(e.target.value)}
            disabled={!hasDesktopApi}
          >
            <option value="" className="bg-background text-foreground">
              Sistema (Padrão)
            </option>
            {micDevices.map((d) => (
              <option key={d.deviceId} value={d.deviceId} className="bg-background text-foreground">
                {d.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
              Ganho Analógico
            </label>
            <span className="text-xs font-mono font-medium text-blue-500 bg-blue-500/10 px-2 py-0.5 rounded-md">
              {micInputGain.toFixed(2)}x
            </span>
          </div>
          <div className="h-11 flex items-center bg-background rounded-xl px-4 border border-border/50">
            <input
              type="range"
              min={0.5}
              max={2}
              step={0.05}
              value={micInputGain}
              onChange={(e) => onSetInputGain(Number(e.target.value))}
              disabled={!hasDesktopApi}
              className="w-full accent-blue-500 h-1.5 bg-muted rounded-lg appearance-none cursor-pointer outline-none"
            />
          </div>
        </div>

        <div className="space-y-3">
          <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
            Perfil de Latência
          </label>
          <select
            className="h-11 w-full rounded-xl border border-border/50 bg-background px-4 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring transition-all hover:bg-muted cursor-pointer appearance-none"
            value={latencyProfile}
            onChange={(e) => onChangeLatencyProfile(e.target.value as LatencyProfile)}
            disabled={!hasDesktopApi}
          >
            <option value="fast" className="bg-background text-foreground">
              Fast (Baixa retenção)
            </option>
            <option value="balanced" className="bg-background text-foreground">
              Balanced
            </option>
            <option value="accurate" className="bg-background text-foreground">
              Accurate (Maior buffer)
            </option>
          </select>
        </div>

        <div className="space-y-3">
          <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
            Estilo de Escrita
          </label>
          <select
            className="h-11 w-full rounded-xl border border-border/50 bg-background px-4 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring transition-all hover:bg-muted cursor-pointer appearance-none"
            value={toneMode}
            onChange={(e) => onChangeToneMode(e.target.value as ToneMode)}
            disabled={!hasDesktopApi}
          >
            <option value="formal" className="bg-background text-foreground">
              Formal
            </option>
            <option value="casual" className="bg-background text-foreground">
              Casual (Padrão)
            </option>
            <option value="very-casual" className="bg-background text-foreground">
              Very Casual
            </option>
          </select>
        </div>

        <div className="space-y-3">
          <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
            Idioma Principal
          </label>
          <select
            className="h-11 w-full rounded-xl border border-border/50 bg-background px-4 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring transition-all hover:bg-muted cursor-pointer appearance-none"
            value={languageMode}
            onChange={(e) => onSetLanguageMode(e.target.value as LanguageMode)}
            disabled={!hasDesktopApi}
          >
            <option value="pt-BR" className="bg-background text-foreground">
              Português (Brasil)
            </option>
            <option value="en-US" className="bg-background text-foreground">
              Inglês (US)
            </option>
            <option value="dual" className="bg-background text-foreground">
              Auto-detect (Dual Pass)
            </option>
          </select>
        </div>

        <div className="space-y-3">
          <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
            Engine STT
          </label>
          <div className="h-11 flex items-center w-full rounded-xl border border-border/40 bg-muted/20 px-4 text-sm text-muted-foreground">
            Azure Cognitive Services
          </div>
        </div>

        <div className="sm:col-span-2 grid gap-4 sm:grid-cols-2 pt-2">
          <div className="flex items-center justify-between rounded-2xl border border-border/40 bg-muted/20 px-5 py-4 hover:bg-muted/60 transition-colors">
            <div>
              <span className="block text-sm font-medium text-foreground">Comandos Estruturais</span>
              <span className="block text-xs text-muted-foreground mt-0.5">
                Nova linha, ponto final, etc.
              </span>
            </div>
            <Switch
              checked={formatCommandsEnabled}
              onCheckedChange={onSetFormatCommandsEnabled}
              disabled={!hasDesktopApi}
            />
          </div>

          <div className="flex items-center justify-between rounded-2xl border border-border/40 bg-muted/20 px-5 py-4 hover:bg-muted/60 transition-colors">
            <div>
              <span className="block text-sm font-medium text-foreground">Histórico de Sessão</span>
              <div className="flex items-center gap-2 mt-1">
                <span className="block text-xs text-muted-foreground">Reter por</span>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={historyRetentionDays}
                  onChange={(e) => onSetHistoryRetentionDays(Number(e.target.value))}
                  disabled={!hasDesktopApi || !historyEnabled}
                  className="w-12 h-6 rounded bg-background border border-border text-center text-xs text-foreground focus:outline-none focus:border-ring disabled:opacity-50"
                />
                <span className="block text-xs text-muted-foreground">dias</span>
              </div>
            </div>
            <Switch
              checked={historyEnabled}
              onCheckedChange={onSetHistoryEnabled}
              disabled={!hasDesktopApi}
            />
          </div>
        </div>

        <div className="sm:col-span-2 space-y-3 pt-4 border-t border-border/50 mt-2">
          <div className="flex items-end justify-between gap-3">
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
                Phrase List (Azure Config)
              </label>
              <div className="text-xs text-muted-foreground">
                Define o contexto semântico passado na inicialização da Stream Azure.
              </div>
            </div>
            <Button className="h-10 px-6 rounded-xl" onClick={onSaveComprehensionSettings} disabled={!hasDesktopApi}>
              Salvar Modificações
            </Button>
          </div>
          <textarea
            className="min-h-[120px] w-full resize-y rounded-xl border border-border/50 bg-background p-4 text-sm text-foreground font-mono leading-relaxed placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring custom-scrollbar"
            placeholder={'Exemplo:\nWispr\nReact Native\nDeploy Azure'}
            value={extraPhrasesText}
            onChange={(e) => onSetExtraPhrasesText(e.target.value)}
            disabled={!hasDesktopApi}
            spellCheck={false}
          />
        </div>
      </CardContent>
    </Card>
  );
});

export default SettingsTab;
