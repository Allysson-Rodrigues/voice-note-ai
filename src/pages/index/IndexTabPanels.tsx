import CaptureTab from "@/components/index/CaptureTab";
import type { ActiveTab } from "@/components/index/types";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import type { useIndexViewModel } from "./useIndexViewModel";
import { Suspense, lazy } from "react";

const DictionaryTab = lazy(() => import("@/components/index/DictionaryTab"));
const HistoryTab = lazy(() => import("@/components/index/HistoryTab"));
const SettingsTab = lazy(() => import("@/components/index/SettingsTab"));

type IndexViewModel = ReturnType<typeof useIndexViewModel>;

type IndexTabPanelsProps = {
  activeTab: ActiveTab;
  hasDesktopApi: boolean;
  onSetActiveTab: (tab: ActiveTab) => void;
  theme: "light" | "dark" | "system";
  onSetTheme: (theme: "light" | "dark" | "system") => void;
  vm: IndexViewModel;
};

function tabFallback(label: string) {
  return (
    <div className="rounded-2xl border border-border/40 bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
      {label}
    </div>
  );
}

export default function IndexTabPanels({
  activeTab,
  hasDesktopApi,
  onSetActiveTab,
  theme,
  onSetTheme,
  vm,
}: IndexTabPanelsProps) {
  return (
    <Tabs value={activeTab} className="flex h-full min-h-0 flex-col">
      <TabsContent
        value="capture"
        className="custom-scrollbar mt-0 h-full min-h-0 overflow-y-auto pr-2 animate-in fade-in slide-in-from-bottom-4 duration-500 outline-none"
      >
        <CaptureTab
          autoPasteEnabled={vm.appSettings.autoPasteEnabled}
          canControl={vm.voiceSession.canControl}
          canStop={vm.voiceSession.canStop}
          runtimeInfo={vm.voiceSession.runtimeInfo}
          error={vm.voiceSession.error}
          finalText={vm.voiceSession.finalText}
          hasDesktopApi={hasDesktopApi}
          healthItems={vm.voiceSession.healthItems}
          healthLoading={vm.voiceSession.healthLoading}
          hotkeyLabel={vm.voiceSession.hotkeyLabel}
          onGoToSettings={() => onSetActiveTab("settings")}
          onManualStart={() => void vm.voiceSession.manualStart()}
          onManualStop={() => void vm.voiceSession.manualStop()}
          onRetryHoldHook={() => void vm.voiceSession.retryHoldHook()}
          onRunHealthCheck={() => void vm.voiceSession.runHealthCheck()}
          onToggleAutoPaste={() => void vm.appSettings.toggleAutoPaste()}
          partial={vm.voiceSession.partial}
          status={vm.voiceSession.status}
        />
      </TabsContent>

      <TabsContent
        value="dictionary"
        className="custom-scrollbar mt-0 h-full min-h-0 overflow-y-auto pr-2 animate-in fade-in slide-in-from-bottom-4 duration-500 outline-none"
      >
        <Suspense fallback={tabFallback("Dicionário")}>
          <DictionaryTab
            canonicalTerms={vm.dictionary.canonicalTerms}
            dictionary={vm.dictionary.dictionary}
            dictionaryAvailable={vm.dictionary.dictionaryAvailable}
            dictionaryBusy={vm.dictionary.dictionaryBusy}
            hasDesktopApi={hasDesktopApi}
            newCanonicalFrom={vm.dictionary.newCanonicalFrom}
            newCanonicalTo={vm.dictionary.newCanonicalTo}
            newHintPt={vm.dictionary.newHintPt}
            newTerm={vm.dictionary.newTerm}
            onAddCanonicalTerm={() => void vm.dictionary.addCanonicalTerm()}
            onAddDictionaryTerm={() => void vm.dictionary.addDictionaryTerm()}
            onDictionaryReload={() => void vm.dictionary.loadDictionaryData()}
            onRemoveCanonicalTerm={(index) =>
              void vm.dictionary.removeCanonicalTerm(index)
            }
            onRemoveDictionaryTerm={(id) =>
              void vm.dictionary.removeDictionaryTerm(id)
            }
            onSetNewCanonicalFrom={vm.dictionary.setNewCanonicalFrom}
            onSetNewCanonicalTo={vm.dictionary.setNewCanonicalTo}
            onSetNewHintPt={vm.dictionary.setNewHintPt}
            onSetNewTerm={vm.dictionary.setNewTerm}
            onToggleCanonicalTerm={(index, enabled) =>
              void vm.dictionary.toggleCanonicalTerm(index, enabled)
            }
            onToggleTermEnabled={(item, enabled) =>
              void vm.dictionary.toggleTermEnabled(item, enabled)
            }
          />
        </Suspense>
      </TabsContent>

      <TabsContent
        value="history"
        className="custom-scrollbar mt-0 h-full min-h-0 overflow-y-auto pr-2 animate-in fade-in slide-in-from-bottom-4 duration-500 outline-none"
      >
        <Suspense fallback={tabFallback("Histórico")}>
          <HistoryTab
            hasDesktopApi={hasDesktopApi}
            historyBusy={vm.history.historyBusy}
            historyEntries={vm.history.historyEntries}
            historyLoading={vm.history.historyLoading}
            historyQuery={vm.history.historyQuery}
            onClearHistory={() => void vm.history.clearHistory()}
            onCopyHistoryEntry={(entry) =>
              void vm.history.copyHistoryEntry(entry)
            }
            onRefreshHistory={() => void vm.history.refreshHistory()}
            onRemoveHistoryEntry={(id) =>
              void vm.history.removeHistoryEntry(id)
            }
            onSetHistoryQuery={vm.history.setHistoryQuery}
          />
        </Suspense>
      </TabsContent>

      <TabsContent
        value="settings"
        className="custom-scrollbar mt-0 h-full min-h-0 overflow-y-auto pr-2 animate-in fade-in slide-in-from-bottom-4 duration-500 outline-none"
      >
        <Suspense fallback={tabFallback("Configurações")}>
          <SettingsTab
            theme={theme}
            onSetTheme={onSetTheme}
            appProfilesText={vm.appSettings.appProfilesText}
            azureBusy={vm.appSettings.azureBusy}
            azureCredentialStatus={vm.appSettings.azureCredentialStatus}
            azureKey={vm.appSettings.azureKey}
            azureRegion={vm.appSettings.azureRegion}
            extraPhrasesText={vm.appSettings.extraPhrasesText}
            adaptiveLearningEnabled={vm.appSettings.adaptiveLearningEnabled}
            adaptiveSuggestions={vm.adaptive.suggestions}
            adaptiveSuggestionsBusyId={vm.adaptive.busyId}
            adaptiveSuggestionsLoading={vm.adaptive.loading}
            captureBlockedReason={
              vm.voiceSession.runtimeInfo.captureBlockedReason
            }
            dualLanguageStrategy={vm.appSettings.dualLanguageStrategy}
            formatCommandsEnabled={vm.appSettings.formatCommandsEnabled}
            hasDesktopApi={hasDesktopApi}
            healthItems={vm.voiceSession.healthItems}
            historyEnabled={vm.appSettings.historyEnabled}
            historyRetentionDays={vm.appSettings.historyRetentionDays}
            historyStorageMode={vm.appSettings.historyStorageMode}
            hotkeyFallback={vm.appSettings.hotkeyFallback}
            hotkeyPrimary={vm.appSettings.hotkeyPrimary}
            languageMode={vm.appSettings.languageMode}
            latencyProfile={vm.appSettings.latencyProfile}
            maxSessionSeconds={vm.appSettings.maxSessionSeconds}
            micDeviceId={vm.voiceSession.micDeviceId}
            micDevices={vm.voiceSession.micDevices}
            micInputGain={vm.voiceSession.micInputGain}
            onClearAzureCredentials={() =>
              void vm.appSettings.clearAzureCredentials()
            }
            onChangeLatencyProfile={vm.appSettings.setLatencyProfile}
            onChangeToneMode={vm.appSettings.setToneMode}
            onSaveAzureCredentials={() =>
              void vm.appSettings.saveAzureCredentials()
            }
            onSaveComprehensionSettings={() =>
              void vm.appSettings.saveSettings()
            }
            onSetAppProfilesText={vm.appSettings.setAppProfilesText}
            onSetAzureKey={vm.appSettings.setAzureKey}
            onSetAzureRegion={vm.appSettings.setAzureRegion}
            onSetDualLanguageStrategy={vm.appSettings.setDualLanguageStrategy}
            onSetExtraPhrasesText={vm.appSettings.setExtraPhrasesText}
            onSetFormatCommandsEnabled={vm.appSettings.setFormatCommandsEnabled}
            onSetHistoryEnabled={vm.appSettings.setHistoryEnabled}
            onSetHistoryRetentionDays={vm.appSettings.setHistoryRetentionDays}
            onSetHistoryStorageMode={vm.appSettings.setHistoryStorageMode}
            onSetAdaptiveLearningEnabled={
              vm.appSettings.setAdaptiveLearningEnabled
            }
            onSetHotkeyFallback={vm.appSettings.setHotkeyFallback}
            onSetHotkeyPrimary={vm.appSettings.setHotkeyPrimary}
            onSetInputGain={vm.voiceSession.setMicInputGain}
            onSetIntentDetectionEnabled={
              vm.appSettings.setIntentDetectionEnabled
            }
            onSetLanguageMode={vm.appSettings.setLanguageMode}
            onSetLowConfidencePolicy={vm.appSettings.setLowConfidencePolicy}
            onSetMaxSessionSeconds={vm.appSettings.setMaxSessionSeconds}
            onSetMicDeviceId={vm.voiceSession.setMicDeviceId}
            onSetPostprocessProfile={vm.appSettings.setPostprocessProfile}
            onSetPrivacyMode={vm.appSettings.setPrivacyMode}
            onSetProtectedTermsText={vm.appSettings.setProtectedTermsText}
            onSetRewriteEnabled={vm.appSettings.setRewriteEnabled}
            onSetRewriteMode={vm.appSettings.setRewriteMode}
            onTestAzureCredentials={() =>
              void vm.appSettings.testAzureCredentials()
            }
            onApplyAdaptiveSuggestion={(suggestion) =>
              void vm.adaptive.applySuggestion(suggestion)
            }
            onDismissAdaptiveSuggestion={(suggestion) =>
              void vm.adaptive.dismissSuggestion(suggestion)
            }
            onRefreshAdaptiveSuggestions={() => void vm.adaptive.refresh()}
            protectedTermsText={vm.appSettings.protectedTermsText}
            privacyMode={vm.appSettings.privacyMode}
            intentDetectionEnabled={vm.appSettings.intentDetectionEnabled}
            lowConfidencePolicy={vm.appSettings.lowConfidencePolicy}
            postprocessProfile={vm.appSettings.postprocessProfile}
            rewriteEnabled={vm.appSettings.rewriteEnabled}
            rewriteMode={vm.appSettings.rewriteMode}
            settingsSaving={vm.appSettings.settingsSaving}
            toneMode={vm.appSettings.toneMode}
          />
        </Suspense>
      </TabsContent>
    </Tabs>
  );
}
