import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Index from '@/pages/Index';

describe('Index smoke', () => {
  it('renders dictionary tab and helper text', async () => {
    const api = {
      listDictionary: async () => [],
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
        autoPasteEnabled: false,
        toneMode: 'casual',
        languageMode: 'pt-BR',
        extraPhrases: [],
        canonicalTerms: [],
        stopGraceMs: 200,
        formatCommandsEnabled: true,
        maxSessionSeconds: 90,
      }),
      getRuntimeInfo: async () => ({
        hotkeyLabel: 'Ctrl+Win',
        hotkeyMode: 'hold',
        holdToTalkActive: true,
        holdRequired: true,
      }),
      updateSettings: async () => ({ ok: true, settings: {} }),
      setAutoPasteEnabled: async () => ({ ok: true }),
      setToneMode: async (mode: 'formal' | 'casual' | 'very-casual') => ({
        ok: true,
        toneMode: mode,
      }),
      onHudState: () => () => {},
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

    expect(screen.getByRole('tab', { name: 'Dicionário' })).toBeInTheDocument();
    expect((await screen.findAllByText(/dite em qualquer app/i)).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Ctrl+Win').length).toBeGreaterThan(0);

    expect(screen.getByRole('tab', { name: 'Configurações' })).toBeInTheDocument();
  });
});
