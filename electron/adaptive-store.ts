import {
  quarantineFile,
  readTextFilePair,
  unwrapStoreEnvelope,
  wrapStoreEnvelope,
  writeTextFileAtomic,
} from "./store-utils.js";

type AdaptiveStoreCodec = {
  isEncryptionAvailable?: () => boolean;
  encryptString?: (value: string) => string;
  decryptString?: (value: string) => string;
};

type AdaptiveTermStats = {
  term: string;
  count: number;
  lastSeenAt: string;
};

export type AdaptiveAppStats = {
  appKey: string;
  sessionCount: number;
  lowConfidenceCount: number;
  intentCounts: Record<string, number>;
  languageCounts: Record<string, number>;
  termStats: Record<string, AdaptiveTermStats>;
};

export type AdaptiveStoreState = {
  apps: Record<string, AdaptiveAppStats>;
  dismissedSuggestionIds: string[];
};

const EMPTY_STATE: AdaptiveStoreState = {
  apps: {},
  dismissedSuggestionIds: [],
};

function normalizeTerm(term: string) {
  return term.replace(/\s+/g, " ").trim();
}

function isLearnableTerm(term: string) {
  if (term.length < 4 || term.length > 40) return false;
  if (!/[A-Za-zÀ-ÿ]/.test(term)) return false;
  return true;
}

function tokenize(text: string) {
  return text
    .split(/[^A-Za-zÀ-ÿ0-9+#.-]+/g)
    .map((entry) => normalizeTerm(entry))
    .filter(isLearnableTerm);
}

function clampDismissed(ids: string[]) {
  return [...new Set(ids.filter(Boolean))].slice(-500);
}

function parseState(raw: unknown): AdaptiveStoreState {
  if (!raw || typeof raw !== "object") return { ...EMPTY_STATE };
  const input = raw as Partial<AdaptiveStoreState>;
  const apps: Record<string, AdaptiveAppStats> = {};

  for (const [appKey, rawStats] of Object.entries(input.apps ?? {})) {
    if (!appKey || !rawStats || typeof rawStats !== "object") continue;
    const stats = rawStats as Partial<AdaptiveAppStats>;
    apps[appKey] = {
      appKey,
      sessionCount: Number.isFinite(stats.sessionCount)
        ? Math.max(0, Math.round(stats.sessionCount!))
        : 0,
      lowConfidenceCount: Number.isFinite(stats.lowConfidenceCount)
        ? Math.max(0, Math.round(stats.lowConfidenceCount!))
        : 0,
      intentCounts:
        stats.intentCounts && typeof stats.intentCounts === "object"
          ? Object.fromEntries(
              Object.entries(stats.intentCounts)
                .filter((entry): entry is [string, number] =>
                  Number.isFinite(entry[1]),
                )
                .map(([key, value]) => [key, Math.max(0, Math.round(value))]),
            )
          : {},
      languageCounts:
        stats.languageCounts && typeof stats.languageCounts === "object"
          ? Object.fromEntries(
              Object.entries(stats.languageCounts)
                .filter((entry): entry is [string, number] =>
                  Number.isFinite(entry[1]),
                )
                .map(([key, value]) => [key, Math.max(0, Math.round(value))]),
            )
          : {},
      termStats:
        stats.termStats && typeof stats.termStats === "object"
          ? Object.fromEntries(
              Object.entries(stats.termStats)
                .filter(([, value]) =>
                  Boolean(value && typeof value === "object"),
                )
                .map(([key, value]) => {
                  const item = value as Partial<AdaptiveTermStats>;
                  return [
                    key,
                    {
                      term: normalizeTerm(item.term ?? key),
                      count: Number.isFinite(item.count)
                        ? Math.max(0, Math.round(item.count!))
                        : 0,
                      lastSeenAt:
                        typeof item.lastSeenAt === "string" && item.lastSeenAt
                          ? item.lastSeenAt
                          : new Date().toISOString(),
                    },
                  ];
                }),
            )
          : {},
    };
  }

  return {
    apps,
    dismissedSuggestionIds: clampDismissed(
      Array.isArray(input.dismissedSuggestionIds)
        ? input.dismissedSuggestionIds.filter(
            (entry): entry is string => typeof entry === "string",
          )
        : [],
    ),
  };
}

export class AdaptiveStore {
  private readonly filePath: string;
  private readonly codec?: AdaptiveStoreCodec;
  private cached: AdaptiveStoreState = { ...EMPTY_STATE };

  constructor(filePath: string, codec?: AdaptiveStoreCodec) {
    this.filePath = filePath;
    this.codec = codec;
  }

  get() {
    return this.cached;
  }

  async load() {
    const pair = await readTextFilePair(this.filePath);
    const primary = this.tryParse(pair.primary);
    if (primary) {
      this.cached = primary.state;
      if (primary.needsMigration) {
        await this.persist(primary.state);
      }
      return primary.state;
    }

    const backup = this.tryParse(pair.backup);
    if (backup) {
      this.cached = backup.state;
      await this.persist(backup.state);
      return backup.state;
    }

    if (pair.primary != null) {
      await quarantineFile(this.filePath, "corrupt");
    }

    await this.persist(this.cached);
    return this.cached;
  }

  async dismissSuggestion(id: string) {
    const cleanId = normalizeTerm(id);
    if (!cleanId) return this.cached;
    const next = {
      ...this.cached,
      dismissedSuggestionIds: clampDismissed([
        ...this.cached.dismissedSuggestionIds,
        cleanId,
      ]),
    };
    this.cached = next;
    await this.persist(next);
    return next;
  }

  async observeSession(entry: {
    appKey?: string;
    text: string;
    intent?: string;
    languageChosen?: string;
    confidenceBucket?: "high" | "medium" | "low";
  }) {
    const appKey = normalizeTerm(entry.appKey ?? "").toLocaleLowerCase();
    if (!appKey) return this.cached;

    const current = this.cached.apps[appKey] ?? {
      appKey,
      sessionCount: 0,
      lowConfidenceCount: 0,
      intentCounts: {},
      languageCounts: {},
      termStats: {},
    };

    const nextStats: AdaptiveAppStats = {
      ...current,
      sessionCount: current.sessionCount + 1,
      lowConfidenceCount:
        current.lowConfidenceCount + (entry.confidenceBucket === "low" ? 1 : 0),
      intentCounts: { ...current.intentCounts },
      languageCounts: { ...current.languageCounts },
      termStats: { ...current.termStats },
    };

    if (entry.intent) {
      nextStats.intentCounts[entry.intent] =
        (nextStats.intentCounts[entry.intent] ?? 0) + 1;
    }
    if (entry.languageChosen) {
      nextStats.languageCounts[entry.languageChosen] =
        (nextStats.languageCounts[entry.languageChosen] ?? 0) + 1;
    }

    for (const token of tokenize(entry.text)) {
      const key = token.toLocaleLowerCase();
      const currentTerm = nextStats.termStats[key] ?? {
        term: token,
        count: 0,
        lastSeenAt: new Date().toISOString(),
      };
      nextStats.termStats[key] = {
        term:
          currentTerm.term.length >= token.length ? currentTerm.term : token,
        count: currentTerm.count + 1,
        lastSeenAt: new Date().toISOString(),
      };
    }

    const next: AdaptiveStoreState = {
      ...this.cached,
      apps: {
        ...this.cached.apps,
        [appKey]: nextStats,
      },
    };
    this.cached = next;
    await this.persist(next);
    return next;
  }

  private async persist(state: AdaptiveStoreState) {
    await writeTextFileAtomic(
      this.filePath,
      this.encodeContent(JSON.stringify(wrapStoreEnvelope(state), null, 2)),
    );
  }

  private decodeContent(content: string) {
    if (!this.codec?.decryptString) return content;
    try {
      return this.codec.decryptString(content);
    } catch {
      return content;
    }
  }

  private encodeContent(content: string) {
    if (!this.codec?.encryptString || !this.codec.isEncryptionAvailable?.())
      return content;
    try {
      return this.codec.encryptString(content);
    } catch {
      return content;
    }
  }

  private tryParse(content: string | null) {
    if (content == null) return null;

    try {
      const raw = JSON.parse(this.decodeContent(content));
      const envelope = unwrapStoreEnvelope<unknown>(raw);
      return {
        state: parseState(envelope.data),
        needsMigration:
          envelope.version < 1 ||
          (this.codec?.isEncryptionAvailable?.() === true &&
            this.codec?.decryptString !== undefined &&
            this.decodeContent(content) === content),
      };
    } catch {
      return null;
    }
  }
}
