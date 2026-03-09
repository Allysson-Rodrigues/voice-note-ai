import type { IpcMain } from "electron";
import { safeStorage } from "electron";
import { generateAdaptiveSuggestions } from "./modules/adaptive-learning.js";
import {
  getHealthCheckReport,
  testAzureSpeechConnection,
} from "./modules/health-check.js";
import type { SttSessionManager } from "./modules/stt-session-support.js";
import type { AppStores } from "./app-stores.js";
import {
  validateAdaptiveSuggestionPayload,
  validateAutoPastePayload,
  validateAzureCredentialsPayload,
  validateDictionaryAddPayload,
  validateDictionaryImportPayload,
  validateDictionaryUpdatePayload,
  validateHealthCheckPayload,
  validateHistoryClearPayload,
  validateHistoryListPayload,
  validateIdPayload,
  validateSettingsUpdate,
  validateTonePayload,
} from "./ipc-validation.js";
import { getRecentLogs } from "./logger.js";
import type { AppSettings, SettingsStore } from "./settings-store.js";

type RuntimeSecurity = {
  cspEnabled: boolean;
  permissionsPolicy: "default-deny";
  trustedOrigins: string[];
};

type HotkeyServiceApi = {
  getStopHoldHook: () => unknown;
  retryHoldHook: () => Promise<unknown>;
  validateHotkeyConfiguration: (args: {
    primaryHotkey: string;
    fallbackHotkey: string;
  }) => { ok: boolean; message?: string };
  reloadHotkeys: (args?: {
    primaryHotkey: string;
    fallbackHotkey: string;
  }) => Promise<{ ok: boolean; message?: string }>;
};

type TextInjectionServiceApi = {
  getRecentInjectionStats: () => {
    appKey: string | null;
    method: string | null;
    pasted: boolean;
    skippedReason?: string;
    updatedAt: string;
  } | null;
};

type RegisterAppIpcHandlersOptions = {
  ipcMain: IpcMain;
  holdToTalkEnabled: boolean;
  getRuntimeSecurity: () => RuntimeSecurity;
  getRuntimeInfo: () => unknown;
  getSettings: () => AppSettings;
  setSettings: (settings: AppSettings) => void;
  getSettingsStore: () => SettingsStore | null;
  stores: AppStores;
  sttManager: SttSessionManager;
  hotkeyService: HotkeyServiceApi;
  textInjectionService: TextInjectionServiceApi;
  refreshCaptureBlockedReason: () => string | null | undefined;
};

export function registerAppIpcHandlers({
  ipcMain,
  holdToTalkEnabled,
  getRuntimeSecurity,
  getRuntimeInfo,
  getSettings,
  setSettings,
  getSettingsStore,
  stores,
  sttManager,
  hotkeyService,
  textInjectionService,
  refreshCaptureBlockedReason,
}: RegisterAppIpcHandlersOptions) {
  ipcMain.handle("settings:get", async () => {
    return {
      ...getSettings(),
    };
  });

  ipcMain.handle("app:runtime-info", async () => {
    refreshCaptureBlockedReason();
    return getRuntimeInfo();
  });

  ipcMain.handle("app:azure-credentials-status", async () => {
    return stores.getAzureCredentialStatus();
  });

  ipcMain.handle(
    "app:azure-credentials:test",
    async (_event, payload: unknown) => {
      const credentials = validateAzureCredentialsPayload(payload);
      return await testAzureSpeechConnection(credentials);
    },
  );

  ipcMain.handle(
    "app:azure-credentials:save",
    async (_event, payload: unknown) => {
      const credentials = validateAzureCredentialsPayload(payload);
      const status = await stores.getAzureCredentialsStore().save(credentials);
      sttManager.invalidateRuntimeCaches();
      refreshCaptureBlockedReason();
      void sttManager.prewarmStt();
      return status;
    },
  );

  ipcMain.handle("app:azure-credentials:clear", async () => {
    const status = await stores.getAzureCredentialsStore().clear();
    sttManager.invalidateRuntimeCaches();
    refreshCaptureBlockedReason();
    return status;
  });

  ipcMain.handle("app:health-check", async (_event, payload?: unknown) => {
    refreshCaptureBlockedReason();
    const healthPayload = validateHealthCheckPayload(payload);
    const settings = getSettings();
    const azureCredentialStatus = stores.getAzureCredentialStatus();
    const azureCredentials = stores.getResolvedAzureCredentials();
    return await getHealthCheckReport({
      holdToTalkEnabled,
      holdHookActive: Boolean(hotkeyService.getStopHoldHook()),
      perfSummary: await stores.getPerfStore().getSummary(),
      recentInjection: textInjectionService.getRecentInjectionStats(),
      historyEnabled: settings.historyEnabled,
      privacyMode: settings.privacyMode,
      historyStorageMode: settings.historyStorageMode,
      isEncryptionAvailable: safeStorage.isEncryptionAvailable(),
      phraseBoostCount: await sttManager.getPhraseBoostCount(),
      runtimeSecurity: getRuntimeSecurity(),
      azureCredentialSource: azureCredentialStatus.source,
      azureCredentialStorageMode: azureCredentialStatus.storageMode,
      azureCredentials,
      includeExternalAzureCheck: healthPayload.includeExternal === true,
      testAzureConnection:
        healthPayload.includeExternal === true
          ? () =>
              testAzureSpeechConnection({
                key: azureCredentials.key,
                region: azureCredentials.region,
              })
          : null,
      microphone: healthPayload.microphone,
    });
  });

  ipcMain.handle("app:retry-hold-hook", async () => {
    return await hotkeyService.retryHoldHook();
  });

  ipcMain.handle("app:perf-summary", async () => {
    return await stores.getPerfStore().getSummary();
  });

  ipcMain.handle(
    "app:logs:recent",
    async (_event, payload?: { limit?: number }) => {
      return getRecentLogs(payload?.limit ?? 50);
    },
  );

  ipcMain.handle("adaptive:list", async () => {
    const settings = getSettings();
    if (!settings.adaptiveLearningEnabled) return [];
    return generateAdaptiveSuggestions(
      stores.getAdaptiveStore().get(),
      settings,
    );
  });

  ipcMain.handle("adaptive:apply", async (_event, payload: unknown) => {
    const settingsStore = getSettingsStore();
    if (!settingsStore) return { ok: false };

    const { id } = validateAdaptiveSuggestionPayload(payload);
    const settings = getSettings();
    const suggestion = generateAdaptiveSuggestions(
      stores.getAdaptiveStore().get(),
      settings,
    ).find((item) => item.id === id);
    if (!suggestion) throw new Error("Sugestão adaptativa não encontrada.");

    if (suggestion.type === "protected-term") {
      setSettings(
        await settingsStore.update({
          appProfiles: {
            ...(settings.appProfiles ?? {}),
            [suggestion.appKey]: {
              ...(settings.appProfiles?.[suggestion.appKey] ?? {}),
              protectedTerms: [
                ...new Set([
                  ...((settings.appProfiles?.[suggestion.appKey]
                    ?.protectedTerms ?? []) as string[]),
                  suggestion.payload.term,
                ]),
              ],
            },
          },
        }),
      );
    } else if (suggestion.type === "format-style") {
      setSettings(
        await settingsStore.update({
          appProfiles: {
            ...(settings.appProfiles ?? {}),
            [suggestion.appKey]: {
              ...(settings.appProfiles?.[suggestion.appKey] ?? {}),
              formatStyle: suggestion.payload.formatStyle,
            },
          },
        }),
      );
    } else if (suggestion.type === "language-bias") {
      setSettings(
        await settingsStore.update({
          appProfiles: {
            ...(settings.appProfiles ?? {}),
            [suggestion.appKey]: {
              ...(settings.appProfiles?.[suggestion.appKey] ?? {}),
              languageBias: suggestion.payload.languageBias,
            },
          },
        }),
      );
    }

    await stores.getAdaptiveStore().dismissSuggestion(id);
    sttManager.markPhraseCacheDirty();
    return { ok: true };
  });

  ipcMain.handle("adaptive:dismiss", async (_event, payload: unknown) => {
    const { id } = validateAdaptiveSuggestionPayload(payload);
    await stores.getAdaptiveStore().dismissSuggestion(id);
    return { ok: true };
  });

  ipcMain.handle("settings:update", async (_event, payload: unknown) => {
    const settingsStore = getSettingsStore();
    if (!settingsStore) return { ok: false };

    const partial = validateSettingsUpdate(payload);
    const previousSettings = getSettings();
    const nextSettings = settingsStore.previewUpdate(
      partial as Partial<AppSettings>,
    );

    if ("hotkeyPrimary" in partial || "hotkeyFallback" in partial) {
      const hotkeyValidation = hotkeyService.validateHotkeyConfiguration({
        primaryHotkey: nextSettings.hotkeyPrimary,
        fallbackHotkey: nextSettings.hotkeyFallback,
      });
      if (!hotkeyValidation.ok) {
        throw new Error(hotkeyValidation.message);
      }
    }

    setSettings(await settingsStore.update(partial as Partial<AppSettings>));

    try {
      if ("hotkeyPrimary" in partial || "hotkeyFallback" in partial) {
        const settings = getSettings();
        const hotkeyReload = await hotkeyService.reloadHotkeys({
          primaryHotkey: settings.hotkeyPrimary,
          fallbackHotkey: settings.hotkeyFallback,
        });
        if (!hotkeyReload.ok) {
          throw new Error(hotkeyReload.message);
        }
      }

      if ("historyRetentionDays" in partial || "historyEnabled" in partial) {
        await stores
          .getHistoryStore()
          .prune(getSettings().historyRetentionDays);
      }

      sttManager.markPhraseCacheDirty();
      refreshCaptureBlockedReason();
      return { ok: true, settings: getSettings() };
    } catch (error) {
      setSettings(await settingsStore.replace(previousSettings));
      if ("hotkeyPrimary" in partial || "hotkeyFallback" in partial) {
        await hotkeyService.reloadHotkeys({
          primaryHotkey: previousSettings.hotkeyPrimary,
          fallbackHotkey: previousSettings.hotkeyFallback,
        });
      }
      refreshCaptureBlockedReason();
      throw error;
    }
  });

  ipcMain.handle("settings:autoPaste", async (_event, payload: unknown) => {
    const settingsStore = getSettingsStore();
    if (!settingsStore) return { ok: false };
    const { enabled } = validateAutoPastePayload(payload);
    setSettings(await settingsStore.update({ autoPasteEnabled: enabled }));
    return { ok: true };
  });

  ipcMain.handle("settings:tone", async (_event, payload: unknown) => {
    const settingsStore = getSettingsStore();
    if (!settingsStore) return { ok: false };
    const { mode } = validateTonePayload(payload);
    setSettings(
      await settingsStore.update({
        toneMode:
          mode === "formal"
            ? "formal"
            : mode === "very-casual"
              ? "very-casual"
              : "casual",
      }),
    );
    return { ok: true, toneMode: getSettings().toneMode };
  });

  ipcMain.handle("dictionary:list", async () => {
    return stores.getDictionaryStore().list();
  });

  ipcMain.handle("dictionary:export", async () => {
    return await stores.getDictionaryStore().export();
  });

  ipcMain.handle("dictionary:import", async (_event, payload: unknown) => {
    const { terms, mode } = validateDictionaryImportPayload(payload);
    const result = await stores.getDictionaryStore().import({
      terms: terms as never,
      mode,
    });
    sttManager.markPhraseCacheDirty();
    return result;
  });

  ipcMain.handle("dictionary:add", async (_event, payload: unknown) => {
    const validPayload = validateDictionaryAddPayload(payload);
    const term = await stores.getDictionaryStore().add(validPayload);
    sttManager.markPhraseCacheDirty();
    return { ok: true, term };
  });

  ipcMain.handle("dictionary:update", async (_event, payload: unknown) => {
    const validPayload = validateDictionaryUpdatePayload(payload);
    const term = await stores.getDictionaryStore().update(validPayload);
    sttManager.markPhraseCacheDirty();
    return { ok: true, term };
  });

  ipcMain.handle("dictionary:remove", async (_event, payload: unknown) => {
    const { id } = validateIdPayload(payload, "dictionary:remove");
    const result = await stores.getDictionaryStore().remove(id);
    sttManager.markPhraseCacheDirty();
    return result;
  });

  ipcMain.handle("history:list", async (_event, payload?: unknown) => {
    return await stores
      .getHistoryStore()
      .list(validateHistoryListPayload(payload));
  });

  ipcMain.handle("history:remove", async (_event, payload: unknown) => {
    const { id } = validateIdPayload(payload, "history:remove");
    return await stores.getHistoryStore().remove(id);
  });

  ipcMain.handle("history:clear", async (_event, payload?: unknown) => {
    return await stores
      .getHistoryStore()
      .clear(validateHistoryClearPayload(payload));
  });
}
