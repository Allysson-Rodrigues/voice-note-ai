import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useAppSettings } from '@/hooks/useAppSettings';
import type { AppToastInput } from '@/hooks/app-toast';

function SettingsHarness({
  toast,
  onHealthCheck,
  onHistoryRefresh,
}: {
  toast: (input: AppToastInput) => void;
  onHealthCheck: () => Promise<void>;
  onHistoryRefresh: () => Promise<void>;
}) {
  const settings = useAppSettings({
    hasDesktopApi: true,
    toast,
    onHealthCheck,
    onHistoryRefresh,
  });

  return (
    <div>
      <div data-testid="privacy-mode">{String(settings.privacyMode)}</div>
      <button type="button" onClick={() => settings.setPrivacyMode(true)}>
        ativar-privado
      </button>
      <button type="button" onClick={() => void settings.saveSettings()}>
        salvar
      </button>
    </div>
  );
}

describe('useAppSettings', () => {
  it('faz rollback quando o backend nao confirma o salvamento', async () => {
    const toast = vi.fn();
    const onHealthCheck = vi.fn(async () => undefined);
    const onHistoryRefresh = vi.fn(async () => undefined);
    const getSettings = vi.fn(async () => ({
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
      appProfiles: {},
    }));
    const updateSettings = vi.fn(async () => ({ ok: false }));

    Object.defineProperty(window, 'voiceNoteAI', {
      configurable: true,
      value: {
        getSettings,
        updateSettings,
      },
    });

    render(
      <SettingsHarness
        toast={toast}
        onHealthCheck={onHealthCheck}
        onHistoryRefresh={onHistoryRefresh}
      />,
    );

    await waitFor(() => expect(screen.getByTestId('privacy-mode')).toHaveTextContent('false'));

    fireEvent.click(screen.getByRole('button', { name: 'ativar-privado' }));
    expect(screen.getByTestId('privacy-mode')).toHaveTextContent('true');

    fireEvent.click(screen.getByRole('button', { name: 'salvar' }));

    await waitFor(() => expect(updateSettings).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(getSettings).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByTestId('privacy-mode')).toHaveTextContent('false'));

    expect(onHealthCheck).not.toHaveBeenCalled();
    expect(onHistoryRefresh).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Falha ao salvar preferências',
        variant: 'destructive',
      }),
    );
  });
});
