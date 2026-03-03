import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export type ToneMode = 'formal' | 'casual' | 'very-casual';
export type LanguageMode = 'pt-BR' | 'en-US' | 'dual';
export type CanonicalTerm = {
  from: string;
  to: string;
  enabled: boolean;
};
export type InjectionMethod = 'target-handle' | 'foreground-handle' | 'ctrl-v' | 'shift-insert';
export type InjectionProfiles = Record<string, InjectionMethod>;

export type AppSettings = {
  autoPasteEnabled: boolean;
  toneMode: ToneMode;
  languageMode: LanguageMode;
  extraPhrases: string[];
  canonicalTerms: CanonicalTerm[];
  stopGraceMs: number;
  formatCommandsEnabled: boolean;
  maxSessionSeconds: number;
  historyEnabled: boolean;
  historyRetentionDays: number;
  injectionProfiles: InjectionProfiles;
};

export const DEFAULT_CANONICAL_TERMS: CanonicalTerm[] = [
  { from: 'work space|workspace|work-space', to: 'Workspace', enabled: true },
  { from: 'anti gravity|anti-gravity|antigravity', to: 'Antigravity', enabled: true },
  { from: 'googel|gogle|google', to: 'Google', enabled: true },
  { from: 'ei|hey', to: 'Hey!', enabled: true },
];

const DEFAULT_SETTINGS: AppSettings = {
  autoPasteEnabled: false,
  toneMode: 'casual',
  languageMode: 'pt-BR',
  extraPhrases: [],
  canonicalTerms: DEFAULT_CANONICAL_TERMS,
  stopGraceMs: 200,
  formatCommandsEnabled: true,
  maxSessionSeconds: 90,
  historyEnabled: true,
  historyRetentionDays: 30,
  injectionProfiles: {},
};

function clampInt(value: unknown, min: number, max: number, fallback: number) {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function normalizePhrase(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function parsePhrases(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== 'string') continue;
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
    if (!item || typeof item !== 'object') continue;
    const from = normalizePhrase(
      typeof (item as { from?: unknown }).from === 'string' ? (item as { from: string }).from : '',
    );
    const to = normalizePhrase(
      typeof (item as { to?: unknown }).to === 'string' ? (item as { to: string }).to : '',
    );
    if (!from || !to) continue;
    const key = `${from.toLocaleLowerCase()}=>${to.toLocaleLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      from,
      to,
      enabled: (item as { enabled?: unknown }).enabled !== false,
    });
  }
  return out;
}

function parseInjectionMethod(value: unknown): InjectionMethod | null {
  if (
    value === 'target-handle' ||
    value === 'foreground-handle' ||
    value === 'ctrl-v' ||
    value === 'shift-insert'
  ) {
    return value;
  }
  return null;
}

function parseInjectionProfiles(raw: unknown): InjectionProfiles {
  if (!raw || typeof raw !== 'object') return {};
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

function parseSettings(raw: unknown): AppSettings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SETTINGS };
  const obj = raw as Partial<AppSettings>;

  const toneMode: ToneMode =
    obj.toneMode === 'formal'
      ? 'formal'
      : obj.toneMode === 'very-casual'
        ? 'very-casual'
        : 'casual';
  const languageMode: LanguageMode =
    obj.languageMode === 'en-US' ? 'en-US' : obj.languageMode === 'dual' ? 'dual' : 'pt-BR';

  return {
    autoPasteEnabled: obj.autoPasteEnabled === true,
    toneMode,
    languageMode,
    extraPhrases: parsePhrases(obj.extraPhrases),
    canonicalTerms: parseCanonicalTerms(obj.canonicalTerms),
    stopGraceMs: clampInt(obj.stopGraceMs, 0, 2000, DEFAULT_SETTINGS.stopGraceMs),
    formatCommandsEnabled: obj.formatCommandsEnabled !== false,
    maxSessionSeconds: clampInt(obj.maxSessionSeconds, 30, 600, DEFAULT_SETTINGS.maxSessionSeconds),
    historyEnabled: obj.historyEnabled !== false,
    historyRetentionDays: clampInt(
      obj.historyRetentionDays,
      1,
      365,
      DEFAULT_SETTINGS.historyRetentionDays,
    ),
    injectionProfiles: parseInjectionProfiles(obj.injectionProfiles),
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
    try {
      const content = await readFile(this.filePath, 'utf8');
      const parsed = parseSettings(JSON.parse(content));
      this.cached = parsed;
      // Self-heal any malformed file on read.
      await this.persist(parsed);
      return parsed;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT' || error instanceof SyntaxError) {
        await this.persist(this.cached);
        return this.cached;
      }
      throw error;
    }
  }

  async update(partial: Partial<AppSettings>): Promise<AppSettings> {
    const next = parseSettings({ ...this.cached, ...partial });
    this.cached = next;
    await this.persist(next);
    return next;
  }

  private async persist(settings: AppSettings): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(settings, null, 2), 'utf8');
  }
}
