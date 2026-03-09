import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Index from '@/pages/Index';

describe('Index smoke', () => {
  it('renders capture shell without eager background fetches', async () => {
    const listDictionary = vi.fn(async () => []);
    const listHistory = vi.fn(async () => []);
    const getHealthCheck = vi.fn(async () => ({
      generatedAt: new Date().toISOString(),
      items: [],
    }));
    const api = {
      windowMinimize: () => {},
      windowMaximize: () => {},
      windowClose: () => {},
      isWindowMaximized: async () => false,
      onMaximizedChange: () => () => {},
      listDictionary,
      exportDictionary: async () => ({ exportedAt: new Date().toISOString(), terms: [] }),
      importDictionary: async () => ({ ok: true, count: 0 }),
      listHistory,
      removeHistoryEntry: async () => ({ ok: true }),
      clearHistory: async () => ({ ok: true, removed: 0 }),
      addDictionaryTerm: async () => ({
        ok: true,
        term: { id: '1', term: 'standup', enabled: true, createdAt: '' },
      }),
      updateDictionaryTerm: async () => ({
        ok: true,
        term: { id: '1', term: 'standup', enabled: true, createdAt: '' },
      }),
      removeDictionaryTerm: async () => ({ ok: true }),
      startStt: async () => ({ ok: true }),
      sendAudio: () => {},
      stopStt: async () => ({ ok: true }),
      getSettings: async () => ({
        hotkeyPrimary: 'CommandOrControl+Super',
        hotkeyFallback: 'CommandOrControl+Super+Space',
        autoPasteEnabled: false,
        toneMode: 'casual',
        languageMode: 'pt-BR',
        sttProvider: 'azure',
        extraPhrases: [],
        canonicalTerms: [],
        stopGraceMs: 200,
        formatCommandsEnabled: true,
        maxSessionSeconds: 90,
        historyEnabled: true,
        historyRetentionDays: 30,
        privacyMode: false,
        historyStorageMode: 'plain',
        postprocessProfile: 'balanced',
        dualLanguageStrategy: 'fallback-on-low-confidence',
        rewriteEnabled: true,
        rewriteMode: 'safe',
        intentDetectionEnabled: true,
        protectedTerms: [],
        lowConfidencePolicy: 'review',
        adaptiveLearningEnabled: true,
        appProfiles: {},
      }),
      getRuntimeInfo: async () => ({
        hotkeyLabel: 'Ctrl+Win',
        hotkeyMode: 'hold',
        holdToTalkActive: true,
        holdRequired: true,
      }),
      getAzureCredentialStatus: async () => ({
        source: 'missing',
        storageMode: 'none',
        hasStoredCredentials: false,
        encryptionAvailable: true,
        canPersistSecurely: true,
      }),
      testAzureCredentials: async () => ({
        status: 'ok',
        message: 'ok',
        host: 'brazilsouth.api.cognitive.microsoft.com',
      }),
      saveAzureCredentials: async () => ({
        source: 'secure-store',
        storageMode: 'encrypted',
        hasStoredCredentials: true,
        encryptionAvailable: true,
        canPersistSecurely: true,
        region: 'brazilsouth',
      }),
      clearAzureCredentials: async () => ({
        source: 'missing',
        storageMode: 'none',
        hasStoredCredentials: false,
        encryptionAvailable: true,
        canPersistSecurely: true,
      }),
      getHealthCheck,
      getPerfSummary: async () => ({
        sampleCount: 0,
        averages: {
          pttToFirstPartialMs: -1,
          pttToFinalMs: -1,
          injectTotalMs: -1,
          sessionDurationMs: -1,
        },
        skipCounts: {
          WINDOW_CHANGED: 0,
          PASTE_FAILED: 0,
          TIMEOUT: 0,
        },
      }),
      listAdaptiveSuggestions: async () => [],
      applyAdaptiveSuggestion: async () => ({ ok: true }),
      dismissAdaptiveSuggestion: async () => ({ ok: true }),
      getRecentLogs: async () => [],
      retryHoldHook: async () => ({ ok: true, message: 'ok' }),
      updateSettings: async () => ({ ok: true, settings: {} }),
      setAutoPasteEnabled: async () => ({ ok: true }),
      setToneMode: async (mode: 'formal' | 'casual' | 'very-casual') => ({
        ok: true,
        toneMode: mode,
      }),
      onHudState: () => () => {},
      onHudLevel: () => () => {},
      onHudHover: () => () => {},
      onCaptureStart: () => () => {},
      onCaptureStop: () => () => {},
      onSttPartial: () => () => {},
      onSttFinal: () => () => {},
      onSttError: () => () => {},
      onAppError: () => () => {},
    };
    Object.defineProperty(window, 'voiceNoteAI', {
      configurable: true,
      value: api,
    });

    render(<Index />);

    expect(screen.getByRole('tab', { name: 'Vocabulário' })).toBeInTheDocument();
    expect((await screen.findAllByText(/dite em qualquer aplicativo/i)).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Ctrl+Win').length).toBeGreaterThan(0);
    expect(screen.getByRole('tab', { name: 'Configurações' })).toBeInTheDocument();
    expect(listDictionary).not.toHaveBeenCalled();
    expect(listHistory).not.toHaveBeenCalled();
    expect(getHealthCheck).not.toHaveBeenCalled();
  }, 10000);

  it('loads dictionary, history and health check on demand', async () => {
    const listDictionary = vi.fn(async () => []);
    const listHistory = vi.fn(async () => []);
    const getHealthCheck = vi.fn(async () => ({
      generatedAt: new Date().toISOString(),
      items: [],
    }));
    const api = {
      windowMinimize: () => {},
      windowMaximize: () => {},
      windowClose: () => {},
      isWindowMaximized: async () => false,
      onMaximizedChange: () => () => {},
      listDictionary,
      exportDictionary: async () => ({ exportedAt: new Date().toISOString(), terms: [] }),
      importDictionary: async () => ({ ok: true, count: 0 }),
      listHistory,
      removeHistoryEntry: async () => ({ ok: true }),
      clearHistory: async () => ({ ok: true, removed: 0 }),
      addDictionaryTerm: async () => ({
        ok: true,
        term: { id: '1', term: 'standup', enabled: true, createdAt: '' },
      }),
      updateDictionaryTerm: async () => ({
        ok: true,
        term: { id: '1', term: 'standup', enabled: true, createdAt: '' },
      }),
      removeDictionaryTerm: async () => ({ ok: true }),
      startStt: async () => ({ ok: true }),
      sendAudio: () => {},
      stopStt: async () => ({ ok: true }),
      getSettings: async () => ({
        hotkeyPrimary: 'CommandOrControl+Super',
        hotkeyFallback: 'CommandOrControl+Super+Space',
        autoPasteEnabled: false,
        toneMode: 'casual',
        languageMode: 'pt-BR',
        sttProvider: 'azure',
        extraPhrases: [],
        canonicalTerms: [],
        stopGraceMs: 200,
        formatCommandsEnabled: true,
        maxSessionSeconds: 90,
        historyEnabled: true,
        historyRetentionDays: 30,
        privacyMode: false,
        historyStorageMode: 'plain',
        postprocessProfile: 'balanced',
        dualLanguageStrategy: 'fallback-on-low-confidence',
        rewriteEnabled: true,
        rewriteMode: 'safe',
        intentDetectionEnabled: true,
        protectedTerms: [],
        lowConfidencePolicy: 'review',
        adaptiveLearningEnabled: true,
        appProfiles: {},
      }),
      getRuntimeInfo: async () => ({
        hotkeyLabel: 'Ctrl+Win',
        hotkeyMode: 'hold',
        holdToTalkActive: true,
        holdRequired: true,
      }),
      getAzureCredentialStatus: async () => ({
        source: 'missing',
        storageMode: 'none',
        hasStoredCredentials: false,
        encryptionAvailable: true,
        canPersistSecurely: true,
      }),
      testAzureCredentials: async () => ({
        status: 'ok',
        message: 'ok',
        host: 'brazilsouth.api.cognitive.microsoft.com',
      }),
      saveAzureCredentials: async () => ({
        source: 'secure-store',
        storageMode: 'encrypted',
        hasStoredCredentials: true,
        encryptionAvailable: true,
        canPersistSecurely: true,
        region: 'brazilsouth',
      }),
      clearAzureCredentials: async () => ({
        source: 'missing',
        storageMode: 'none',
        hasStoredCredentials: false,
        encryptionAvailable: true,
        canPersistSecurely: true,
      }),
      getHealthCheck,
      getPerfSummary: async () => ({
        sampleCount: 0,
        averages: {
          pttToFirstPartialMs: -1,
          pttToFinalMs: -1,
          injectTotalMs: -1,
          sessionDurationMs: -1,
        },
        skipCounts: {
          WINDOW_CHANGED: 0,
          PASTE_FAILED: 0,
          TIMEOUT: 0,
        },
      }),
      listAdaptiveSuggestions: async () => [],
      applyAdaptiveSuggestion: async () => ({ ok: true }),
      dismissAdaptiveSuggestion: async () => ({ ok: true }),
      getRecentLogs: async () => [],
      retryHoldHook: async () => ({ ok: true, message: 'ok' }),
      updateSettings: async () => ({ ok: true, settings: {} }),
      setAutoPasteEnabled: async () => ({ ok: true }),
      setToneMode: async (mode: 'formal' | 'casual' | 'very-casual') => ({
        ok: true,
        toneMode: mode,
      }),
      onHudState: () => () => {},
      onHudLevel: () => () => {},
      onHudHover: () => () => {},
      onCaptureStart: () => () => {},
      onCaptureStop: () => () => {},
      onSttPartial: () => () => {},
      onSttFinal: () => () => {},
      onSttError: () => () => {},
      onAppError: () => () => {},
    };
    Object.defineProperty(window, 'voiceNoteAI', {
      configurable: true,
      value: api,
    });

    render(<Index />);

    const dictionaryTab = screen.getByRole('tab', { name: 'Vocabulário' });
    fireEvent.mouseDown(dictionaryTab);
    fireEvent.click(dictionaryTab);
    await waitFor(() => expect(dictionaryTab).toHaveAttribute('aria-selected', 'true'));
    await waitFor(() => expect(listDictionary).toHaveBeenCalledTimes(1));

    const historyTab = screen.getByRole('tab', { name: 'Histórico' });
    fireEvent.mouseDown(historyTab);
    fireEvent.click(historyTab);
    await waitFor(() => expect(historyTab).toHaveAttribute('aria-selected', 'true'));
    await waitFor(() => expect(listHistory).toHaveBeenCalledTimes(1));

    const settingsTab = screen.getByRole('tab', { name: 'Configurações' });
    fireEvent.mouseDown(settingsTab);
    fireEvent.click(settingsTab);
    await waitFor(() => expect(settingsTab).toHaveAttribute('aria-selected', 'true'));
    await waitFor(() => expect(getHealthCheck).toHaveBeenCalledTimes(1));
  }, 10000);
});
