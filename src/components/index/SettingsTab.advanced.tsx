import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  fieldLabelClass,
  sectionClass,
  sectionHeaderClass,
  selectClass,
  surfaceClass,
} from "./SettingsTab.shared";
import type { SettingsTabProps } from "./SettingsTab.types";

type PrivacyRetentionSectionProps = Pick<
  SettingsTabProps,
  | "hasDesktopApi"
  | "historyEnabled"
  | "historyRetentionDays"
  | "historyStorageMode"
  | "onSetHistoryEnabled"
  | "onSetHistoryRetentionDays"
  | "onSetHistoryStorageMode"
  | "onSetPrivacyMode"
  | "privacyMode"
  | "settingsSaving"
>;

type TranscriptIntelligenceSectionProps = Pick<
  SettingsTabProps,
  | "adaptiveLearningEnabled"
  | "hasDesktopApi"
  | "intentDetectionEnabled"
  | "lowConfidencePolicy"
  | "onSetAdaptiveLearningEnabled"
  | "onSetIntentDetectionEnabled"
  | "onSetLowConfidencePolicy"
  | "onSetProtectedTermsText"
  | "onSetRewriteEnabled"
  | "onSetRewriteMode"
  | "protectedTermsText"
  | "rewriteEnabled"
  | "rewriteMode"
  | "settingsSaving"
>;

type AdaptiveSuggestionsSectionProps = Pick<
  SettingsTabProps,
  | "adaptiveLearningEnabled"
  | "adaptiveSuggestions"
  | "adaptiveSuggestionsBusyId"
  | "adaptiveSuggestionsLoading"
  | "hasDesktopApi"
  | "onApplyAdaptiveSuggestion"
  | "onDismissAdaptiveSuggestion"
  | "onRefreshAdaptiveSuggestions"
  | "settingsSaving"
>;

type ComprehensionSectionProps = Pick<
  SettingsTabProps,
  | "extraPhrasesText"
  | "hasDesktopApi"
  | "onSaveComprehensionSettings"
  | "onSetExtraPhrasesText"
  | "settingsSaving"
>;

export function PrivacyRetentionSection({
  hasDesktopApi,
  historyEnabled,
  historyRetentionDays,
  historyStorageMode,
  onSetHistoryEnabled,
  onSetHistoryRetentionDays,
  onSetHistoryStorageMode,
  onSetPrivacyMode,
  privacyMode,
  settingsSaving,
}: PrivacyRetentionSectionProps) {
  return (
    <section className={sectionClass}>
      <div className="sm:col-span-2">
        <div className={sectionHeaderClass}>Privacidade e retenção</div>
        <p className="mt-1 text-sm text-muted-foreground">
          Decida o que fica salvo neste dispositivo e como isso deve ser
          protegido.
        </p>
      </div>
      <div className={surfaceClass}>
        <div>
          <span className="block text-sm font-medium text-foreground">
            Salvar histórico local
          </span>
          <div className="mt-1 flex items-center gap-2">
            <span className="block text-xs text-muted-foreground">
              Reter por
            </span>
            <input
              type="number"
              min={1}
              max={365}
              value={historyRetentionDays}
              onChange={(event) =>
                onSetHistoryRetentionDays(Number(event.target.value))
              }
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
          <span className="block text-sm font-medium text-foreground">
            Modo privado
          </span>
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
          onChange={(event) =>
            onSetHistoryStorageMode(
              event.target.value as SettingsTabProps["historyStorageMode"],
            )
          }
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
  );
}

export function TranscriptIntelligenceSection({
  adaptiveLearningEnabled,
  hasDesktopApi,
  intentDetectionEnabled,
  lowConfidencePolicy,
  onSetAdaptiveLearningEnabled,
  onSetIntentDetectionEnabled,
  onSetLowConfidencePolicy,
  onSetProtectedTermsText,
  onSetRewriteEnabled,
  onSetRewriteMode,
  protectedTermsText,
  rewriteEnabled,
  rewriteMode,
  settingsSaving,
}: TranscriptIntelligenceSectionProps) {
  return (
    <section className={sectionClass}>
      <div className="sm:col-span-2">
        <div className={sectionHeaderClass}>Inteligência de transcrição</div>
        <p className="mt-1 text-sm text-muted-foreground">
          Controle como o app interpreta intenção, reescreve a saída e reage a
          baixa confiança.
        </p>
      </div>
      <div className={surfaceClass}>
        <div>
          <span className="block text-sm font-medium text-foreground">
            Detectar intenção do texto
          </span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            Diferencia lista, chat, e-mail e nota técnica antes do
            pós-processamento.
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
          <span className="block text-sm font-medium text-foreground">
            Reescrita segura
          </span>
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
          onChange={(event) =>
            onSetRewriteMode(
              event.target.value as SettingsTabProps["rewriteMode"],
            )
          }
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
          onChange={(event) =>
            onSetLowConfidencePolicy(
              event.target.value as SettingsTabProps["lowConfidencePolicy"],
            )
          }
          disabled={!hasDesktopApi || settingsSaving}
        >
          <option value="paste">Colar mesmo assim</option>
          <option value="copy-only">Só copiar</option>
          <option value="review">Copiar para revisão</option>
        </select>
      </div>
      <div className="space-y-3 sm:col-span-2">
        <label className={fieldLabelClass}>Termos protegidos</label>
        <div className="text-xs text-muted-foreground">
          Um termo por linha. Use para nomes próprios, siglas e palavras que não
          podem ser deformadas pelo reconhecimento ou rewrite.
        </div>
        <textarea
          className="custom-scrollbar min-h-[120px] w-full resize-y rounded-xl border border-border/50 bg-background p-4 font-mono text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
          value={protectedTermsText}
          onChange={(event) => onSetProtectedTermsText(event.target.value)}
          placeholder={"Antigravity\nWorkspace\nPostgres"}
          disabled={!hasDesktopApi || settingsSaving}
        />
      </div>
    </section>
  );
}

export function AdaptiveSuggestionsSection({
  adaptiveLearningEnabled,
  adaptiveSuggestions,
  adaptiveSuggestionsBusyId,
  adaptiveSuggestionsLoading,
  hasDesktopApi,
  onApplyAdaptiveSuggestion,
  onDismissAdaptiveSuggestion,
  onRefreshAdaptiveSuggestions,
  settingsSaving,
}: AdaptiveSuggestionsSectionProps) {
  return (
    <section className="card-warm space-y-4 rounded-[24px] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className={sectionHeaderClass}>Sugestões adaptativas</div>
          <p className="mt-1 text-sm text-muted-foreground">
            O app observa padrões locais e propõe ajustes de baixo risco para o
            seu contexto.
          </p>
        </div>
        <Button
          variant="outline"
          className="h-10 rounded-xl"
          onClick={onRefreshAdaptiveSuggestions}
          disabled={
            !hasDesktopApi || settingsSaving || !adaptiveLearningEnabled
          }
        >
          {adaptiveSuggestionsLoading
            ? "Atualizando..."
            : "Atualizar sugestões"}
        </Button>
      </div>

      {!adaptiveLearningEnabled ? (
        <div className="rounded-2xl border border-border/40 bg-background px-5 py-4 text-sm text-muted-foreground">
          Ative o aprendizado adaptativo para gerar sugestões a partir do
          histórico local.
        </div>
      ) : adaptiveSuggestions.length === 0 ? (
        <div className="rounded-2xl border border-border/40 bg-background px-5 py-4 text-sm text-muted-foreground">
          Ainda não há sugestões suficientes. Use o app em alguns contextos para
          o sistema observar padrões.
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
                    {suggestion.type === "protected-term"
                      ? `Proteger o termo "${suggestion.payload.term}"`
                      : suggestion.type === "format-style"
                        ? `Definir estilo padrão como "${suggestion.payload.formatStyle}"`
                        : `Definir viés de idioma como "${suggestion.payload.languageBias}"`}
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {suggestion.reason}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    size="sm"
                    className="h-9 rounded-lg px-4"
                    onClick={() => onApplyAdaptiveSuggestion(suggestion)}
                    disabled={
                      adaptiveSuggestionsBusyId === suggestion.id ||
                      settingsSaving
                    }
                  >
                    Aplicar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-9 rounded-lg px-4"
                    onClick={() => onDismissAdaptiveSuggestion(suggestion)}
                    disabled={
                      adaptiveSuggestionsBusyId === suggestion.id ||
                      settingsSaving
                    }
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
  );
}

export function ComprehensionSection({
  extraPhrasesText,
  hasDesktopApi,
  onSaveComprehensionSettings,
  onSetExtraPhrasesText,
  settingsSaving,
}: ComprehensionSectionProps) {
  return (
    <section className="space-y-3 rounded-[24px] border border-border/40 bg-muted/10 p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <label className={fieldLabelClass}>Lista de contexto do Azure</label>
          <div className="text-xs text-muted-foreground">
            Adicione nomes, siglas e termos importantes para melhorar o
            reconhecimento.
          </div>
        </div>
        <Button
          className="h-10 rounded-xl px-6"
          onClick={onSaveComprehensionSettings}
          disabled={!hasDesktopApi || settingsSaving}
        >
          {settingsSaving ? "Salvando..." : "Salvar preferências"}
        </Button>
      </div>
      <textarea
        className="custom-scrollbar min-h-[120px] w-full resize-y rounded-xl border border-border/50 bg-background p-4 font-mono text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
        placeholder={"Exemplo:\nWhatsApp\nSupabase\nReunião de produto"}
        value={extraPhrasesText}
        onChange={(event) => onSetExtraPhrasesText(event.target.value)}
        disabled={!hasDesktopApi || settingsSaving}
        spellCheck={false}
      />
    </section>
  );
}
