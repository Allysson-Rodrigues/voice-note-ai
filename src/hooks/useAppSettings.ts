import { useCallback, useEffect, useState } from 'react';
import type { HistoryStorageMode } from '@/electron';
import {
  STOP_GRACE_BY_PROFILE,
  type LatencyProfile,
  latencyProfileFromStopGrace,
} from '@/lib/latency';
import { clampHistoryRetentionDays } from '@/components/index/utils';
import type { LanguageMode, ToneMode } from '@/components/index/types';
import type { AppToast } from './app-toast';

type UseAppSettingsOptions = {
  hasDesktopApi: boolean;
  toast: AppToast;
  onHealthCheck: () => Promise<void>;
  onHistoryRefresh?: () => Promise<void>;
};

function ensureOkResult(
  result: { ok?: boolean } | null | undefined,
  fallbackMessage: string,
): asserts result is { ok: true } {
  if (result?.ok !== true) {
    throw new Error(fallbackMessage);
  }
}

function normalizeExtraPhrases(raw: string) {
  return raw
    .split(/\r?\n|,/g)
    .map((entry) => entry.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

export function useAppSettings({
  hasDesktopApi,
  toast,
  onHealthCheck,
  onHistoryRefresh,
}: UseAppSettingsOptions) {
  const [autoPasteEnabled, setAutoPasteEnabled] = useState(false);
  const [toneMode, setToneMode] = useState<ToneMode>('casual');
  const [languageMode, setLanguageMode] = useState<LanguageMode>('pt-BR');
  const [latencyProfile, setLatencyProfile] = useState<LatencyProfile>('balanced');
  const [formatCommandsEnabled, setFormatCommandsEnabled] = useState(true);
  const [extraPhrasesText, setExtraPhrasesText] = useState('');
  const [historyEnabled, setHistoryEnabled] = useState(true);
  const [historyRetentionDays, setHistoryRetentionDays] = useState(30);
  const [privacyMode, setPrivacyMode] = useState(false);
  const [historyStorageMode, setHistoryStorageMode] = useState<HistoryStorageMode>('plain');
  const [settingsSaving, setSettingsSaving] = useState(false);

  const loadSettings = useCallback(async () => {
    if (!hasDesktopApi) return;

    try {
      const nextSettings = await window.voiceNoteAI.getSettings();
      setAutoPasteEnabled(Boolean(nextSettings.autoPasteEnabled));
      setToneMode(
        nextSettings.toneMode === 'formal'
          ? 'formal'
          : nextSettings.toneMode === 'very-casual'
            ? 'very-casual'
            : 'casual',
      );
      setLanguageMode(
        nextSettings.languageMode === 'dual'
          ? 'dual'
          : nextSettings.languageMode === 'en-US'
            ? 'en-US'
            : 'pt-BR',
      );
      setLatencyProfile(latencyProfileFromStopGrace(nextSettings.stopGraceMs));
      setFormatCommandsEnabled(nextSettings.formatCommandsEnabled !== false);
      setExtraPhrasesText((nextSettings.extraPhrases ?? []).join('\n'));
      setHistoryEnabled(nextSettings.historyEnabled !== false);
      setHistoryRetentionDays(clampHistoryRetentionDays(nextSettings.historyRetentionDays ?? 30));
      setPrivacyMode(nextSettings.privacyMode === true);
      setHistoryStorageMode(
        nextSettings.historyStorageMode === 'encrypted' ? 'encrypted' : 'plain',
      );
    } catch {
      // ignore bootstrap errors; diagnostics surface them elsewhere
    }
  }, [hasDesktopApi]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const saveSettings = useCallback(async () => {
    if (!hasDesktopApi || settingsSaving) return;

    setSettingsSaving(true);
    const retention = clampHistoryRetentionDays(historyRetentionDays);
    setHistoryRetentionDays(retention);

    try {
      const result = await window.voiceNoteAI.updateSettings({
        toneMode,
        languageMode,
        extraPhrases: normalizeExtraPhrases(extraPhrasesText),
        stopGraceMs: STOP_GRACE_BY_PROFILE[latencyProfile],
        formatCommandsEnabled,
        historyEnabled,
        historyRetentionDays: retention,
        privacyMode,
        historyStorageMode,
      });
      ensureOkResult(result, 'O aplicativo nao confirmou a atualizacao das preferências.');

      toast({
        title: 'Preferências salvas',
        description: 'As configurações do aplicativo foram atualizadas.',
      });

      if (onHistoryRefresh) await onHistoryRefresh();
      await onHealthCheck();
    } catch (error) {
      await loadSettings();
      toast({
        title: 'Falha ao salvar preferências',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    } finally {
      setSettingsSaving(false);
    }
  }, [
    extraPhrasesText,
    formatCommandsEnabled,
    hasDesktopApi,
    historyEnabled,
    historyRetentionDays,
    historyStorageMode,
    languageMode,
    latencyProfile,
    loadSettings,
    onHealthCheck,
    onHistoryRefresh,
    privacyMode,
    settingsSaving,
    toast,
    toneMode,
  ]);

  const toggleAutoPaste = useCallback(async () => {
    const next = !autoPasteEnabled;
    setAutoPasteEnabled(next);

    if (!hasDesktopApi) return;

    try {
      const result = await window.voiceNoteAI.setAutoPasteEnabled(next);
      ensureOkResult(result, 'Nao foi possivel atualizar a insercao automatica.');
    } catch (error) {
      setAutoPasteEnabled(!next);
      toast({
        title: 'Falha ao atualizar inserção automática',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    }
  }, [autoPasteEnabled, hasDesktopApi, toast]);

  return {
    autoPasteEnabled,
    extraPhrasesText,
    formatCommandsEnabled,
    historyEnabled,
    historyRetentionDays,
    historyStorageMode,
    languageMode,
    latencyProfile,
    loadSettings,
    privacyMode,
    saveSettings,
    setExtraPhrasesText,
    setFormatCommandsEnabled,
    setHistoryEnabled,
    setHistoryRetentionDays,
    setHistoryStorageMode,
    setLanguageMode,
    setLatencyProfile,
    setPrivacyMode,
    setToneMode,
    settingsSaving,
    toggleAutoPaste,
    toneMode,
  };
}
