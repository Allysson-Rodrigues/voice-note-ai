import type { AppSettings } from "./settings-store.js";

export function canUseHistoryPhraseBoost(
  settings: Pick<AppSettings, "historyEnabled" | "privacyMode">,
) {
  return settings.historyEnabled && !settings.privacyMode;
}

export function canPersistAdaptiveLearning(
  settings: Pick<
    AppSettings,
    "historyEnabled" | "privacyMode" | "adaptiveLearningEnabled"
  >,
) {
  return canUseHistoryPhraseBoost(settings) && settings.adaptiveLearningEnabled;
}
