import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import type { HistoryStorageMode } from '@/electron';
import type { LatencyProfile } from '@/lib/latency';
import { memo } from 'react';
import type { AudioDevice, LanguageMode, ToneMode } from './types';

type SettingsTabProps = {
  extraPhrasesText: string;
  formatCommandsEnabled: boolean;
  hasDesktopApi: boolean;
  historyEnabled: boolean;
  historyRetentionDays: number;
  historyStorageMode: HistoryStorageMode;
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
  onSetHistoryStorageMode: (value: HistoryStorageMode) => void;
  onSetInputGain: (value: number) => void;
  onSetLanguageMode: (value: LanguageMode) => void;
  onSetMicDeviceId: (value: string) => void;
  onSetPrivacyMode: (value: boolean) => void;
  privacyMode: boolean;
  settingsSaving: boolean;
  toneMode: ToneMode;
};

const SettingsTab = memo(function SettingsTab({
  extraPhrasesText,
  formatCommandsEnabled,
  hasDesktopApi,
  historyEnabled,
  historyRetentionDays,
  historyStorageMode,
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
  onSetHistoryStorageMode,
  onSetInputGain,
  onSetLanguageMode,
  onSetMicDeviceId,
  onSetPrivacyMode,
  privacyMode,
  settingsSaving,
  toneMode,
}: SettingsTabProps) {
  return (
    <Card className="mb-6 overflow-hidden border-border bg-card shadow-sm">
      <CardHeader className="border-b border-border/40 bg-muted/20 pb-5">
        <CardTitle className="text-lg font-medium text-foreground">
          Preferências do aplicativo
        </CardTitle>
        <CardDescription>
          Organize o ditado por blocos: captura, escrita, privacidade e reconhecimento.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-8 pt-6">
        <section className="grid gap-4 rounded-[24px] border border-border/40 bg-muted/10 p-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-muted-foreground">
              Captura e entrada
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Defina como o app escuta sua voz antes da transcrição.
            </p>
          </div>
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
              Microfone preferido
            </label>
            <select
              className="h-11 w-full cursor-pointer appearance-none rounded-xl border border-border/50 bg-background px-4 text-sm text-foreground transition-all hover:bg-muted focus:outline-none focus:ring-1 focus:ring-ring"
              value={micDeviceId}
              onChange={(e) => onSetMicDeviceId(e.target.value)}
              disabled={!hasDesktopApi || settingsSaving}
            >
              <option value="" className="bg-background text-foreground">
                Padrão do sistema
              </option>
              {micDevices.map((d) => (
                <option
                  key={d.deviceId}
                  value={d.deviceId}
                  className="bg-background text-foreground"
                >
                  {d.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                Ganho de entrada
              </label>
              <span className="rounded-md bg-blue-500/10 px-2 py-0.5 font-mono text-xs font-medium text-blue-500">
                {micInputGain.toFixed(2)}x
              </span>
            </div>
            <div className="flex h-11 items-center rounded-xl border border-border/50 bg-background px-4">
              <input
                type="range"
                min={0.5}
                max={2}
                step={0.05}
                value={micInputGain}
                onChange={(e) => onSetInputGain(Number(e.target.value))}
                disabled={!hasDesktopApi || settingsSaving}
                className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-muted accent-blue-500 outline-none"
              />
            </div>
          </div>
        </section>

        <section className="grid gap-4 rounded-[24px] border border-border/40 bg-muted/10 p-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-muted-foreground">
              Texto e idioma
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Ajuste a resposta do ditado para combinar com o seu contexto de uso.
            </p>
          </div>
          <div className="space-y-3">
            <label className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
              Resposta da captura
            </label>
            <select
              className="h-11 w-full cursor-pointer appearance-none rounded-xl border border-border/50 bg-background px-4 text-sm text-foreground transition-all hover:bg-muted focus:outline-none focus:ring-1 focus:ring-ring"
              value={latencyProfile}
              onChange={(e) => onChangeLatencyProfile(e.target.value as LatencyProfile)}
              disabled={!hasDesktopApi || settingsSaving}
            >
              <option value="fast" className="bg-background text-foreground">
                Rápida
              </option>
              <option value="balanced" className="bg-background text-foreground">
                Equilibrada
              </option>
              <option value="accurate" className="bg-background text-foreground">
                Precisa
              </option>
            </select>
          </div>
          <div className="space-y-3">
            <label className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
              Estilo de escrita
            </label>
            <select
              className="h-11 w-full cursor-pointer appearance-none rounded-xl border border-border/50 bg-background px-4 text-sm text-foreground transition-all hover:bg-muted focus:outline-none focus:ring-1 focus:ring-ring"
              value={toneMode}
              onChange={(e) => onChangeToneMode(e.target.value as ToneMode)}
              disabled={!hasDesktopApi || settingsSaving}
            >
              <option value="formal" className="bg-background text-foreground">
                Formal
              </option>
              <option value="casual" className="bg-background text-foreground">
                Natural
              </option>
              <option value="very-casual" className="bg-background text-foreground">
                Bem coloquial
              </option>
            </select>
          </div>
          <div className="space-y-3">
            <label className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
              Idioma principal
            </label>
            <select
              className="h-11 w-full cursor-pointer appearance-none rounded-xl border border-border/50 bg-background px-4 text-sm text-foreground transition-all hover:bg-muted focus:outline-none focus:ring-1 focus:ring-ring"
              value={languageMode}
              onChange={(e) => onSetLanguageMode(e.target.value as LanguageMode)}
              disabled={!hasDesktopApi || settingsSaving}
            >
              <option value="pt-BR" className="bg-background text-foreground">
                Português (Brasil)
              </option>
              <option value="en-US" className="bg-background text-foreground">
                Inglês (US)
              </option>
              <option value="dual" className="bg-background text-foreground">
                Detecção automática
              </option>
            </select>
          </div>
          <div className="space-y-3">
            <label className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
              Serviço de transcrição
            </label>
            <div className="flex h-11 w-full items-center rounded-xl border border-border/40 bg-background px-4 text-sm text-muted-foreground">
              Azure Speech-to-Text
            </div>
          </div>
          <div className="flex items-center justify-between rounded-2xl border border-border/40 bg-background px-5 py-4 transition-colors hover:bg-muted/60">
            <div>
              <span className="block text-sm font-medium text-foreground">
                Comandos estruturais
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Reconhece instruções como nova linha e ponto final.
              </span>
            </div>
            <Switch
              checked={formatCommandsEnabled}
              onCheckedChange={onSetFormatCommandsEnabled}
              disabled={!hasDesktopApi || settingsSaving}
            />
          </div>
        </section>

        <section className="grid gap-4 rounded-[24px] border border-border/40 bg-muted/10 p-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-muted-foreground">
              Privacidade e retenção
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Decida o que fica salvo neste dispositivo e como isso deve ser protegido.
            </p>
          </div>
          <div className="flex items-center justify-between rounded-2xl border border-border/40 bg-background px-5 py-4 transition-colors hover:bg-muted/60">
            <div>
              <span className="block text-sm font-medium text-foreground">
                Salvar histórico local
              </span>
              <div className="mt-1 flex items-center gap-2">
                <span className="block text-xs text-muted-foreground">Reter por</span>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={historyRetentionDays}
                  onChange={(e) => onSetHistoryRetentionDays(Number(e.target.value))}
                  disabled={!hasDesktopApi || !historyEnabled || settingsSaving}
                  className="h-6 w-12 rounded border border-border bg-background text-center text-xs text-foreground focus:border-ring focus:outline-none disabled:opacity-50"
                />
                <span className="block text-xs text-muted-foreground">dias</span>
              </div>
            </div>
            <Switch
              checked={historyEnabled}
              onCheckedChange={onSetHistoryEnabled}
              disabled={!hasDesktopApi || settingsSaving}
            />
          </div>
          <div className="flex items-center justify-between rounded-2xl border border-border/40 bg-background px-5 py-4 transition-colors hover:bg-muted/60">
            <div>
              <span className="block text-sm font-medium text-foreground">Modo privado</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Desativa o salvamento local das transcrições.
              </span>
            </div>
            <Switch
              checked={privacyMode}
              onCheckedChange={onSetPrivacyMode}
              disabled={!hasDesktopApi || settingsSaving}
            />
          </div>
          <div className="rounded-2xl border border-border/40 bg-background px-5 py-4 transition-colors hover:bg-muted/60 sm:col-span-2">
            <label className="block text-sm font-medium text-foreground">
              Proteção do histórico
            </label>
            <p className="mt-1 text-xs text-muted-foreground">
              Escolha como o histórico local será armazenado neste dispositivo.
            </p>
            <select
              className="mt-3 h-11 w-full cursor-pointer appearance-none rounded-xl border border-border/50 bg-background px-4 text-sm text-foreground transition-all hover:bg-muted focus:outline-none focus:ring-1 focus:ring-ring"
              value={historyStorageMode}
              onChange={(e) => onSetHistoryStorageMode(e.target.value as HistoryStorageMode)}
              disabled={!hasDesktopApi || settingsSaving}
            >
              <option value="encrypted" className="bg-background text-foreground">
                Criptografado
              </option>
              <option value="plain" className="bg-background text-foreground">
                Texto simples
              </option>
            </select>
          </div>
        </section>

        <section className="space-y-3 rounded-[24px] border border-border/40 bg-muted/10 p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="space-y-1">
              <label className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                Lista de contexto do Azure
              </label>
              <div className="text-xs text-muted-foreground">
                Adicione nomes, siglas e termos importantes para melhorar o reconhecimento.
              </div>
            </div>
            <Button
              className="h-10 rounded-xl px-6"
              onClick={onSaveComprehensionSettings}
              disabled={!hasDesktopApi || settingsSaving}
            >
              {settingsSaving ? 'Salvando...' : 'Salvar preferências'}
            </Button>
          </div>
          <textarea
            className="custom-scrollbar min-h-[120px] w-full resize-y rounded-xl border border-border/50 bg-background p-4 font-mono text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder={'Exemplo:\nWhatsApp\nSupabase\nReunião de produto'}
            value={extraPhrasesText}
            onChange={(e) => onSetExtraPhrasesText(e.target.value)}
            disabled={!hasDesktopApi || settingsSaving}
            spellCheck={false}
          />
        </section>
      </CardContent>
    </Card>
  );
});

export default SettingsTab;
