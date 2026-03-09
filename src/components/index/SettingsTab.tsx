import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { memo } from "react";
import {
  AdaptiveSuggestionsSection,
  ComprehensionSection,
  PrivacyRetentionSection,
  TranscriptIntelligenceSection,
} from "./SettingsTab.advanced";
import {
  CaptureInputSection,
  TextResponseSection,
} from "./SettingsTab.capture";
import {
  AppearanceSection,
  AzureSecuritySection,
  CaptureBlockedNotice,
  SettingsSummaryStrip,
} from "./SettingsTab.overview";
import { findHealthItem, getAzureCredentialLabels } from "./SettingsTab.shared";
import type { SettingsTabProps } from "./SettingsTab.types";

const SettingsTab = memo(function SettingsTab(props: SettingsTabProps) {
  const hookHealth = findHealthItem(props.healthItems, "hook");
  const sttHealth = findHealthItem(props.healthItems, "stt");
  const networkHealth = findHealthItem(props.healthItems, "network");
  const injectionHealth = findHealthItem(props.healthItems, "injection");
  const microphoneHealth = findHealthItem(props.healthItems, "microphone");
  const azureLabels = getAzureCredentialLabels(props.azureCredentialStatus);

  return (
    <Card className="card-warm mb-6 overflow-hidden border-border shadow-sm">
      <CardHeader className="border-b border-border/40 bg-background/50 pb-5">
        <CardTitle className="text-lg font-medium text-foreground">
          Preferências do aplicativo
        </CardTitle>
        <CardDescription>
          Organize o ditado por blocos: captura, escrita, privacidade e
          reconhecimento.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-8 pt-6">
        <SettingsSummaryStrip
          theme={props.theme}
          languageMode={props.languageMode}
          privacyMode={props.privacyMode}
          historyEnabled={props.historyEnabled}
          historyRetentionDays={props.historyRetentionDays}
        />

        <CaptureBlockedNotice
          captureBlockedReason={props.captureBlockedReason}
        />

        <AzureSecuritySection
          azureBusy={props.azureBusy}
          azureCredentialStatus={props.azureCredentialStatus}
          azureKey={props.azureKey}
          azureRegion={props.azureRegion}
          hasDesktopApi={props.hasDesktopApi}
          onClearAzureCredentials={props.onClearAzureCredentials}
          onSaveAzureCredentials={props.onSaveAzureCredentials}
          onSetAzureKey={props.onSetAzureKey}
          onSetAzureRegion={props.onSetAzureRegion}
          onTestAzureCredentials={props.onTestAzureCredentials}
          sttHealth={sttHealth}
          networkHealth={networkHealth}
          azureSourceLabel={azureLabels.source}
          azureSecurityLabel={azureLabels.security}
        />

        <AppearanceSection
          theme={props.theme}
          onSetTheme={props.onSetTheme}
          hasDesktopApi={props.hasDesktopApi}
          settingsSaving={props.settingsSaving}
        />

        <CaptureInputSection
          hasDesktopApi={props.hasDesktopApi}
          hotkeyFallback={props.hotkeyFallback}
          hotkeyPrimary={props.hotkeyPrimary}
          maxSessionSeconds={props.maxSessionSeconds}
          micDeviceId={props.micDeviceId}
          micDevices={props.micDevices}
          micInputGain={props.micInputGain}
          onSetHotkeyFallback={props.onSetHotkeyFallback}
          onSetHotkeyPrimary={props.onSetHotkeyPrimary}
          onSetInputGain={props.onSetInputGain}
          onSetMaxSessionSeconds={props.onSetMaxSessionSeconds}
          onSetMicDeviceId={props.onSetMicDeviceId}
          settingsSaving={props.settingsSaving}
          hookHealth={hookHealth}
          microphoneHealth={microphoneHealth}
          injectionHealth={injectionHealth}
        />

        <TextResponseSection
          appProfilesText={props.appProfilesText}
          dualLanguageStrategy={props.dualLanguageStrategy}
          formatCommandsEnabled={props.formatCommandsEnabled}
          hasDesktopApi={props.hasDesktopApi}
          languageMode={props.languageMode}
          latencyProfile={props.latencyProfile}
          onChangeLatencyProfile={props.onChangeLatencyProfile}
          onChangeToneMode={props.onChangeToneMode}
          onSetAppProfilesText={props.onSetAppProfilesText}
          onSetDualLanguageStrategy={props.onSetDualLanguageStrategy}
          onSetFormatCommandsEnabled={props.onSetFormatCommandsEnabled}
          onSetLanguageMode={props.onSetLanguageMode}
          onSetPostprocessProfile={props.onSetPostprocessProfile}
          postprocessProfile={props.postprocessProfile}
          settingsSaving={props.settingsSaving}
          toneMode={props.toneMode}
        />

        <PrivacyRetentionSection
          hasDesktopApi={props.hasDesktopApi}
          historyEnabled={props.historyEnabled}
          historyRetentionDays={props.historyRetentionDays}
          historyStorageMode={props.historyStorageMode}
          onSetHistoryEnabled={props.onSetHistoryEnabled}
          onSetHistoryRetentionDays={props.onSetHistoryRetentionDays}
          onSetHistoryStorageMode={props.onSetHistoryStorageMode}
          onSetPrivacyMode={props.onSetPrivacyMode}
          privacyMode={props.privacyMode}
          settingsSaving={props.settingsSaving}
        />

        <TranscriptIntelligenceSection
          adaptiveLearningEnabled={props.adaptiveLearningEnabled}
          hasDesktopApi={props.hasDesktopApi}
          intentDetectionEnabled={props.intentDetectionEnabled}
          lowConfidencePolicy={props.lowConfidencePolicy}
          onSetAdaptiveLearningEnabled={props.onSetAdaptiveLearningEnabled}
          onSetIntentDetectionEnabled={props.onSetIntentDetectionEnabled}
          onSetLowConfidencePolicy={props.onSetLowConfidencePolicy}
          onSetProtectedTermsText={props.onSetProtectedTermsText}
          onSetRewriteEnabled={props.onSetRewriteEnabled}
          onSetRewriteMode={props.onSetRewriteMode}
          protectedTermsText={props.protectedTermsText}
          rewriteEnabled={props.rewriteEnabled}
          rewriteMode={props.rewriteMode}
          settingsSaving={props.settingsSaving}
        />

        <AdaptiveSuggestionsSection
          adaptiveLearningEnabled={props.adaptiveLearningEnabled}
          adaptiveSuggestions={props.adaptiveSuggestions}
          adaptiveSuggestionsBusyId={props.adaptiveSuggestionsBusyId}
          adaptiveSuggestionsLoading={props.adaptiveSuggestionsLoading}
          hasDesktopApi={props.hasDesktopApi}
          onApplyAdaptiveSuggestion={props.onApplyAdaptiveSuggestion}
          onDismissAdaptiveSuggestion={props.onDismissAdaptiveSuggestion}
          onRefreshAdaptiveSuggestions={props.onRefreshAdaptiveSuggestions}
          settingsSaving={props.settingsSaving}
        />

        <ComprehensionSection
          extraPhrasesText={props.extraPhrasesText}
          hasDesktopApi={props.hasDesktopApi}
          onSaveComprehensionSettings={props.onSaveComprehensionSettings}
          onSetExtraPhrasesText={props.onSetExtraPhrasesText}
          settingsSaving={props.settingsSaving}
        />
      </CardContent>
    </Card>
  );
});

export default SettingsTab;
