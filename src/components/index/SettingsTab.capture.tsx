import { Switch } from "@/components/ui/switch";
import type { UiHealthItem } from "./types";
import {
  fieldLabelClass,
  inputClass,
  sectionClass,
  sectionHeaderClass,
  selectClass,
  surfaceClass,
  textareaClass,
} from "./SettingsTab.shared";
import type { SettingsTabProps } from "./SettingsTab.types";

type CaptureInputSectionProps = Pick<
  SettingsTabProps,
  | "hasDesktopApi"
  | "hotkeyFallback"
  | "hotkeyPrimary"
  | "maxSessionSeconds"
  | "micDeviceId"
  | "micDevices"
  | "micInputGain"
  | "onSetHotkeyFallback"
  | "onSetHotkeyPrimary"
  | "onSetInputGain"
  | "onSetMaxSessionSeconds"
  | "onSetMicDeviceId"
  | "settingsSaving"
> & {
  hookHealth?: UiHealthItem;
  microphoneHealth?: UiHealthItem;
  injectionHealth?: UiHealthItem;
};

type TextResponseSectionProps = Pick<
  SettingsTabProps,
  | "appProfilesText"
  | "dualLanguageStrategy"
  | "formatCommandsEnabled"
  | "hasDesktopApi"
  | "languageMode"
  | "latencyProfile"
  | "onChangeLatencyProfile"
  | "onChangeToneMode"
  | "onSetAppProfilesText"
  | "onSetDualLanguageStrategy"
  | "onSetFormatCommandsEnabled"
  | "onSetLanguageMode"
  | "onSetPostprocessProfile"
  | "postprocessProfile"
  | "settingsSaving"
  | "toneMode"
>;

export function CaptureInputSection({
  hasDesktopApi,
  hotkeyFallback,
  hotkeyPrimary,
  maxSessionSeconds,
  micDeviceId,
  micDevices,
  micInputGain,
  onSetHotkeyFallback,
  onSetHotkeyPrimary,
  onSetInputGain,
  onSetMaxSessionSeconds,
  onSetMicDeviceId,
  settingsSaving,
  hookHealth,
  microphoneHealth,
  injectionHealth,
}: CaptureInputSectionProps) {
  return (
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
              {hookHealth?.status === "ok"
                ? "Pronto"
                : hookHealth?.status === "warn"
                  ? "Parcial"
                  : "Indisponível"}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {hookHealth?.message ?? "Diagnóstico ainda não executado."}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              Microfone
            </div>
            <div className="mt-2 text-sm font-medium text-foreground">
              {microphoneHealth?.status === "ok"
                ? "Detectado"
                : microphoneHealth?.status === "warn"
                  ? "Revisar"
                  : "Falha"}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {microphoneHealth?.message ?? "Diagnóstico ainda não executado."}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              Inserção automática
            </div>
            <div className="mt-2 text-sm font-medium text-foreground">
              {injectionHealth?.status === "ok"
                ? "Saudável"
                : injectionHealth?.status === "warn"
                  ? "Dependente do contexto"
                  : "Falha"}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {injectionHealth?.message ??
                "Ainda não há telemetria suficiente."}
            </div>
          </div>
        </div>
      </div>
      <div className="space-y-3">
        <label className={fieldLabelClass}>Microfone preferido</label>
        <select
          className={selectClass}
          value={micDeviceId}
          onChange={(event) => onSetMicDeviceId(event.target.value)}
          disabled={!hasDesktopApi || settingsSaving}
        >
          <option value="" className="bg-background text-foreground">
            Padrão do sistema
          </option>
          {micDevices.map((device) => (
            <option
              key={device.deviceId}
              value={device.deviceId}
              className="bg-background text-foreground"
            >
              {device.label}
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
            onChange={(event) => onSetInputGain(Number(event.target.value))}
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
              onChange={(event) => onSetHotkeyPrimary(event.target.value)}
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
              onChange={(event) => onSetHotkeyFallback(event.target.value)}
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
              onChange={(event) =>
                onSetMaxSessionSeconds(Number(event.target.value))
              }
              disabled={!hasDesktopApi || settingsSaving}
            />
            <p className="text-xs text-muted-foreground">
              Watchdog automático para encerrar capturas longas demais.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

export function TextResponseSection({
  appProfilesText,
  dualLanguageStrategy,
  formatCommandsEnabled,
  hasDesktopApi,
  languageMode,
  latencyProfile,
  onChangeLatencyProfile,
  onChangeToneMode,
  onSetAppProfilesText,
  onSetDualLanguageStrategy,
  onSetFormatCommandsEnabled,
  onSetLanguageMode,
  onSetPostprocessProfile,
  postprocessProfile,
  settingsSaving,
  toneMode,
}: TextResponseSectionProps) {
  return (
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
          onChange={(event) =>
            onChangeLatencyProfile(
              event.target.value as SettingsTabProps["latencyProfile"],
            )
          }
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
          onChange={(event) =>
            onChangeToneMode(event.target.value as SettingsTabProps["toneMode"])
          }
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
          onChange={(event) =>
            onSetLanguageMode(
              event.target.value as SettingsTabProps["languageMode"],
            )
          }
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
          onChange={(event) =>
            onSetPostprocessProfile(
              event.target.value as SettingsTabProps["postprocessProfile"],
            )
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
          onChange={(event) =>
            onSetDualLanguageStrategy(
              event.target.value as SettingsTabProps["dualLanguageStrategy"],
            )
          }
          disabled={!hasDesktopApi || settingsSaving}
        >
          <option
            value="fallback-on-low-confidence"
            className="bg-background text-foreground"
          >
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
            JSON opcional para viés de idioma, domínio, frases extras, método de
            injeção e perfil de pós-processamento por app.
          </span>
        </div>
        <textarea
          className={`${textareaClass} mt-4 font-mono text-[13px]`}
          value={appProfilesText}
          onChange={(event) => onSetAppProfilesText(event.target.value)}
          disabled={!hasDesktopApi || settingsSaving}
          spellCheck={false}
          placeholder={`{\n  "slack.exe": {\n    "languageBias": "pt-BR",\n    "domain": "work",\n    "postprocessProfile": "balanced"\n  }\n}`}
        />
      </div>
    </section>
  );
}
