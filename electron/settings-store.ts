import { normalizeHotkeyAccelerator } from "./hotkey-config.js";
import {
  quarantineFile,
  readTextFilePair,
  unwrapStoreEnvelope,
  wrapStoreEnvelope,
  writeTextFileAtomic,
} from "./store-utils.js";

export type ToneMode = "formal" | "casual" | "very-casual";
export type LanguageMode = "pt-BR" | "en-US" | "dual";
export type SttProvider = "azure";
export type HistoryStorageMode = "plain" | "encrypted";
export type PostprocessProfile = "safe" | "balanced" | "aggressive";
export type DualLanguageStrategy = "parallel" | "fallback-on-low-confidence";
export type RewriteMode = "off" | "safe" | "aggressive";
export type LowConfidencePolicy = "paste" | "copy-only" | "review";
export type AppProfileDomain =
  | "general"
  | "work"
  | "support"
  | "medical"
  | "legal"
  | "custom";
export type TranscriptFormatStyle =
  | "message"
  | "paragraph"
  | "bullet-list"
  | "email"
  | "notes"
  | "technical-note";
export type CanonicalTerm = {
  from: string;
  to: string;
  enabled: boolean;
  scope?: "global" | "app" | "language";
  appKeys?: string[];
  confidencePolicy?: "always" | "safe-only";
};
export type InjectionMethod =
  | "target-handle"
  | "foreground-handle"
  | "ctrl-v"
  | "shift-insert";
export type InjectionProfiles = Record<string, InjectionMethod>;
export type AppProfile = {
  injectionMethod?: InjectionMethod;
  languageBias?: "pt-BR" | "en-US" | "mixed";
  postprocessProfile?: PostprocessProfile;
  domain?: AppProfileDomain;
  extraPhrases?: string[];
  formatStyle?: TranscriptFormatStyle;
  rewriteEnabled?: boolean;
  protectedTerms?: string[];
};
export type AppProfiles = Record<string, AppProfile>;

export type AppSettings = {
  hotkeyPrimary: string;
  hotkeyFallback: string;
  autoPasteEnabled: boolean;
  toneMode: ToneMode;
  languageMode: LanguageMode;
  sttProvider: SttProvider;
  extraPhrases: string[];
  canonicalTerms: CanonicalTerm[];
  stopGraceMs: number;
  formatCommandsEnabled: boolean;
  maxSessionSeconds: number;
  historyEnabled: boolean;
  historyRetentionDays: number;
  injectionProfiles: InjectionProfiles;
  privacyMode: boolean;
  historyStorageMode: HistoryStorageMode;
  postprocessProfile: PostprocessProfile;
  dualLanguageStrategy: DualLanguageStrategy;
  rewriteEnabled: boolean;
  rewriteMode: RewriteMode;
  intentDetectionEnabled: boolean;
  protectedTerms: string[];
  lowConfidencePolicy: LowConfidencePolicy;
  adaptiveLearningEnabled: boolean;
  appProfiles: AppProfiles;
};

export const DEFAULT_CANONICAL_TERMS: CanonicalTerm[] = [
  { from: "work space|workspace|work-space", to: "Workspace", enabled: true },
  {
    from: "anti gravity|anti-gravity|antigravity",
    to: "Antigravity",
    enabled: true,
  },
  { from: "googel|gogle|google", to: "Google", enabled: true },
  { from: "ei|hey", to: "Hey!", enabled: true },
];

const DEFAULT_SETTINGS: AppSettings = {
  hotkeyPrimary: "CommandOrControl+Super",
  hotkeyFallback: "CommandOrControl+Super+Space",
  autoPasteEnabled: true,
  toneMode: "casual",
  languageMode: "pt-BR",
  sttProvider: "azure",
  extraPhrases: [],
  canonicalTerms: DEFAULT_CANONICAL_TERMS,
  stopGraceMs: 200,
  formatCommandsEnabled: true,
  maxSessionSeconds: 90,
  historyEnabled: true,
  historyRetentionDays: 30,
  injectionProfiles: {},
  privacyMode: false,
  historyStorageMode: "plain",
  postprocessProfile: "balanced",
  dualLanguageStrategy: "fallback-on-low-confidence",
  rewriteEnabled: true,
  rewriteMode: "safe",
  intentDetectionEnabled: true,
  protectedTerms: [],
  lowConfidencePolicy: "paste",
  adaptiveLearningEnabled: true,
  appProfiles: {},
};

function clampInt(value: unknown, min: number, max: number, fallback: number) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function normalizePhrase(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function parsePhrases(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const phrase = normalizePhrase(item);
    if (!phrase) continue;
    const key = phrase.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(phrase);
  }
  return out;
}

function parseCanonicalTerms(raw: unknown): CanonicalTerm[] {
  if (!Array.isArray(raw)) return [...DEFAULT_CANONICAL_TERMS];
  const out: CanonicalTerm[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const from = normalizePhrase(
      typeof (item as { from?: unknown }).from === "string"
        ? (item as { from: string }).from
        : "",
    );
    const to = normalizePhrase(
      typeof (item as { to?: unknown }).to === "string"
        ? (item as { to: string }).to
        : "",
    );
    if (!from || !to) continue;
    const key = `${from.toLocaleLowerCase()}=>${to.toLocaleLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      from,
      to,
      enabled: (item as { enabled?: unknown }).enabled !== false,
      scope:
        (item as { scope?: unknown }).scope === "app" ||
        (item as { scope?: unknown }).scope === "language"
          ? ((item as { scope: CanonicalTerm["scope"] }).scope ?? "global")
          : "global",
      appKeys: Array.isArray((item as { appKeys?: unknown }).appKeys)
        ? ((item as { appKeys: unknown[] }).appKeys ?? [])
            .filter((entry): entry is string => typeof entry === "string")
            .map((entry) => normalizePhrase(entry).toLocaleLowerCase())
            .filter(Boolean)
            .slice(0, 20)
        : undefined,
      confidencePolicy:
        (item as { confidencePolicy?: unknown }).confidencePolicy ===
        "safe-only"
          ? "safe-only"
          : "always",
    });
  }
  return out;
}

function parseInjectionMethod(value: unknown): InjectionMethod | null {
  if (
    value === "target-handle" ||
    value === "foreground-handle" ||
    value === "ctrl-v" ||
    value === "shift-insert"
  ) {
    return value;
  }
  return null;
}

function parseInjectionProfiles(raw: unknown): InjectionProfiles {
  if (!raw || typeof raw !== "object") return {};
  const input = raw as Record<string, unknown>;
  const out: InjectionProfiles = {};

  for (const [key, value] of Object.entries(input)) {
    const appKey = normalizePhrase(key).toLocaleLowerCase();
    if (!appKey) continue;
    const method = parseInjectionMethod(value);
    if (!method) continue;
    out[appKey] = method;
  }

  return out;
}

function parseSttProvider(value: unknown): SttProvider {
  return "azure";
}

function parseHotkeyAccelerator(value: unknown, fallback: string) {
  if (typeof value !== "string" || !value.trim()) return fallback;
  try {
    return normalizeHotkeyAccelerator(value);
  } catch {
    return fallback;
  }
}

function parseAppProfiles(raw: unknown): AppProfiles {
  if (!raw || typeof raw !== "object") return {};
  const input = raw as Record<string, unknown>;
  const out: AppProfiles = {};
  for (const [key, value] of Object.entries(input)) {
    const appKey = normalizePhrase(key).toLocaleLowerCase();
    if (!appKey || !value || typeof value !== "object") continue;
    const item = value as Record<string, unknown>;
    const injectionMethod = parseInjectionMethod(item.injectionMethod);
    const languageBias =
      item.languageBias === "pt-BR" ||
      item.languageBias === "en-US" ||
      item.languageBias === "mixed"
        ? item.languageBias
        : undefined;
    const postprocessProfile =
      item.postprocessProfile === "safe" ||
      item.postprocessProfile === "balanced" ||
      item.postprocessProfile === "aggressive"
        ? item.postprocessProfile
        : undefined;
    const domain =
      item.domain === "general" ||
      item.domain === "work" ||
      item.domain === "support" ||
      item.domain === "medical" ||
      item.domain === "legal" ||
      item.domain === "custom"
        ? item.domain
        : undefined;
    const formatStyle =
      item.formatStyle === "message" ||
      item.formatStyle === "paragraph" ||
      item.formatStyle === "bullet-list" ||
      item.formatStyle === "email" ||
      item.formatStyle === "notes" ||
      item.formatStyle === "technical-note"
        ? item.formatStyle
        : undefined;
    const rewriteEnabled =
      typeof item.rewriteEnabled === "boolean"
        ? item.rewriteEnabled
        : undefined;
    const extraPhrases = parsePhrases(item.extraPhrases);
    const protectedTerms = parsePhrases(item.protectedTerms);
    out[appKey] = {
      injectionMethod: injectionMethod ?? undefined,
      languageBias,
      postprocessProfile,
      domain,
      extraPhrases,
      formatStyle,
      rewriteEnabled,
      protectedTerms,
    };
  }
  return out;
}

function parseSettings(raw: unknown): AppSettings {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_SETTINGS };
  const obj = raw as Partial<AppSettings>;

  const toneMode: ToneMode =
    obj.toneMode === "formal"
      ? "formal"
      : obj.toneMode === "very-casual"
        ? "very-casual"
        : "casual";
  const languageMode: LanguageMode =
    obj.languageMode === "en-US"
      ? "en-US"
      : obj.languageMode === "dual"
        ? "dual"
        : "pt-BR";
  const historyStorageMode: HistoryStorageMode =
    obj.historyStorageMode === "encrypted" ? "encrypted" : "plain";
  const postprocessProfile: PostprocessProfile =
    obj.postprocessProfile === "safe"
      ? "safe"
      : obj.postprocessProfile === "aggressive"
        ? "aggressive"
        : "balanced";
  const dualLanguageStrategy: DualLanguageStrategy =
    obj.dualLanguageStrategy === "parallel"
      ? "parallel"
      : "fallback-on-low-confidence";
  const rewriteMode: RewriteMode =
    obj.rewriteMode === "off"
      ? "off"
      : obj.rewriteMode === "aggressive"
        ? "aggressive"
        : "safe";
  const lowConfidencePolicy: LowConfidencePolicy =
    obj.lowConfidencePolicy === "paste"
      ? "paste"
      : obj.lowConfidencePolicy === "copy-only"
        ? "copy-only"
        : "review";

  return {
    hotkeyPrimary: parseHotkeyAccelerator(
      obj.hotkeyPrimary,
      DEFAULT_SETTINGS.hotkeyPrimary,
    ),
    hotkeyFallback: parseHotkeyAccelerator(
      obj.hotkeyFallback,
      DEFAULT_SETTINGS.hotkeyFallback,
    ),
    autoPasteEnabled: obj.autoPasteEnabled === true,
    toneMode,
    languageMode,
    sttProvider: parseSttProvider(obj.sttProvider),
    extraPhrases: parsePhrases(obj.extraPhrases),
    canonicalTerms: parseCanonicalTerms(obj.canonicalTerms),
    stopGraceMs: clampInt(
      obj.stopGraceMs,
      0,
      2000,
      DEFAULT_SETTINGS.stopGraceMs,
    ),
    formatCommandsEnabled: obj.formatCommandsEnabled !== false,
    maxSessionSeconds: clampInt(
      obj.maxSessionSeconds,
      30,
      600,
      DEFAULT_SETTINGS.maxSessionSeconds,
    ),
    historyEnabled: obj.historyEnabled !== false,
    historyRetentionDays: clampInt(
      obj.historyRetentionDays,
      1,
      365,
      DEFAULT_SETTINGS.historyRetentionDays,
    ),
    injectionProfiles: parseInjectionProfiles(obj.injectionProfiles),
    privacyMode: obj.privacyMode === true,
    historyStorageMode,
    postprocessProfile,
    dualLanguageStrategy,
    rewriteEnabled: obj.rewriteEnabled !== false,
    rewriteMode,
    intentDetectionEnabled: obj.intentDetectionEnabled !== false,
    protectedTerms: parsePhrases(obj.protectedTerms),
    lowConfidencePolicy,
    adaptiveLearningEnabled: obj.adaptiveLearningEnabled !== false,
    appProfiles: parseAppProfiles(obj.appProfiles),
  };
}

export class SettingsStore {
  private readonly filePath: string;
  private cached: AppSettings = { ...DEFAULT_SETTINGS };

  constructor(filePath: string, defaults?: Partial<AppSettings>) {
    this.filePath = filePath;
    if (defaults) this.cached = { ...this.cached, ...defaults };
  }

  get(): AppSettings {
    return this.cached;
  }

  async load(): Promise<AppSettings> {
    const pair = await readTextFilePair(this.filePath);
    const primary = this.tryParse(pair.primary);
    if (primary) {
      this.cached = primary.settings;
      if (primary.needsMigration) {
        await this.persist(primary.settings);
      }
      return primary.settings;
    }

    const backup = this.tryParse(pair.backup);
    if (backup) {
      this.cached = backup.settings;
      await this.persist(backup.settings);
      return backup.settings;
    }

    if (pair.primary != null) {
      await quarantineFile(this.filePath, "corrupt");
    }

    await this.persist(this.cached);
    return this.cached;
  }

  async update(partial: Partial<AppSettings>): Promise<AppSettings> {
    const next = parseSettings({ ...this.cached, ...partial });
    this.cached = next;
    await this.persist(next);
    return next;
  }

  previewUpdate(partial: Partial<AppSettings>): AppSettings {
    return parseSettings({ ...this.cached, ...partial });
  }

  async replace(next: AppSettings): Promise<AppSettings> {
    const parsed = parseSettings(next);
    this.cached = parsed;
    await this.persist(parsed);
    return parsed;
  }

  private async persist(settings: AppSettings): Promise<void> {
    await writeTextFileAtomic(
      this.filePath,
      JSON.stringify(wrapStoreEnvelope(settings), null, 2),
    );
  }

  private tryParse(content: string | null) {
    if (content == null) return null;

    try {
      const raw = JSON.parse(content);
      const envelope = unwrapStoreEnvelope<unknown>(raw);
      return {
        settings: parseSettings({
          ...this.cached,
          ...((envelope.data ?? {}) as object),
        }),
        needsMigration: envelope.version < 1,
      };
    } catch {
      return null;
    }
  }
}
