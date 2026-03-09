import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Index from '@/pages/Index';

const startCaptureMock = vi.fn(
  async (_sessionId: string, _deviceId?: string | null, _inputGain?: number) => undefined,
);
const stopCaptureMock = vi.fn(async () => undefined);
const warmupCapturePipelineMock = vi.fn(async () => undefined);
const primeMicrophoneMock = vi.fn(async (_deviceId?: string | null) => undefined);
const setInputGainMock = vi.fn((_value: number) => undefined);

vi.mock('@/audio/capture', async () => {
  const actual = await vi.importActual<typeof import('@/audio/capture')>('@/audio/capture');
  return {
    ...actual,
    onCaptureIssue: () => () => {},
    primeMicrophone: (deviceId?: string | null) => primeMicrophoneMock(deviceId),
    setInputGain: (value: number) => setInputGainMock(value),
    startCapture: (sessionId: string, deviceId?: string | null, inputGain?: number) =>
      startCaptureMock(sessionId, deviceId, inputGain),
    stopCapture: () => stopCaptureMock(),
    warmupCapturePipeline: () => warmupCapturePipelineMock(),
  };
});

describe('voice session lifecycle', () => {
  beforeEach(() => {
    startCaptureMock.mockClear();
    stopCaptureMock.mockClear();
    warmupCapturePipelineMock.mockClear();
    primeMicrophoneMock.mockClear();
    setInputGainMock.mockClear();
  });

  it('mantem a sessao ativa ao trocar de aba', async () => {
    const startStt = vi.fn(async () => ({ ok: true }));
    const stopStt = vi.fn(async () => ({ ok: true }));
    const getHealthCheck = vi.fn(async () => ({
      generatedAt: new Date().toISOString(),
      items: [],
    }));

    let captureStartHandler: ((payload: { sessionId: string }) => Promise<void> | void) | null =
      null;

    Object.defineProperty(window, 'voiceNoteAI', {
      configurable: true,
      value: {
        windowMinimize: () => {},
        windowMaximize: () => {},
        windowClose: () => {},
        isWindowMaximized: async () => false,
        onMaximizedChange: () => () => {},
        listDictionary: async () => [],
        exportDictionary: async () => ({ exportedAt: new Date().toISOString(), terms: [] }),
        importDictionary: async () => ({ ok: true, count: 0 }),
        listHistory: async () => [],
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
        startStt,
        sendAudio: () => {},
        stopStt,
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
        onCaptureStart: (cb: (payload: { sessionId: string }) => Promise<void> | void) => {
          captureStartHandler = cb;
          return () => {
            captureStartHandler = null;
          };
        },
        onCaptureStop: () => () => {},
        onSttPartial: () => () => {},
        onSttFinal: () => () => {},
        onSttError: () => () => {},
        onAppError: () => () => {},
      },
    });

    render(<Index />);

    await waitFor(() => expect(captureStartHandler).not.toBeNull());

    await act(async () => {
      await captureStartHandler?.({ sessionId: 'sessao-1' });
    });

    await waitFor(() => expect(startStt).toHaveBeenCalledWith({ sessionId: 'sessao-1' }));
    expect(stopStt).not.toHaveBeenCalled();
    expect(stopCaptureMock).not.toHaveBeenCalled();

    const settingsTab = screen.getByRole('tab', { name: 'Configurações' });
    fireEvent.mouseDown(settingsTab);
    fireEvent.click(settingsTab);

    await waitFor(() => expect(settingsTab).toHaveAttribute('aria-selected', 'true'));
    expect(stopStt).not.toHaveBeenCalled();
    expect(stopCaptureMock).not.toHaveBeenCalled();
  });

  it('nao inicia a sessao STT quando o microfone e negado', async () => {
    startCaptureMock.mockRejectedValueOnce(
      Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' }),
    );

    const startStt = vi.fn(async () => ({ ok: true }));

    let captureStartHandler: ((payload: { sessionId: string }) => Promise<void> | void) | null =
      null;

    Object.defineProperty(window, 'voiceNoteAI', {
      configurable: true,
      value: {
        windowMinimize: () => {},
        windowMaximize: () => {},
        windowClose: () => {},
        isWindowMaximized: async () => false,
        onMaximizedChange: () => () => {},
        listDictionary: async () => [],
        exportDictionary: async () => ({ exportedAt: new Date().toISOString(), terms: [] }),
        importDictionary: async () => ({ ok: true, count: 0 }),
        listHistory: async () => [],
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
        startStt,
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
        getHealthCheck: async () => ({
          generatedAt: new Date().toISOString(),
          items: [],
        }),
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
        onCaptureStart: (cb: (payload: { sessionId: string }) => Promise<void> | void) => {
          captureStartHandler = cb;
          return () => {
            captureStartHandler = null;
          };
        },
        onCaptureStop: () => () => {},
        onSttPartial: () => () => {},
        onSttFinal: () => () => {},
        onSttError: () => () => {},
        onAppError: () => () => {},
      },
    });

    render(<Index />);

    await waitFor(() => expect(captureStartHandler).not.toBeNull());

    await act(async () => {
      await captureStartHandler?.({ sessionId: 'sessao-permissao' });
    });

    await waitFor(() => {
      expect(startCaptureMock).toHaveBeenCalledWith('sessao-permissao', null, 1);
    });
    expect(startStt).not.toHaveBeenCalled();
    expect(screen.getByText(/Permissão de microfone negada/i)).toBeInTheDocument();
  });
});
