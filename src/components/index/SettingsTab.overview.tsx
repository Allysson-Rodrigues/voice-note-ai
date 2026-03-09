import { Button } from "@/components/ui/button";
import type { UiHealthItem } from "./types";
import {
  fieldLabelClass,
  inputClass,
  sectionClass,
  sectionHeaderClass,
  selectClass,
  surfaceClass,
} from "./SettingsTab.shared";
import type { SettingsTabProps, ThemeMode } from "./SettingsTab.types";

type SettingsSummaryStripProps = {
  theme: ThemeMode;
  languageMode: SettingsTabProps["languageMode"];
  privacyMode: boolean;
  historyEnabled: boolean;
  historyRetentionDays: number;
};

type CaptureBlockedNoticeProps = {
  captureBlockedReason?: string;
};

type AzureSecuritySectionProps = Pick<
  SettingsTabProps,
  | "azureBusy"
  | "azureCredentialStatus"
  | "azureKey"
  | "azureRegion"
  | "hasDesktopApi"
  | "onClearAzureCredentials"
  | "onSaveAzureCredentials"
  | "onSetAzureKey"
  | "onSetAzureRegion"
  | "onTestAzureCredentials"
> & {
  sttHealth?: UiHealthItem;
  networkHealth?: UiHealthItem;
  azureSourceLabel: string;
  azureSecurityLabel: string;
};

type AppearanceSectionProps = Pick<
  SettingsTabProps,
  "theme" | "onSetTheme" | "hasDesktopApi" | "settingsSaving"
>;

export function SettingsSummaryStrip({
  theme,
  languageMode,
  privacyMode,
  historyEnabled,
  historyRetentionDays,
}: SettingsSummaryStripProps) {
  return (
    <section className="glass grid gap-3 rounded-[24px] p-4 sm:grid-cols-3">
      <div className="rounded-2xl border border-border/40 bg-background/80 px-4 py-3">
        <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
          Tema
        </div>
        <div className="mt-2 text-sm font-medium text-foreground">
          {theme === "system"
            ? "Segue o sistema"
            : theme === "dark"
              ? "Escuro"
              : "Claro"}
        </div>
      </div>
      <div className="rounded-2xl border border-border/40 bg-background/80 px-4 py-3">
        <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
          Idioma ativo
        </div>
        <div className="mt-2 text-sm font-medium text-foreground">
          {languageMode === "dual"
            ? "Detecção automática"
            : languageMode === "en-US"
              ? "Inglês (US)"
              : "Português (Brasil)"}
        </div>
      </div>
      <div className="rounded-2xl border border-border/40 bg-background/80 px-4 py-3">
        <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
          Histórico local
        </div>
        <div className="mt-2 text-sm font-medium text-foreground">
          {privacyMode
            ? "Privado"
            : historyEnabled
              ? `${historyRetentionDays} dias`
              : "Desligado"}
        </div>
      </div>
    </section>
  );
}

export function CaptureBlockedNotice({
  captureBlockedReason,
}: CaptureBlockedNoticeProps) {
  if (!captureBlockedReason) return null;

  return (
    <section className="glass rounded-[24px] border border-amber-400/20 bg-amber-300/10 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className={sectionHeaderClass}>Ação necessária</div>
          <div className="mt-2 text-base font-medium text-foreground">
            O runtime do ditado ainda não está pronto.
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            {captureBlockedReason}
          </div>
        </div>
        <div className="rounded-full border border-amber-400/20 bg-background/80 px-3 py-1 text-xs font-medium text-foreground">
          Requer ajuste
        </div>
      </div>
    </section>
  );
}

export function AzureSecuritySection({
  azureBusy,
  azureCredentialStatus,
  azureKey,
  azureRegion,
  hasDesktopApi,
  onClearAzureCredentials,
  onSaveAzureCredentials,
  onSetAzureKey,
  onSetAzureRegion,
  onTestAzureCredentials,
  sttHealth,
  networkHealth,
  azureSourceLabel,
  azureSecurityLabel,
}: AzureSecuritySectionProps) {
  return (
    <section className={sectionClass}>
      <div className="sm:col-span-2">
        <div className={sectionHeaderClass}>Segurança e Azure</div>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure as credenciais do Speech sem empacotar segredos no
          instalador.
        </p>
      </div>
      <div className={`${surfaceClass} sm:col-span-2`}>
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              Fonte atual
            </div>
            <div className="mt-2 text-sm font-medium text-foreground">
              {azureSourceLabel}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {azureCredentialStatus.hasStoredCredentials
                ? `Região salva: ${azureCredentialStatus.region ?? "não informada"}`
                : "Nenhuma credencial segura persistida."}
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              {azureSecurityLabel}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              Speech
            </div>
            <div className="mt-2 text-sm font-medium text-foreground">
              {sttHealth?.status === "ok"
                ? "Validado"
                : sttHealth?.status === "warn"
                  ? "Parcial"
                  : "Pendente"}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {sttHealth?.message ?? "Ainda não validado."}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              Rede
            </div>
            <div className="mt-2 text-sm font-medium text-foreground">
              {networkHealth?.status === "ok"
                ? "Conectado"
                : networkHealth?.status === "warn"
                  ? "Atenção"
                  : "Falha"}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {networkHealth?.message ?? "Diagnóstico ainda não executado."}
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
              onChange={(event) => onSetAzureKey(event.target.value)}
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
              onChange={(event) => onSetAzureRegion(event.target.value)}
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
            disabled={
              !hasDesktopApi ||
              azureBusy ||
              !azureCredentialStatus.canPersistSecurely
            }
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
  );
}

export function AppearanceSection({
  theme,
  onSetTheme,
  hasDesktopApi,
  settingsSaving,
}: AppearanceSectionProps) {
  return (
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
          onChange={(event) => onSetTheme(event.target.value as ThemeMode)}
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
  );
}
