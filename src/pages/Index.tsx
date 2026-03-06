import CaptureTab from '@/components/index/CaptureTab';
import type { ActiveTab, ExtendedStatus } from '@/components/index/types';
import { clampHistoryRetentionDays, statusDotClass } from '@/components/index/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import WindowTitleBar from '@/components/WindowTitleBar';
import { useToast } from '@/hooks/use-toast';
import { useAppSettings } from '@/hooks/useAppSettings';
import { useDictionary } from '@/hooks/useDictionary';
import { useHistory } from '@/hooks/useHistory';
import { useVoiceSession } from '@/hooks/useVoiceSession';
import {
  BookOpen,
  History,
  Mic,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Sun,
} from 'lucide-react';
import { Suspense, lazy, useEffect, useState } from 'react';

const DictionaryTab = lazy(() => import('@/components/index/DictionaryTab'));
const HistoryTab = lazy(() => import('@/components/index/HistoryTab'));
const SettingsTab = lazy(() => import('@/components/index/SettingsTab'));

const STATUS_LABELS: Record<ExtendedStatus, string> = {
  idle: 'Pronto',
  listening: 'Ouvindo',
  finalizing: 'Finalizando',
  injecting: 'Inserindo',
  success: 'Concluído',
  error: 'Atenção',
};

function tabFallback(label: string) {
  return (
    <div className="rounded-2xl border border-border/40 bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
      {label}
    </div>
  );
}

const Index = () => {
  const { toast } = useToast();
  const hasDesktopApi = typeof window !== 'undefined' && Boolean(window.voiceNoteAI);

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof document !== 'undefined') {
      return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
    }
    return 'dark';
  });
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(true);
  const [activeTab, setActiveTab] = useState<ActiveTab>('capture');

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const history = useHistory({
    activeTab,
    hasDesktopApi,
    toast,
  });
  const voiceSession = useVoiceSession({
    activeTab,
    hasDesktopApi,
    toast,
  });
  const appSettings = useAppSettings({
    hasDesktopApi,
    toast,
    onHealthCheck: voiceSession.runHealthCheck,
    onHistoryRefresh: history.refreshHistory,
  });
  const dictionary = useDictionary({
    activeTab,
    hasDesktopApi,
    toast,
  });

  const headerStatus: ExtendedStatus = voiceSession.error
    ? 'error'
    : voiceSession.status === 'idle'
      ? 'idle'
      : voiceSession.status;

  return (
    <div
      className={`h-screen w-screen overflow-hidden text-foreground transition-colors duration-300 ${
        theme === 'dark' ? 'bg-[#0b0d10]' : 'bg-[#f6f3ec]'
      }`}
    >
      <div className="workspace-shell relative flex h-full w-full overflow-hidden bg-transparent">
        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as ActiveTab)}
          className="flex h-full w-full"
        >
          <aside
            className={`relative z-10 flex flex-col gap-6 border-r border-border/10 bg-transparent py-6 transition-all duration-300 ease-in-out ${
              isSidebarExpanded ? 'w-[252px] px-4' : 'w-[84px] px-2'
            }`}
          >
            <div
              className={`flex w-full items-center gap-3 titlebar-drag ${
                isSidebarExpanded ? 'px-2' : 'justify-center'
              }`}
            >
              <div className="flex h-11 w-11 shrink-0 select-none items-center justify-center overflow-hidden rounded-2xl bg-black shadow-sm ring-1 ring-black/5 dark:bg-white/10 dark:ring-white/10">
                <img
                  src="./favicon.png"
                  alt="Logotipo do Vox Type"
                  className="h-full w-full object-cover"
                />
              </div>
              {isSidebarExpanded ? (
                <div className="titlebar-drag flex flex-col overflow-hidden whitespace-nowrap">
                  <span className="text-base font-bold tracking-tight text-foreground">
                    Vox Type
                  </span>
                  <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Versão beta
                  </span>
                </div>
              ) : null}
            </div>

            <TabsList className="titlebar-no-drag mt-4 flex h-auto w-full flex-col justify-start gap-2 bg-transparent p-0">
              <TabsTrigger
                value="capture"
                title="Captura"
                className={`group relative flex h-10 w-full items-center rounded-xl border border-transparent bg-transparent text-muted-foreground transition-all duration-200 hover:bg-black/5 hover:text-foreground dark:hover:bg-white/5 data-[state=active]:border-border/50 data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm ${
                  isSidebarExpanded ? 'justify-start gap-3 px-3' : 'justify-center px-0'
                }`}
              >
                <Mic
                  className={`h-4 w-4 shrink-0 ${!isSidebarExpanded ? 'group-hover:scale-110' : ''}`}
                />
                {isSidebarExpanded ? <span className="text-sm font-medium">Captura</span> : null}
              </TabsTrigger>

              <TabsTrigger
                value="dictionary"
                title="Vocabulário"
                className={`group relative flex h-10 w-full items-center rounded-xl border border-transparent bg-transparent text-muted-foreground transition-all duration-200 hover:bg-black/5 hover:text-foreground dark:hover:bg-white/5 data-[state=active]:border-border/50 data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm ${
                  isSidebarExpanded ? 'justify-start gap-3 px-3' : 'justify-center px-0'
                }`}
              >
                <BookOpen
                  className={`h-4 w-4 shrink-0 ${!isSidebarExpanded ? 'group-hover:scale-110' : ''}`}
                />
                {isSidebarExpanded ? (
                  <span className="text-sm font-medium">Vocabulário</span>
                ) : null}
              </TabsTrigger>

              <TabsTrigger
                value="history"
                title="Histórico"
                className={`group relative flex h-10 w-full items-center rounded-xl border border-transparent bg-transparent text-muted-foreground transition-all duration-200 hover:bg-black/5 hover:text-foreground dark:hover:bg-white/5 data-[state=active]:border-border/50 data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm ${
                  isSidebarExpanded ? 'justify-start gap-3 px-3' : 'justify-center px-0'
                }`}
              >
                <History
                  className={`h-4 w-4 shrink-0 ${!isSidebarExpanded ? 'group-hover:scale-110' : ''}`}
                />
                {isSidebarExpanded ? <span className="text-sm font-medium">Histórico</span> : null}
              </TabsTrigger>

              <TabsTrigger
                value="settings"
                title="Configurações"
                className={`group relative mt-4 flex h-10 w-full items-center rounded-xl border border-transparent bg-transparent text-muted-foreground transition-all duration-200 hover:bg-black/5 hover:text-foreground dark:hover:bg-white/5 data-[state=active]:border-border/50 data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm ${
                  isSidebarExpanded ? 'justify-start gap-3 px-3' : 'justify-center px-0'
                }`}
              >
                <Settings
                  className={`h-4 w-4 shrink-0 ${!isSidebarExpanded ? 'group-hover:scale-110' : ''}`}
                />
                {isSidebarExpanded ? (
                  <span className="text-sm font-medium">Configurações</span>
                ) : null}
              </TabsTrigger>
            </TabsList>

            <div className="titlebar-no-drag mt-auto flex w-full flex-col gap-2">
              <button
                onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
                title="Alternar tema"
                className={`flex h-10 items-center rounded-xl text-muted-foreground transition-all hover:bg-black/5 hover:text-foreground dark:hover:bg-white/5 ${
                  isSidebarExpanded ? 'justify-start gap-3 px-3' : 'justify-center'
                }`}
              >
                {theme === 'dark' ? (
                  <Sun className="h-4 w-4 shrink-0" />
                ) : (
                  <Moon className="h-4 w-4 shrink-0" />
                )}
                {isSidebarExpanded ? (
                  <span className="text-sm font-medium">Alternar tema</span>
                ) : null}
              </button>

              <button
                onClick={() => setIsSidebarExpanded((current) => !current)}
                title={isSidebarExpanded ? 'Recolher menu' : 'Expandir menu'}
                className={`flex h-10 items-center rounded-xl text-muted-foreground transition-all hover:bg-black/5 hover:text-foreground dark:hover:bg-white/5 ${
                  isSidebarExpanded ? 'justify-start gap-3 px-3' : 'justify-center'
                }`}
              >
                {isSidebarExpanded ? (
                  <PanelLeftClose className="h-4 w-4 shrink-0" />
                ) : (
                  <PanelLeftOpen className="h-4 w-4 shrink-0" />
                )}
                {isSidebarExpanded ? (
                  <span className="text-sm font-medium">Recolher menu</span>
                ) : null}
              </button>
            </div>
          </aside>

          <div className="relative flex min-w-0 flex-1 flex-col py-2 pr-2">
            <div className="pointer-events-none absolute inset-0 opacity-[0.03] dark:opacity-[0.15] bg-[radial-gradient(circle_at_50%_0%,_currentColor,_transparent_70%)]" />

            <div className="relative z-10 flex flex-1 flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
              <header className="titlebar-drag relative z-10 flex flex-wrap items-center justify-between gap-4 border-b border-border/40 bg-card/70 px-8 py-4 backdrop-blur-md">
                <div className="min-w-0 titlebar-no-drag">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    Central de ditado
                  </p>
                  <div className="mt-1 flex items-center gap-3">
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                      Capture, revise e insira
                    </h1>
                  </div>
                  <p className="mt-2 max-w-xl text-sm text-muted-foreground">
                    O fluxo principal fica em Captura; vocabulário, privacidade e histórico ficam ao
                    lado quando você precisar ajustar.
                  </p>
                </div>

                <div className="titlebar-no-drag flex items-center gap-3">
                  <div className="group relative flex cursor-default items-center gap-3 rounded-full border border-border/50 bg-background px-4 py-2 shadow-sm">
                    <span
                      className={`relative h-2 w-2 rounded-full ${statusDotClass(headerStatus)}`}
                      aria-hidden
                    />
                    <span className="text-xs font-semibold uppercase tracking-wide text-foreground">
                      {STATUS_LABELS[headerStatus]}
                    </span>
                  </div>
                  <WindowTitleBar />
                </div>
              </header>

              <main className="titlebar-no-drag relative z-10 min-h-0 flex-1 overflow-y-auto px-8 py-6 custom-scrollbar">
                {!hasDesktopApi ? (
                  <div className="mb-6 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                    Você está executando a interface web. A API desktop{' '}
                    <span className="rounded bg-black/20 px-1 font-mono dark:bg-white/20">
                      window.voiceNoteAI
                    </span>{' '}
                    não está disponível.
                  </div>
                ) : null}

                {hasDesktopApi && voiceSession.runtimeInfo.captureBlockedReason ? (
                  <div className="mb-6 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                    {voiceSession.runtimeInfo.captureBlockedReason}
                  </div>
                ) : null}

                <TabsContent
                  value="capture"
                  className="mt-0 animate-in fade-in slide-in-from-bottom-4 duration-500 outline-none"
                >
                  <CaptureTab
                    autoPasteEnabled={appSettings.autoPasteEnabled}
                    canControl={voiceSession.canControl}
                    canStop={voiceSession.canStop}
                    error={voiceSession.error}
                    finalText={voiceSession.finalText}
                    hasDesktopApi={hasDesktopApi}
                    healthItems={voiceSession.healthItems}
                    healthLoading={voiceSession.healthLoading}
                    hotkeyLabel={voiceSession.hotkeyLabel}
                    onGoToSettings={() => setActiveTab('settings')}
                    onManualStart={() => void voiceSession.manualStart()}
                    onManualStop={() => void voiceSession.manualStop()}
                    onRetryHoldHook={() => void voiceSession.retryHoldHook()}
                    onRunHealthCheck={() => void voiceSession.runHealthCheck()}
                    onToggleAutoPaste={() => void appSettings.toggleAutoPaste()}
                    partial={voiceSession.partial}
                    status={voiceSession.status}
                  />
                </TabsContent>

                <TabsContent
                  value="dictionary"
                  className="mt-0 animate-in fade-in slide-in-from-bottom-4 duration-500 outline-none"
                >
                  {activeTab === 'dictionary' ? (
                    <Suspense fallback={tabFallback('Carregando vocabulário...')}>
                      <DictionaryTab
                        canonicalTerms={dictionary.canonicalTerms}
                        dictionary={dictionary.dictionary}
                        dictionaryAvailable={dictionary.dictionaryAvailable}
                        dictionaryBusy={dictionary.dictionaryBusy}
                        hasDesktopApi={hasDesktopApi}
                        newCanonicalFrom={dictionary.newCanonicalFrom}
                        newCanonicalTo={dictionary.newCanonicalTo}
                        newHintPt={dictionary.newHintPt}
                        newTerm={dictionary.newTerm}
                        onAddCanonicalTerm={() => void dictionary.addCanonicalTerm()}
                        onAddDictionaryTerm={() => void dictionary.addDictionaryTerm()}
                        onDictionaryReload={() => void dictionary.loadDictionaryData()}
                        onRemoveCanonicalTerm={(index) =>
                          void dictionary.removeCanonicalTerm(index)
                        }
                        onRemoveDictionaryTerm={(id) => void dictionary.removeDictionaryTerm(id)}
                        onSetNewCanonicalFrom={dictionary.setNewCanonicalFrom}
                        onSetNewCanonicalTo={dictionary.setNewCanonicalTo}
                        onSetNewHintPt={dictionary.setNewHintPt}
                        onSetNewTerm={dictionary.setNewTerm}
                        onToggleCanonicalTerm={(index, enabled) =>
                          void dictionary.toggleCanonicalTerm(index, enabled)
                        }
                        onToggleTermEnabled={(item, enabled) =>
                          void dictionary.toggleTermEnabled(item, enabled)
                        }
                      />
                    </Suspense>
                  ) : null}
                </TabsContent>

                <TabsContent
                  value="history"
                  className="mt-0 animate-in fade-in slide-in-from-bottom-4 duration-500 outline-none"
                >
                  {activeTab === 'history' ? (
                    <Suspense fallback={tabFallback('Carregando histórico...')}>
                      <HistoryTab
                        hasDesktopApi={hasDesktopApi}
                        historyBusy={history.historyBusy}
                        historyEntries={history.historyEntries}
                        historyLoading={history.historyLoading}
                        historyQuery={history.historyQuery}
                        onClearHistory={() => void history.clearHistory()}
                        onCopyHistoryEntry={(entry) => void history.copyHistoryEntry(entry)}
                        onRefreshHistory={() => void history.refreshHistory()}
                        onRemoveHistoryEntry={(id) => void history.removeHistoryEntry(id)}
                        onSetHistoryQuery={history.setHistoryQuery}
                      />
                    </Suspense>
                  ) : null}
                </TabsContent>

                <TabsContent
                  value="settings"
                  className="mt-0 animate-in fade-in slide-in-from-bottom-4 duration-500 outline-none"
                >
                  {activeTab === 'settings' ? (
                    <Suspense fallback={tabFallback('Carregando configurações...')}>
                      <SettingsTab
                        extraPhrasesText={appSettings.extraPhrasesText}
                        formatCommandsEnabled={appSettings.formatCommandsEnabled}
                        hasDesktopApi={hasDesktopApi}
                        historyEnabled={appSettings.historyEnabled}
                        historyRetentionDays={appSettings.historyRetentionDays}
                        historyStorageMode={appSettings.historyStorageMode}
                        languageMode={appSettings.languageMode}
                        latencyProfile={appSettings.latencyProfile}
                        micDeviceId={voiceSession.micDeviceId}
                        micDevices={voiceSession.micDevices}
                        micInputGain={voiceSession.micInputGain}
                        onChangeLatencyProfile={appSettings.setLatencyProfile}
                        onChangeToneMode={appSettings.setToneMode}
                        onSaveComprehensionSettings={() => void appSettings.saveSettings()}
                        onSetExtraPhrasesText={appSettings.setExtraPhrasesText}
                        onSetFormatCommandsEnabled={appSettings.setFormatCommandsEnabled}
                        onSetHistoryEnabled={appSettings.setHistoryEnabled}
                        onSetHistoryRetentionDays={(value) =>
                          appSettings.setHistoryRetentionDays(clampHistoryRetentionDays(value))
                        }
                        onSetHistoryStorageMode={appSettings.setHistoryStorageMode}
                        onSetInputGain={voiceSession.setMicInputGain}
                        onSetLanguageMode={appSettings.setLanguageMode}
                        onSetMicDeviceId={voiceSession.setMicDeviceId}
                        onSetPrivacyMode={appSettings.setPrivacyMode}
                        privacyMode={appSettings.privacyMode}
                        settingsSaving={appSettings.settingsSaving}
                        toneMode={appSettings.toneMode}
                      />
                    </Suspense>
                  ) : null}
                </TabsContent>
              </main>
            </div>
          </div>
        </Tabs>
      </div>
    </div>
  );
};

export default Index;
