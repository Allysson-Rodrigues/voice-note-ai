import { useCallback, useEffect, useState } from 'react';
import type { AppProfile, AzureCredentialStatus, HistoryStorageMode } from '@/electron';
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
  onHealthCheck: (options?: { includeExternal?: boolean }) => Promise<void>;
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

function formatAppProfiles(raw: Record<string, AppProfile>) {
  if (!raw || Object.keys(raw).length === 0) return '{}';
  return JSON.stringify(raw, null, 2);
}

function parseAppProfilesText(raw: string): Record<string, AppProfile> {
  const trimmed = raw.trim();
  if (!trimmed) return {};
  const parsed = JSON.parse(trimmed);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Perfis por aplicativo precisam estar em um objeto JSON.');
  }
  return parsed as Record<string, AppProfile>;
}

export function useAppSettings({
  hasDesktopApi,
  toast,
  onHealthCheck,
  onHistoryRefresh,
}: UseAppSettingsOptions) {
  const [appStatus, setAppStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [autoPasteEnabled, setAutoPasteEnabled] = useState(false);
  const [hotkeyPrimary, setHotkeyPrimary] = useState('CommandOrControl+Super');
  const [hotkeyFallback, setHotkeyFallback] = useState('CommandOrControl+Super+Space');
  const [toneMode, setToneMode] = useState<ToneMode>('casual');
  const [languageMode, setLanguageMode] = useState<LanguageMode>('pt-BR');
  const [latencyProfile, setLatencyProfile] = useState<LatencyProfile>('balanced');
  const [formatCommandsEnabled, setFormatCommandsEnabled] = useState(true);
  const [maxSessionSeconds, setMaxSessionSeconds] = useState(90);
  const [extraPhrasesText, setExtraPhrasesText] = useState('');
  const [historyEnabled, setHistoryEnabled] = useState(true);
  const [historyRetentionDays, setHistoryRetentionDays] = useState(30);
  const [privacyMode, setPrivacyMode] = useState(false);
  const [historyStorageMode, setHistoryStorageMode] = useState<HistoryStorageMode>('plain');
  const [postprocessProfile, setPostprocessProfile] = useState<'safe' | 'balanced' | 'aggressive'>(
    'balanced',
  );
  const [dualLanguageStrategy, setDualLanguageStrategy] = useState<
    'parallel' | 'fallback-on-low-confidence'
  >('fallback-on-low-confidence');
  const [rewriteEnabled, setRewriteEnabled] = useState(true);
  const [rewriteMode, setRewriteMode] = useState<'off' | 'safe' | 'aggressive'>('safe');
  const [intentDetectionEnabled, setIntentDetectionEnabled] = useState(true);
  const [protectedTermsText, setProtectedTermsText] = useState('');
  const [lowConfidencePolicy, setLowConfidencePolicy] = useState<'paste' | 'copy-only' | 'review'>(
    'review',
  );
  const [adaptiveLearningEnabled, setAdaptiveLearningEnabled] = useState(true);
  const [appProfilesText, setAppProfilesText] = useState('{}');
  const [azureKey, setAzureKey] = useState('');
  const [azureRegion, setAzureRegion] = useState('');
  const [azureCredentialStatus, setAzureCredentialStatus] = useState<AzureCredentialStatus>({
    source: 'missing',
    storageMode: 'none',
    hasStoredCredentials: false,
    encryptionAvailable: false,
    canPersistSecurely: false,
  });
  const [azureBusy, setAzureBusy] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);

  const refreshAzureCredentialStatus = useCallback(async () => {
    if (!hasDesktopApi) return;
    const status = await window.voiceNoteAI.getAzureCredentialStatus();
    setAzureCredentialStatus(status);
    if (status.region) {
      setAzureRegion((current) => current || status.region || '');
    }
  }, [hasDesktopApi]);

  const loadSettings = useCallback(async () => {
    if (!hasDesktopApi) return;
    setAppStatus('loading');
    try {
      const [nextSettings, nextAzureStatus] = await Promise.all([
        window.voiceNoteAI.getSettings(),
        window.voiceNoteAI.getAzureCredentialStatus(),
      ]);
      setHotkeyPrimary(nextSettings.hotkeyPrimary);
      setHotkeyFallback(nextSettings.hotkeyFallback);
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
      setMaxSessionSeconds(
        Math.max(30, Math.min(600, Math.round(nextSettings.maxSessionSeconds ?? 90))),
      );
      setExtraPhrasesText((nextSettings.extraPhrases ?? []).join('\n'));
      setHistoryEnabled(nextSettings.historyEnabled !== false);
      setHistoryRetentionDays(clampHistoryRetentionDays(nextSettings.historyRetentionDays ?? 30));
      setPrivacyMode(nextSettings.privacyMode === true);
      setHistoryStorageMode(
        nextSettings.historyStorageMode === 'encrypted' ? 'encrypted' : 'plain',
      );
      setPostprocessProfile(
        nextSettings.postprocessProfile === 'safe'
          ? 'safe'
          : nextSettings.postprocessProfile === 'aggressive'
            ? 'aggressive'
            : 'balanced',
      );
      setDualLanguageStrategy(
        nextSettings.dualLanguageStrategy === 'parallel'
          ? 'parallel'
          : 'fallback-on-low-confidence',
      );
      setRewriteEnabled(nextSettings.rewriteEnabled !== false);
      setRewriteMode(
        nextSettings.rewriteMode === 'off'
          ? 'off'
          : nextSettings.rewriteMode === 'aggressive'
            ? 'aggressive'
            : 'safe',
      );
      setIntentDetectionEnabled(nextSettings.intentDetectionEnabled !== false);
      setProtectedTermsText((nextSettings.protectedTerms ?? []).join('\n'));
      setLowConfidencePolicy(
        nextSettings.lowConfidencePolicy === 'paste'
          ? 'paste'
          : nextSettings.lowConfidencePolicy === 'copy-only'
            ? 'copy-only'
            : 'review',
      );
      setAdaptiveLearningEnabled(nextSettings.adaptiveLearningEnabled !== false);
      setAppProfilesText(formatAppProfiles(nextSettings.appProfiles ?? {}));
      setAzureCredentialStatus(nextAzureStatus);
      if (nextAzureStatus.region) {
        setAzureRegion((current) => current || nextAzureStatus.region || '');
      }
      setAppStatus('ready');
    } catch (e) {
      setAppStatus('error');
      toast({
        title: 'Erro ao carregar configurações',
        description: e instanceof Error ? e.message : 'Ocorreu um erro desconhecido.',
        variant: 'destructive',
      });
    }
  }, [hasDesktopApi, toast]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const saveSettings = useCallback(async () => {
    if (!hasDesktopApi || settingsSaving) return;

    setSettingsSaving(true);
    const retention = clampHistoryRetentionDays(historyRetentionDays);
    const boundedMaxSessionSeconds = Math.max(30, Math.min(600, Math.round(maxSessionSeconds)));
    setHistoryRetentionDays(retention);
    setMaxSessionSeconds(boundedMaxSessionSeconds);

    try {
      const appProfiles = parseAppProfilesText(appProfilesText);
      const result = await window.voiceNoteAI.updateSettings({
        hotkeyPrimary,
        hotkeyFallback,
        toneMode,
        languageMode,
        extraPhrases: normalizeExtraPhrases(extraPhrasesText),
        stopGraceMs: STOP_GRACE_BY_PROFILE[latencyProfile],
        formatCommandsEnabled,
        maxSessionSeconds: boundedMaxSessionSeconds,
        historyEnabled,
        historyRetentionDays: retention,
        privacyMode,
        historyStorageMode,
        postprocessProfile,
        dualLanguageStrategy,
        rewriteEnabled,
        rewriteMode,
        intentDetectionEnabled,
        protectedTerms: normalizeExtraPhrases(protectedTermsText),
        lowConfidencePolicy,
        adaptiveLearningEnabled,
        appProfiles,
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
    hotkeyFallback,
    hotkeyPrimary,
    languageMode,
    latencyProfile,
    loadSettings,
    maxSessionSeconds,
    onHealthCheck,
    onHistoryRefresh,
    appProfilesText,
    dualLanguageStrategy,
    postprocessProfile,
    privacyMode,
    protectedTermsText,
    lowConfidencePolicy,
    rewriteEnabled,
    rewriteMode,
    intentDetectionEnabled,
    adaptiveLearningEnabled,
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

  const testAzureCredentials = useCallback(async () => {
    if (!hasDesktopApi || azureBusy) return null;

    setAzureBusy(true);
    try {
      const result = await window.voiceNoteAI.testAzureCredentials({
        key: azureKey,
        region: azureRegion,
      });
      const title =
        result.status === 'ok'
          ? 'Conexão com Azure validada'
          : result.status === 'network-error'
            ? 'Falha de rede no Azure'
            : 'Falha de autenticação do Azure';
      toast({
        title,
        description: result.message,
        variant: result.status === 'ok' ? 'default' : 'destructive',
      });
      await onHealthCheck({ includeExternal: true });
      return result;
    } catch (error) {
      toast({
        title: 'Falha ao testar credenciais',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
      return null;
    } finally {
      setAzureBusy(false);
    }
  }, [azureBusy, azureKey, azureRegion, hasDesktopApi, onHealthCheck, toast]);

  const saveAzureCredentials = useCallback(async () => {
    if (!hasDesktopApi || azureBusy) return;

    setAzureBusy(true);
    try {
      const status = await window.voiceNoteAI.saveAzureCredentials({
        key: azureKey,
        region: azureRegion,
      });
      setAzureCredentialStatus(status);
      toast({
        title: 'Credenciais salvas',
        description: 'O aplicativo atualizou a configuração segura do Azure Speech.',
      });
      await onHealthCheck();
    } catch (error) {
      toast({
        title: 'Falha ao salvar credenciais',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    } finally {
      setAzureBusy(false);
    }
  }, [azureBusy, azureKey, azureRegion, hasDesktopApi, onHealthCheck, toast]);

  const clearAzureCredentials = useCallback(async () => {
    if (!hasDesktopApi || azureBusy) return;

    setAzureBusy(true);
    try {
      const status = await window.voiceNoteAI.clearAzureCredentials();
      setAzureCredentialStatus(status);
      setAzureKey('');
      toast({
        title: 'Credenciais removidas',
        description: 'O armazenamento seguro do Azure Speech foi limpo.',
      });
      await onHealthCheck();
    } catch (error) {
      toast({
        title: 'Falha ao remover credenciais',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    } finally {
      setAzureBusy(false);
    }
  }, [azureBusy, hasDesktopApi, onHealthCheck, toast]);

  return {
    appStatus,
    appProfilesText,
    autoPasteEnabled,
    azureBusy,
    azureCredentialStatus,
    azureKey,
    azureRegion,
    clearAzureCredentials,
    dualLanguageStrategy,
    extraPhrasesText,
    formatCommandsEnabled,
    historyEnabled,
    historyRetentionDays,
    historyStorageMode,
    hotkeyFallback,
    hotkeyPrimary,
    languageMode,
    latencyProfile,
    loadSettings,
    maxSessionSeconds,
    postprocessProfile,
    privacyMode,
    protectedTermsText,
    lowConfidencePolicy,
    rewriteEnabled,
    rewriteMode,
    intentDetectionEnabled,
    adaptiveLearningEnabled,
    refreshAzureCredentialStatus,
    saveSettings,
    saveAzureCredentials,
    setAdaptiveLearningEnabled,
    setAppProfilesText,
    setAzureKey,
    setAzureRegion,
    setDualLanguageStrategy,
    setExtraPhrasesText,
    setFormatCommandsEnabled,
    setHistoryEnabled,
    setHistoryRetentionDays,
    setHistoryStorageMode,
    setHotkeyFallback,
    setHotkeyPrimary,
    setIntentDetectionEnabled,
    setLanguageMode,
    setLatencyProfile,
    setLowConfidencePolicy,
    setMaxSessionSeconds,
    setPostprocessProfile,
    setPrivacyMode,
    setProtectedTermsText,
    setRewriteEnabled,
    setRewriteMode,
    setToneMode,
    settingsSaving,
    testAzureCredentials,
    toggleAutoPaste,
    toneMode,
  };
}
