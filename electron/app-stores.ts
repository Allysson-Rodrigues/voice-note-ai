import { app, safeStorage } from "electron";
import path from "node:path";
import { AdaptiveStore } from "./adaptive-store.js";
import { AzureCredentialsStore } from "./azure-credentials-store.js";
import { DictionaryStore } from "./dictionary-store.js";
import { HistoryStore } from "./history-store.js";
import { PerfStore } from "./perf-store.js";
import { canUseHistoryPhraseBoost } from "./privacy-rules.js";
import type { AppSettings } from "./settings-store.js";

type AppStoresOptions = {
  getSettings: () => AppSettings;
};

function tokenizePhraseCandidates(text: string) {
  return text
    .split(/[^A-Za-zÀ-ÿ0-9+#.-]+/g)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length >= 3 && entry.length <= 32)
    .filter((entry) => /[A-Za-zÀ-ÿ]/.test(entry));
}

export function createAppStores({ getSettings }: AppStoresOptions) {
  let dictionaryStore: DictionaryStore | null = null;
  let historyStore: HistoryStore | null = null;
  let perfStore: PerfStore | null = null;
  let adaptiveStore: AdaptiveStore | null = null;
  let azureCredentialsStore: AzureCredentialsStore | null = null;

  const createProtectedStorageAdapter = () => ({
    isEncryptionAvailable: () =>
      getSettings().historyStorageMode === "encrypted" &&
      safeStorage.isEncryptionAvailable(),
    encryptString: (value: string) =>
      safeStorage.encryptString(value).toString("base64"),
    decryptString: (value: string) =>
      safeStorage.decryptString(Buffer.from(value, "base64")),
  });

  function getDictionaryStore() {
    if (!dictionaryStore) {
      dictionaryStore = new DictionaryStore(
        path.join(app.getPath("userData"), "dictionary.json"),
      );
    }
    return dictionaryStore;
  }

  function getHistoryStore() {
    if (!historyStore) {
      historyStore = new HistoryStore(
        path.join(app.getPath("userData"), "history.json"),
        createProtectedStorageAdapter(),
      );
    }
    return historyStore;
  }

  function getPerfStore() {
    if (!perfStore) {
      perfStore = new PerfStore(
        path.join(app.getPath("userData"), "perf.json"),
      );
    }
    return perfStore;
  }

  function getAdaptiveStore() {
    if (!adaptiveStore) {
      adaptiveStore = new AdaptiveStore(
        path.join(app.getPath("userData"), "adaptive.json"),
        createProtectedStorageAdapter(),
      );
    }
    return adaptiveStore;
  }

  function getAzureCredentialsStore() {
    if (!azureCredentialsStore) {
      azureCredentialsStore = new AzureCredentialsStore(
        path.join(app.getPath("userData"), "azure-credentials.json"),
        {
          isEncryptionAvailable: () => safeStorage.isEncryptionAvailable(),
          encryptString: (value) =>
            safeStorage.encryptString(value).toString("base64"),
          decryptString: (value) =>
            safeStorage.decryptString(Buffer.from(value, "base64")),
        },
      );
    }
    return azureCredentialsStore;
  }

  async function getRecentHistoryPhrases(limit = 40) {
    if (!canUseHistoryPhraseBoost(getSettings())) return [];
    try {
      const entries = await getHistoryStore().list({ limit });
      const counts = new Map<string, number>();
      for (const entry of entries) {
        for (const token of tokenizePhraseCandidates(entry.text)) {
          const key = token.toLocaleLowerCase();
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
      }

      return [...counts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 60)
        .map(([token]) => token);
    } catch {
      return [];
    }
  }

  return {
    getDictionaryStore,
    getHistoryStore,
    getPerfStore,
    getAdaptiveStore,
    getAzureCredentialsStore,
    getResolvedAzureCredentials: () => getAzureCredentialsStore().resolve(),
    getAzureCredentialStatus: () => getAzureCredentialsStore().getStatus(),
    getRecentHistoryPhrases,
  };
}

export type AppStores = ReturnType<typeof createAppStores>;
