import type {
  AdaptiveSuggestion,
  AzureCredentialStatus,
  HistoryStorageMode,
} from "@/electron";
import type { LatencyProfile } from "@/lib/latency";
import type {
  AudioDevice,
  LanguageMode,
  ToneMode,
  UiHealthItem,
} from "./types";

export type ThemeMode = "light" | "dark" | "system";
export type DualLanguageStrategy = "parallel" | "fallback-on-low-confidence";
export type LowConfidencePolicy = "paste" | "copy-only" | "review";
export type PostprocessProfile = "safe" | "balanced" | "aggressive";
export type RewriteMode = "off" | "safe" | "aggressive";

export type SettingsTabProps = {
  theme: ThemeMode;
  onSetTheme: (theme: ThemeMode) => void;
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
  dualLanguageStrategy: DualLanguageStrategy;
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
  onSetDualLanguageStrategy: (value: DualLanguageStrategy) => void;
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
  onSetLowConfidencePolicy: (value: LowConfidencePolicy) => void;
  onSetMaxSessionSeconds: (value: number) => void;
  onSetMicDeviceId: (value: string) => void;
  onSetPostprocessProfile: (value: PostprocessProfile) => void;
  onSetPrivacyMode: (value: boolean) => void;
  onSetProtectedTermsText: (value: string) => void;
  onSetRewriteEnabled: (value: boolean) => void;
  onSetRewriteMode: (value: RewriteMode) => void;
  onTestAzureCredentials: () => void;
  onApplyAdaptiveSuggestion: (suggestion: AdaptiveSuggestion) => void;
  onDismissAdaptiveSuggestion: (suggestion: AdaptiveSuggestion) => void;
  onRefreshAdaptiveSuggestions: () => void;
  protectedTermsText: string;
  privacyMode: boolean;
  intentDetectionEnabled: boolean;
  lowConfidencePolicy: LowConfidencePolicy;
  postprocessProfile: PostprocessProfile;
  rewriteEnabled: boolean;
  rewriteMode: RewriteMode;
  settingsSaving: boolean;
  toneMode: ToneMode;
  captureBlockedReason?: string;
};
