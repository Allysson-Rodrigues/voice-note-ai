import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import type { AdaptiveSuggestion, AzureCredentialStatus, HistoryStorageMode } from '@/electron';
import type { LatencyProfile } from '@/lib/latency';
import { memo } from 'react';
import type { AudioDevice, LanguageMode, ToneMode, UiHealthItem } from './types';

type SettingsTabProps = {
  theme: 'light' | 'dark' | 'system';
  onSetTheme: (theme: 'light' | 'dark' | 'system') => void;
  appProfilesText: string;
  azureBusy: boolean;
  azureCredentialStatus: AzureCredentialStatus;
  azureKey: string;
  azureRegion: string;
  extraPhrasesText: string;
  adaptiveLearningEnabled: boolean;
  adaptiveSuggestions: AdaptiveSuggestion[];
  adaptiveSuggestionsBusyId: string | null;
  adaptiveSuggestionsLoading: boolean;
  dualLanguageStrategy: 'parallel' | 'fallback-on-low-confidence';
  formatCommandsEnabled: boolean;
  hasDesktopApi: boolean;
  healthItems: UiHealthItem[];
  historyEnabled: boolean;
  historyRetentionDays: number;
  historyStorageMode: HistoryStorageMode;
  hotkeyFallback: string;
  hotkeyPrimary: string;
  languageMode: LanguageMode;
  latencyProfile: LatencyProfile;
  maxSessionSeconds: number;
  micDeviceId: string;
  micDevices: AudioDevice[];
  micInputGain: number;
  onClearAzureCredentials: () => void;
  onChangeLatencyProfile: (value: LatencyProfile) => void;
  onChangeToneMode: (value: ToneMode) => void;
  onSaveAzureCredentials: () => void;
  onSaveComprehensionSettings: () => void;
  onSetAppProfilesText: (value: string) => void;
  onSetAzureKey: (value: string) => void;
  onSetAzureRegion: (value: string) => void;
  onSetDualLanguageStrategy: (value: 'parallel' | 'fallback-on-low-confidence') => void;
  onSetExtraPhrasesText: (value: string) => void;
  onSetFormatCommandsEnabled: (value: boolean) => void;
  onSetHistoryEnabled: (value: boolean) => void;
  onSetHistoryRetentionDays: (value: number) => void;
  onSetHistoryStorageMode: (value: HistoryStorageMode) => void;
  onSetAdaptiveLearningEnabled: (value: boolean) => void;
  onSetHotkeyFallback: (value: string) => void;
  onSetHotkeyPrimary: (value: string) => void;
  onSetInputGain: (value: number) => void;
  onSetIntentDetectionEnabled: (value: boolean) => void;
  onSetLanguageMode: (value: LanguageMode) => void;
  onSetLowConfidencePolicy: (value: 'paste' | 'copy-only' | 'review') => void;
  onSetMaxSessionSeconds: (value: number) => void;
  onSetMicDeviceId: (value: string) => void;
  onSetPostprocessProfile: (value: 'safe' | 'balanced' | 'aggressive') => void;
  onSetPrivacyMode: (value: boolean) => void;
  onSetProtectedTermsText: (value: string) => void;
  onSetRewriteEnabled: (value: boolean) => void;
  onSetRewriteMode: (value: 'off' | 'safe' | 'aggressive') => void;
  onTestAzureCredentials: () => void;
  onApplyAdaptiveSuggestion: (suggestion: AdaptiveSuggestion) => void;
  onDismissAdaptiveSuggestion: (suggestion: AdaptiveSuggestion) => void;
  onRefreshAdaptiveSuggestions: () => void;
  protectedTermsText: string;
  privacyMode: boolean;
  intentDetectionEnabled: boolean;
  lowConfidencePolicy: 'paste' | 'copy-only' | 'review';
  postprocessProfile: 'safe' | 'balanced' | 'aggressive';
  rewriteEnabled: boolean;
  rewriteMode: 'off' | 'safe' | 'aggressive';
  settingsSaving: boolean;
  toneMode: ToneMode;
  captureBlockedReason?: string;
};

const sectionClass = 'card-warm grid gap-4 rounded-[24px] p-5 sm:grid-cols-2';
const sectionHeaderClass =
  'text-[11px] font-bold uppercase tracking-[0.22em] text-muted-foreground';
const fieldLabelClass = 'text-[11px] font-bold uppercase tracking-widest text-muted-foreground';
const selectClass =
  'h-11 w-full cursor-pointer appearance-none rounded-xl border border-border/50 bg-background px-4 text-sm text-foreground transition-all hover:bg-muted focus:outline-none focus:ring-1 focus:ring-ring';
const inputClass =
  'h-11 w-full rounded-xl border border-border/50 bg-background px-4 text-sm text-foreground transition-all hover:bg-muted focus:outline-none focus:ring-1 focus:ring-ring';
const textareaClass =
  'min-h-[132px] w-full rounded-2xl border border-border/50 bg-background px-4 py-3 text-sm text-foreground transition-all hover:bg-muted focus:outline-none focus:ring-1 focus:ring-ring';
const surfaceClass =
  'rounded-2xl border border-border/40 bg-background/80 px-5 py-4 transition-colors hover:bg-background';

const SettingsTab = memo(function SettingsTab({
  theme,
  onSetTheme,
  appProfilesText,
  azureBusy,
  azureCredentialStatus,
  azureKey,
  azureRegion,
  extraPhrasesText,
  adaptiveLearningEnabled,
  adaptiveSuggestions,
  adaptiveSuggestionsBusyId,
  adaptiveSuggestionsLoading,
  formatCommandsEnabled,
  dualLanguageStrategy,
  hasDesktopApi,
  healthItems,
  historyEnabled,
  historyRetentionDays,
  historyStorageMode,
  hotkeyFallback,
  hotkeyPrimary,
  languageMode,
  latencyProfile,
  maxSessionSeconds,
  micDeviceId,
  micDevices,
  micInputGain,
  onClearAzureCredentials,
  onChangeLatencyProfile,
  onChangeToneMode,
  onSaveAzureCredentials,
  onSaveComprehensionSettings,
  onSetAppProfilesText,
  onSetAzureKey,
  onSetAzureRegion,
  onSetDualLanguageStrategy,
  onSetExtraPhrasesText,
  onSetFormatCommandsEnabled,
  onSetHistoryEnabled,
  onSetHistoryRetentionDays,
  onSetHistoryStorageMode,
  onSetAdaptiveLearningEnabled,
  onSetHotkeyFallback,
  onSetHotkeyPrimary,
  onSetInputGain,
  onSetIntentDetectionEnabled,
  onSetLanguageMode,
  onSetLowConfidencePolicy,
  onSetMaxSessionSeconds,
  onSetMicDeviceId,
  onSetPostprocessProfile,
  onSetPrivacyMode,
  onSetProtectedTermsText,
  onSetRewriteEnabled,
  onSetRewriteMode,
  onTestAzureCredentials,
  onApplyAdaptiveSuggestion,
  onDismissAdaptiveSuggestion,
  onRefreshAdaptiveSuggestions,
  protectedTermsText,
  privacyMode,
  intentDetectionEnabled,
  lowConfidencePolicy,
  postprocessProfile,
  rewriteEnabled,
  rewriteMode,
  settingsSaving,
  toneMode,
  captureBlockedReason,
}: SettingsTabProps) {
  const hookHealth = healthItems.find((item) => item.id === 'hook');
  const sttHealth = healthItems.find((item) => item.id === 'stt');
  const networkHealth = healthItems.find((item) => item.id === 'network');
  const injectionHealth = healthItems.find((item) => item.id === 'injection');
  const microphoneHealth = healthItems.find((item) => item.id === 'microphone');
  const azureSourceLabel =
    azureCredentialStatus.source === 'secure-store'
      ? 'Armazenamento seguro'
      : azureCredentialStatus.source === 'environment'
        ? 'Variáveis de ambiente'
        : 'Não configurado';
  const azureSecurityLabel =
    azureCredentialStatus.storageMode === 'plain'
      ? 'Credenciais legadas em texto simples detectadas.'
      : azureCredentialStatus.canPersistSecurely
        ? 'safeStorage disponível para persistência local segura.'
        : 'safeStorage indisponível. Use variáveis de ambiente para evitar texto simples.';

  return (
    <Card className="card-warm mb-6 overflow-hidden border-border shadow-sm">
      <CardHeader className="border-b border-border/40 bg-background/50 pb-5">
        <CardTitle className="text-lg font-medium text-foreground">
          Preferências do aplicativo
        </CardTitle>
        <CardDescription>
          Organize o ditado por blocos: captura, escrita, privacidade e reconhecimento.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-8 pt-6">
        <section className="glass grid gap-3 rounded-[24px] p-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-border/40 bg-background/80 px-4 py-3">
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              Tema
            </div>
            <div className="mt-2 text-sm font-medium text-foreground">
              {theme === 'system' ? 'Segue o sistema' : theme === 'dark' ? 'Escuro' : 'Claro'}
            </div>
          </div>
          <div className="rounded-2xl border border-border/40 bg-background/80 px-4 py-3">
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              Idioma ativo
            </div>
            <div className="mt-2 text-sm font-medium text-foreground">
              {languageMode === 'dual'
                ? 'Detecção automática'
                : languageMode === 'en-US'
                  ? 'Inglês (US)'
                  : 'Português (Brasil)'}
            </div>
          </div>
          <div className="rounded-2xl border border-border/40 bg-background/80 px-4 py-3">
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              Histórico local
            </div>
            <div className="mt-2 text-sm font-medium text-foreground">
              {privacyMode
                ? 'Privado'
                : historyEnabled
                  ? `${historyRetentionDays} dias`
                  : 'Desligado'}
            </div>
          </div>
        </section>

        {captureBlockedReason ? (
          <section className="glass rounded-[24px] border border-amber-400/20 bg-amber-300/10 p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className={sectionHeaderClass}>Ação necessária</div>
                <div className="mt-2 text-base font-medium text-foreground">
                  O runtime do ditado ainda não está pronto.
                </div>
                <div className="mt-1 text-sm text-muted-foreground">{captureBlockedReason}</div>
              </div>
              <div className="rounded-full border border-amber-400/20 bg-background/80 px-3 py-1 text-xs font-medium text-foreground">
                Requer ajuste
              </div>
            </div>
          </section>
        ) : null}

        <section className={sectionClass}>
          <div className="sm:col-span-2">
            <div className={sectionHeaderClass}>Segurança e Azure</div>
            <p className="mt-1 text-sm text-muted-foreground">
              Configure as credenciais do Speech sem empacotar segredos no instalador.
            </p>
          </div>
          <div className={`${surfaceClass} sm:col-span-2`}>
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                  Fonte atual
                </div>
                <div className="mt-2 text-sm font-medium text-foreground">{azureSourceLabel}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {azureCredentialStatus.hasStoredCredentials
                    ? `Região salva: ${azureCredentialStatus.region ?? 'não informada'}`
                    : 'Nenhuma credencial segura persistida.'}
                </div>
                <div className="mt-2 text-xs text-muted-foreground">{azureSecurityLabel}</div>
              </div>
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                  Speech
                </div>
                <div className="mt-2 text-sm font-medium text-foreground">
                  {sttHealth?.status === 'ok'
                    ? 'Validado'
                    : sttHealth?.status === 'warn'
                      ? 'Parcial'
                      : 'Pendente'}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {sttHealth?.message ?? 'Ainda não validado.'}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                  Rede
                </div>
                <div className="mt-2 text-sm font-medium text-foreground">
                  {networkHealth?.status === 'ok'
                    ? 'Conectado'
                    : networkHealth?.status === 'warn'
                      ? 'Atenção'
                      : 'Falha'}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {networkHealth?.message ?? 'Diagnóstico ainda não executado.'}
                </div>
              </div>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="space-y-3">
                <label className={fieldLabelClass}>Chave do Azure Speech</label>
                <input
                  className={inputClass}
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  value={azureKey}
                  onChange={(e) => onSetAzureKey(e.target.value)}
                  disabled={!hasDesktopApi || azureBusy}
                  placeholder="Cole a subscription key"
                />
              </div>
              <div className="space-y-3">
                <label className={fieldLabelClass}>Região</label>
                <input
                  className={inputClass}
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  value={azureRegion}
                  onChange={(e) => onSetAzureRegion(e.target.value)}
                  disabled={!hasDesktopApi || azureBusy}
                  placeholder="Ex.: brazilsouth"
                />
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button
                type="button"
                variant="secondary"
                onClick={onTestAzureCredentials}
                disabled={!hasDesktopApi || azureBusy}
              >
                Testar conexão
              </Button>
              <Button
                type="button"
                onClick={onSaveAzureCredentials}
                disabled={!hasDesktopApi || azureBusy || !azureCredentialStatus.canPersistSecurely}
              >
                Salvar com segurança
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={onClearAzureCredentials}
                disabled={!hasDesktopApi || azureBusy}
              >
                Limpar credenciais salvas
              </Button>
            </div>
          </div>
        </section>

        <section className={sectionClass}>
          <div className="sm:col-span-2">
            <div className={sectionHeaderClass}>Aparência</div>
            <p className="mt-1 text-sm text-muted-foreground">
              Personalize a aparência do aplicativo.
            </p>
          </div>
          <div className="space-y-3">
            <label className={fieldLabelClass}>Tema</label>
            <select
              className={selectClass}
              value={theme}
              onChange={(e) => onSetTheme(e.target.value as 'light' | 'dark' | 'system')}
              disabled={!hasDesktopApi || settingsSaving}
            >
              <option value="light" className="bg-background text-foreground">
                Claro
              </option>
              <option value="dark" className="bg-background text-foreground">
                Escuro
              </option>
              <option value="system" className="bg-background text-foreground">
                Padrão do sistema
              </option>
            </select>
          </div>
        </section>
        <section className={sectionClass}>
          <div className="sm:col-span-2">
            <div className={sectionHeaderClass}>Captura e entrada</div>
            <p className="mt-1 text-sm text-muted-foreground">
              Defina como o app escuta sua voz antes da transcrição.
            </p>
          </div>
          <div className={`${surfaceClass} sm:col-span-2`}>
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                  Atalho global
                </div>
                <div className="mt-2 text-sm font-medium text-foreground">
                  {hookHealth?.status === 'ok'
                    ? 'Pronto'
                    : hookHealth?.status === 'warn'
                      ? 'Parcial'
                      : 'Indisponível'}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {hookHealth?.message ?? 'Diagnóstico ainda não executado.'}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                  Microfone
                </div>
                <div className="mt-2 text-sm font-medium text-foreground">
                  {microphoneHealth?.status === 'ok'
                    ? 'Detectado'
                    : microphoneHealth?.status === 'warn'
                      ? 'Revisar'
                      : 'Falha'}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {microphoneHealth?.message ?? 'Diagnóstico ainda não executado.'}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                  Inserção automática
                </div>
                <div className="mt-2 text-sm font-medium text-foreground">
                  {injectionHealth?.status === 'ok'
                    ? 'Saudável'
                    : injectionHealth?.status === 'warn'
                      ? 'Dependente do contexto'
                      : 'Falha'}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {injectionHealth?.message ?? 'Ainda não há telemetria suficiente.'}
                </div>
              </div>
            </div>
          </div>
          <div className="space-y-3">
            <label className={fieldLabelClass}>Microfone preferido</label>
            <select
              className={selectClass}
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
              <label className={fieldLabelClass}>Ganho de entrada</label>
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
          <div className={`${surfaceClass} sm:col-span-2`}>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-3">
                <label className={fieldLabelClass}>Hotkey primária</label>
                <input
                  className={inputClass}
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  value={hotkeyPrimary}
                  onChange={(e) => onSetHotkeyPrimary(e.target.value)}
                  disabled={!hasDesktopApi || settingsSaving}
                  placeholder="CommandOrControl+Super"
                />
                <p className="text-xs text-muted-foreground">
                  No Windows, esse atalho também define o chord de hold-to-talk.
                </p>
              </div>
              <div className="space-y-3">
                <label className={fieldLabelClass}>Hotkey fallback</label>
                <input
                  className={inputClass}
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  value={hotkeyFallback}
                  onChange={(e) => onSetHotkeyFallback(e.target.value)}
                  disabled={!hasDesktopApi || settingsSaving}
                  placeholder="CommandOrControl+Super+Space"
                />
                <p className="text-xs text-muted-foreground">
                  Usado quando o modo hold não está disponível.
                </p>
              </div>
              <div className="space-y-3">
                <label className={fieldLabelClass}>Duração máxima da sessão</label>
                <input
                  className={inputClass}
                  type="number"
                  min={30}
                  max={600}
                  step={5}
                  value={maxSessionSeconds}
                  onChange={(e) => onSetMaxSessionSeconds(Number(e.target.value))}
                  disabled={!hasDesktopApi || settingsSaving}
                />
                <p className="text-xs text-muted-foreground">
                  Watchdog automático para encerrar capturas longas demais.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className={sectionClass}>
          <div className="sm:col-span-2">
            <div className={sectionHeaderClass}>Resposta do texto</div>
            <p className="mt-1 text-sm text-muted-foreground">
              Ajuste como o ditado responde ao seu contexto de uso.
            </p>
          </div>
          <div className="space-y-3">
            <label className={fieldLabelClass}>Resposta da captura</label>
            <select
              className={selectClass}
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
            <label className={fieldLabelClass}>Estilo de escrita</label>
            <select
              className={selectClass}
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
            <label className={fieldLabelClass}>Idioma principal</label>
            <select
              className={selectClass}
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
            <label className={fieldLabelClass}>Serviço de transcrição</label>
            <div className="flex h-11 w-full items-center rounded-xl border border-border/40 bg-background px-4 text-sm text-muted-foreground">
              Azure Speech-to-Text
            </div>
          </div>
          <div className="space-y-3">
            <label className={fieldLabelClass}>Pós-processamento</label>
            <select
              className={selectClass}
              value={postprocessProfile}
              onChange={(e) =>
                onSetPostprocessProfile(e.target.value as 'safe' | 'balanced' | 'aggressive')
              }
              disabled={!hasDesktopApi || settingsSaving}
            >
              <option value="safe" className="bg-background text-foreground">
                Seguro
              </option>
              <option value="balanced" className="bg-background text-foreground">
                Equilibrado
              </option>
              <option value="aggressive" className="bg-background text-foreground">
                Agressivo
              </option>
            </select>
          </div>
          <div className="space-y-3">
            <label className={fieldLabelClass}>Estratégia bilíngue</label>
            <select
              className={selectClass}
              value={dualLanguageStrategy}
              onChange={(e) =>
                onSetDualLanguageStrategy(
                  e.target.value as 'parallel' | 'fallback-on-low-confidence',
                )
              }
              disabled={!hasDesktopApi || settingsSaving}
            >
              <option value="fallback-on-low-confidence" className="bg-background text-foreground">
                Fallback por confiança
              </option>
              <option value="parallel" className="bg-background text-foreground">
                Paralelo
              </option>
            </select>
          </div>
          <div className={`${surfaceClass} sm:col-span-2`}>
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
          <div className={`${surfaceClass} sm:col-span-2`}>
            <div>
              <span className="block text-sm font-medium text-foreground">
                Perfis por aplicativo
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                JSON opcional para viés de idioma, domínio, frases extras, método de injeção e
                perfil de pós-processamento por app.
              </span>
            </div>
            <textarea
              className={`${textareaClass} mt-4 font-mono text-[13px]`}
              value={appProfilesText}
              onChange={(e) => onSetAppProfilesText(e.target.value)}
              disabled={!hasDesktopApi || settingsSaving}
              spellCheck={false}
              placeholder={`{\n  "slack.exe": {\n    "languageBias": "pt-BR",\n    "domain": "work",\n    "postprocessProfile": "balanced"\n  }\n}`}
            />
          </div>
        </section>

        <section className={sectionClass}>
          <div className="sm:col-span-2">
            <div className={sectionHeaderClass}>Privacidade e retenção</div>
            <p className="mt-1 text-sm text-muted-foreground">
              Decida o que fica salvo neste dispositivo e como isso deve ser protegido.
            </p>
          </div>
          <div className={surfaceClass}>
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
          <div className={surfaceClass}>
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
          <div className={`${surfaceClass} sm:col-span-2`}>
            <label className="block text-sm font-medium text-foreground">
              Proteção do histórico
            </label>
            <p className="mt-1 text-xs text-muted-foreground">
              Escolha como o histórico local será armazenado neste dispositivo.
            </p>
            <select
              className={`mt-3 ${selectClass}`}
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

        <section className={sectionClass}>
          <div className="sm:col-span-2">
            <div className={sectionHeaderClass}>Inteligência de transcrição</div>
            <p className="mt-1 text-sm text-muted-foreground">
              Controle como o app interpreta intenção, reescreve a saída e reage a baixa confiança.
            </p>
          </div>
          <div className={surfaceClass}>
            <div>
              <span className="block text-sm font-medium text-foreground">
                Detectar intenção do texto
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Diferencia lista, chat, e-mail e nota técnica antes do pós-processamento.
              </span>
            </div>
            <Switch
              checked={intentDetectionEnabled}
              onCheckedChange={onSetIntentDetectionEnabled}
              disabled={!hasDesktopApi || settingsSaving}
            />
          </div>
          <div className={surfaceClass}>
            <div>
              <span className="block text-sm font-medium text-foreground">
                Aprendizado adaptativo local
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Observa padrões de uso e sugere termos e perfis por aplicativo.
              </span>
            </div>
            <Switch
              checked={adaptiveLearningEnabled}
              onCheckedChange={onSetAdaptiveLearningEnabled}
              disabled={!hasDesktopApi || settingsSaving}
            />
          </div>
          <div className={surfaceClass}>
            <div>
              <span className="block text-sm font-medium text-foreground">Reescrita segura</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Faz uma segunda passada para estruturar melhor frases e listas.
              </span>
            </div>
            <Switch
              checked={rewriteEnabled}
              onCheckedChange={onSetRewriteEnabled}
              disabled={!hasDesktopApi || settingsSaving}
            />
          </div>
          <div className="space-y-3">
            <label className={fieldLabelClass}>Modo de reescrita</label>
            <select
              className={selectClass}
              value={rewriteMode}
              onChange={(e) => onSetRewriteMode(e.target.value as 'off' | 'safe' | 'aggressive')}
              disabled={!hasDesktopApi || settingsSaving || !rewriteEnabled}
            >
              <option value="off">Desligado</option>
              <option value="safe">Seguro</option>
              <option value="aggressive">Agressivo</option>
            </select>
          </div>
          <div className="space-y-3">
            <label className={fieldLabelClass}>Política de baixa confiança</label>
            <select
              className={selectClass}
              value={lowConfidencePolicy}
              onChange={(e) =>
                onSetLowConfidencePolicy(e.target.value as 'paste' | 'copy-only' | 'review')
              }
              disabled={!hasDesktopApi || settingsSaving}
            >
              <option value="paste">Colar mesmo assim</option>
              <option value="copy-only">Só copiar</option>
              <option value="review">Copiar para revisão</option>
            </select>
          </div>
          <div className="space-y-3 sm:col-span-2">
            <label className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
              Termos protegidos
            </label>
            <div className="text-xs text-muted-foreground">
              Um termo por linha. Use para nomes próprios, siglas e palavras que não podem ser
              deformadas pelo reconhecimento ou rewrite.
            </div>
            <textarea
              className="custom-scrollbar min-h-[120px] w-full resize-y rounded-xl border border-border/50 bg-background p-4 font-mono text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
              value={protectedTermsText}
              onChange={(e) => onSetProtectedTermsText(e.target.value)}
              placeholder={'Antigravity\nWorkspace\nPostgres'}
              disabled={!hasDesktopApi || settingsSaving}
            />
          </div>
        </section>

        <section className="card-warm space-y-4 rounded-[24px] p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className={sectionHeaderClass}>Sugestões adaptativas</div>
              <p className="mt-1 text-sm text-muted-foreground">
                O app observa padrões locais e propõe ajustes de baixo risco para o seu contexto.
              </p>
            </div>
            <Button
              variant="outline"
              className="h-10 rounded-xl"
              onClick={onRefreshAdaptiveSuggestions}
              disabled={!hasDesktopApi || settingsSaving || !adaptiveLearningEnabled}
            >
              {adaptiveSuggestionsLoading ? 'Atualizando...' : 'Atualizar sugestões'}
            </Button>
          </div>

          {!adaptiveLearningEnabled ? (
            <div className="rounded-2xl border border-border/40 bg-background px-5 py-4 text-sm text-muted-foreground">
              Ative o aprendizado adaptativo para gerar sugestões a partir do histórico local.
            </div>
          ) : adaptiveSuggestions.length === 0 ? (
            <div className="rounded-2xl border border-border/40 bg-background px-5 py-4 text-sm text-muted-foreground">
              Ainda não há sugestões suficientes. Use o app em alguns contextos para o sistema
              observar padrões.
            </div>
          ) : (
            <div className="space-y-3">
              {adaptiveSuggestions.map((suggestion) => (
                <div
                  key={suggestion.id}
                  className="rounded-2xl border border-border/40 bg-background px-5 py-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                        <span>{suggestion.type}</span>
                        <span className="rounded-full bg-muted px-2 py-1 text-foreground/80">
                          {suggestion.appKey}
                        </span>
                        <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-emerald-600 dark:text-emerald-400">
                          confiança {Math.round(suggestion.confidence * 100)}%
                        </span>
                      </div>
                      <div className="mt-2 text-sm font-medium text-foreground">
                        {suggestion.type === 'protected-term'
                          ? `Proteger o termo "${suggestion.payload.term}"`
                          : suggestion.type === 'format-style'
                            ? `Definir estilo padrão como "${suggestion.payload.formatStyle}"`
                            : `Definir viés de idioma como "${suggestion.payload.languageBias}"`}
                      </div>
                      <div className="mt-1 text-sm text-muted-foreground">{suggestion.reason}</div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Button
                        size="sm"
                        className="h-9 rounded-lg px-4"
                        onClick={() => onApplyAdaptiveSuggestion(suggestion)}
                        disabled={adaptiveSuggestionsBusyId === suggestion.id || settingsSaving}
                      >
                        Aplicar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-9 rounded-lg px-4"
                        onClick={() => onDismissAdaptiveSuggestion(suggestion)}
                        disabled={adaptiveSuggestionsBusyId === suggestion.id || settingsSaving}
                      >
                        Ignorar
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
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
