import type {
    AppProfile,
    AppSettings,
    CanonicalTerm,
    DualLanguageStrategy,
    HistoryStorageMode,
    PostprocessProfile,
    ToneMode,
} from './settings-store.js';

const MAX_SESSION_ID_LENGTH = 120;
const MAX_PCM_CHUNK_BYTES = 64 * 1024;
const MIN_AUDIO_CHUNK_INTERVAL_MS = 4;

type DictUpdatePayload = { id: string; term?: string; hintPt?: string; enabled?: boolean };
type DictAddPayload = { term: string; hintPt?: string };
type HistoryListPayload = { query?: string; limit?: number; offset?: number };
type HistoryClearPayload = { before?: string };
type SttStartPayload = { sessionId: string; language?: 'pt-BR' | 'en-US' };
type SttAudioPayload = { sessionId: string; pcm16kMonoInt16: ArrayBuffer | Uint8Array };
type SttStopPayload = { sessionId: string };

function assertObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} invalido.`);
  }
  return value as Record<string, unknown>;
}

function rejectUnknownKeys(value: Record<string, unknown>, allowedKeys: string[], label: string) {
  for (const key of Object.keys(value)) {
    if (!allowedKeys.includes(key)) {
      throw new Error(`${label} contem campo nao permitido: ${key}.`);
    }
  }
}

function parseBoolean(value: unknown, label: string) {
  if (typeof value !== 'boolean') throw new Error(`${label} deve ser boolean.`);
  return value;
}

function parseString(value: unknown, label: string, options?: { maxLength?: number; allowEmpty?: boolean }) {
  if (typeof value !== 'string') throw new Error(`${label} deve ser string.`);
  const trimmed = value.trim();
  if (!options?.allowEmpty && !trimmed) throw new Error(`${label} nao pode ser vazio.`);
  if (options?.maxLength && trimmed.length > options.maxLength) {
    throw new Error(`${label} excede o limite de tamanho.`);
  }
  return trimmed;
}

function parseOptionalString(value: unknown, label: string, options?: { maxLength?: number }) {
  if (value == null) return undefined;
  return parseString(value, label, { maxLength: options?.maxLength, allowEmpty: true });
}

function parseNumber(value: unknown, label: string, min: number, max: number) {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} deve ser numero.`);
  const rounded = Math.round(parsed);
  if (rounded < min || rounded > max) throw new Error(`${label} fora do intervalo permitido.`);
  return rounded;
}

function parseCanonicalTerm(value: unknown): CanonicalTerm {
  const obj = assertObject(value, 'canonicalTerm');
  rejectUnknownKeys(obj, ['from', 'to', 'enabled', 'scope', 'appKeys', 'confidencePolicy'], 'canonicalTerm');
  return {
    from: parseString(obj.from, 'canonicalTerm.from', { maxLength: 240 }),
    to: parseString(obj.to, 'canonicalTerm.to', { maxLength: 240 }),
    enabled: obj.enabled === undefined ? true : parseBoolean(obj.enabled, 'canonicalTerm.enabled'),
    scope:
      obj.scope === 'app' || obj.scope === 'language' || obj.scope === 'global' ? obj.scope : 'global',
    appKeys: Array.isArray(obj.appKeys)
      ? obj.appKeys
          .filter((item): item is string => typeof item === 'string')
          .map((item) => item.trim().toLowerCase())
          .filter(Boolean)
          .slice(0, 20)
      : undefined,
    confidencePolicy:
      obj.confidencePolicy === 'safe-only' || obj.confidencePolicy === 'always'
        ? obj.confidencePolicy
        : 'always',
  };
}

function parseStringList(value: unknown, label: string, maxItems: number, maxLength: number) {
  if (!Array.isArray(value)) throw new Error(`${label} deve ser lista.`);
  const normalized = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
  if (normalized.length > maxItems) throw new Error(`${label} excede a quantidade permitida.`);
  for (const entry of normalized) {
    if (entry.length > maxLength) throw new Error(`${label} contem item muito longo.`);
  }
  return normalized;
}

function parseAppProfiles(value: unknown): Record<string, AppProfile> {
  if (value == null) return {};
  const obj = assertObject(value, 'appProfiles');
  const out: Record<string, AppProfile> = {};
  for (const [key, rawProfile] of Object.entries(obj)) {
    if (!key.trim()) continue;
    const profile = assertObject(rawProfile, `appProfiles.${key}`);
    rejectUnknownKeys(profile, ['injectionMethod', 'languageBias', 'postprocessProfile'], `appProfiles.${key}`);
    out[key.trim().toLowerCase()] = {
      injectionMethod:
        profile.injectionMethod === 'target-handle' ||
        profile.injectionMethod === 'foreground-handle' ||
        profile.injectionMethod === 'ctrl-v' ||
        profile.injectionMethod === 'shift-insert'
          ? profile.injectionMethod
          : undefined,
      languageBias:
        profile.languageBias === 'pt-BR' ||
        profile.languageBias === 'en-US' ||
        profile.languageBias === 'mixed'
          ? profile.languageBias
          : undefined,
      postprocessProfile:
        profile.postprocessProfile === 'safe' ||
        profile.postprocessProfile === 'balanced' ||
        profile.postprocessProfile === 'aggressive'
          ? profile.postprocessProfile
          : undefined,
    };
  }
  return out;
}

export function validateSettingsUpdate(payload: unknown): Partial<AppSettings> {
  const obj = assertObject(payload, 'settings:update');
  rejectUnknownKeys(
    obj,
    [
      'autoPasteEnabled',
      'toneMode',
      'languageMode',
      'sttProvider',
      'extraPhrases',
      'canonicalTerms',
      'stopGraceMs',
      'formatCommandsEnabled',
      'maxSessionSeconds',
      'historyEnabled',
      'historyRetentionDays',
      'privacyMode',
      'historyStorageMode',
      'postprocessProfile',
      'dualLanguageStrategy',
      'appProfiles',
    ],
    'settings:update',
  );

  const out: Partial<AppSettings> = {};
  if ('autoPasteEnabled' in obj) out.autoPasteEnabled = parseBoolean(obj.autoPasteEnabled, 'autoPasteEnabled');
  if ('toneMode' in obj) {
    const mode = obj.toneMode;
    if (mode !== 'formal' && mode !== 'casual' && mode !== 'very-casual') {
      throw new Error('toneMode invalido.');
    }
    out.toneMode = mode as ToneMode;
  }
  if ('languageMode' in obj) {
    const mode = obj.languageMode;
    if (mode !== 'pt-BR' && mode !== 'en-US' && mode !== 'dual') {
      throw new Error('languageMode invalido.');
    }
    out.languageMode = mode;
  }
  if ('sttProvider' in obj && obj.sttProvider !== 'azure') {
    throw new Error('sttProvider invalido.');
  }
  if ('sttProvider' in obj) out.sttProvider = 'azure';
  if ('extraPhrases' in obj) out.extraPhrases = parseStringList(obj.extraPhrases, 'extraPhrases', 200, 120);
  if ('canonicalTerms' in obj) {
    if (!Array.isArray(obj.canonicalTerms)) throw new Error('canonicalTerms deve ser lista.');
    out.canonicalTerms = obj.canonicalTerms.map((item) => parseCanonicalTerm(item));
  }
  if ('stopGraceMs' in obj) out.stopGraceMs = parseNumber(obj.stopGraceMs, 'stopGraceMs', 0, 2000);
  if ('formatCommandsEnabled' in obj) {
    out.formatCommandsEnabled = parseBoolean(obj.formatCommandsEnabled, 'formatCommandsEnabled');
  }
  if ('maxSessionSeconds' in obj) {
    out.maxSessionSeconds = parseNumber(obj.maxSessionSeconds, 'maxSessionSeconds', 30, 600);
  }
  if ('historyEnabled' in obj) out.historyEnabled = parseBoolean(obj.historyEnabled, 'historyEnabled');
  if ('historyRetentionDays' in obj) {
    out.historyRetentionDays = parseNumber(obj.historyRetentionDays, 'historyRetentionDays', 1, 365);
  }
  if ('privacyMode' in obj) out.privacyMode = parseBoolean(obj.privacyMode, 'privacyMode');
  if ('historyStorageMode' in obj) {
    const mode = obj.historyStorageMode;
    if (mode !== 'plain' && mode !== 'encrypted') throw new Error('historyStorageMode invalido.');
    out.historyStorageMode = mode as HistoryStorageMode;
  }
  if ('postprocessProfile' in obj) {
    const profile = obj.postprocessProfile;
    if (profile !== 'safe' && profile !== 'balanced' && profile !== 'aggressive') {
      throw new Error('postprocessProfile invalido.');
    }
    out.postprocessProfile = profile as PostprocessProfile;
  }
  if ('dualLanguageStrategy' in obj) {
    const strategy = obj.dualLanguageStrategy;
    if (strategy !== 'parallel' && strategy !== 'fallback-on-low-confidence') {
      throw new Error('dualLanguageStrategy invalido.');
    }
    out.dualLanguageStrategy = strategy as DualLanguageStrategy;
  }
  if ('appProfiles' in obj) out.appProfiles = parseAppProfiles(obj.appProfiles);
  return out;
}

export function validateAutoPastePayload(payload: unknown) {
  const obj = assertObject(payload, 'settings:autoPaste');
  rejectUnknownKeys(obj, ['enabled'], 'settings:autoPaste');
  return { enabled: parseBoolean(obj.enabled, 'enabled') };
}

export function validateTonePayload(payload: unknown) {
  const obj = assertObject(payload, 'settings:tone');
  rejectUnknownKeys(obj, ['mode'], 'settings:tone');
  const mode = obj.mode;
  if (mode !== 'formal' && mode !== 'casual' && mode !== 'very-casual') {
    throw new Error('mode invalido.');
  }
  return { mode };
}

export function validateDictionaryAddPayload(payload: unknown): DictAddPayload {
  const obj = assertObject(payload, 'dictionary:add');
  rejectUnknownKeys(obj, ['term', 'hintPt'], 'dictionary:add');
  return {
    term: parseString(obj.term, 'term', { maxLength: 240 }),
    hintPt: parseOptionalString(obj.hintPt, 'hintPt', { maxLength: 240 }),
  };
}

export function validateDictionaryUpdatePayload(payload: unknown): DictUpdatePayload {
  const obj = assertObject(payload, 'dictionary:update');
  rejectUnknownKeys(obj, ['id', 'term', 'hintPt', 'enabled'], 'dictionary:update');
  return {
    id: parseString(obj.id, 'id', { maxLength: 120 }),
    term: obj.term === undefined ? undefined : parseString(obj.term, 'term', { maxLength: 240 }),
    hintPt: parseOptionalString(obj.hintPt, 'hintPt', { maxLength: 240 }),
    enabled: obj.enabled === undefined ? undefined : parseBoolean(obj.enabled, 'enabled'),
  };
}

export function validateIdPayload(payload: unknown, label: string) {
  const obj = assertObject(payload, label);
  rejectUnknownKeys(obj, ['id'], label);
  return { id: parseString(obj.id, `${label}.id`, { maxLength: 120 }) };
}

export function validateHistoryListPayload(payload: unknown): HistoryListPayload {
  if (payload == null) return {};
  const obj = assertObject(payload, 'history:list');
  rejectUnknownKeys(obj, ['query', 'limit', 'offset'], 'history:list');
  return {
    query: obj.query === undefined ? undefined : parseOptionalString(obj.query, 'query', { maxLength: 240 }),
    limit: obj.limit === undefined ? undefined : parseNumber(obj.limit, 'limit', 1, 500),
    offset: obj.offset === undefined ? undefined : parseNumber(obj.offset, 'offset', 0, 100000),
  };
}

export function validateHistoryClearPayload(payload: unknown): HistoryClearPayload {
  if (payload == null) return {};
  const obj = assertObject(payload, 'history:clear');
  rejectUnknownKeys(obj, ['before'], 'history:clear');
  const before = obj.before === undefined ? undefined : parseOptionalString(obj.before, 'before', { maxLength: 60 });
  return { before };
}

export function validateSttStartPayload(payload: unknown): SttStartPayload {
  const obj = assertObject(payload, 'stt:start');
  rejectUnknownKeys(obj, ['sessionId', 'language'], 'stt:start');
  const sessionId = parseString(obj.sessionId, 'sessionId', { maxLength: MAX_SESSION_ID_LENGTH });
  const language = obj.language;
  if (language !== undefined && language !== 'pt-BR' && language !== 'en-US') {
    throw new Error('language invalido.');
  }
  return { sessionId, language };
}

export function validateSttAudioPayload(payload: unknown): SttAudioPayload {
  const obj = assertObject(payload, 'stt:audio');
  rejectUnknownKeys(obj, ['sessionId', 'pcm16kMonoInt16'], 'stt:audio');
  const sessionId = parseString(obj.sessionId, 'sessionId', { maxLength: MAX_SESSION_ID_LENGTH });
  if (!(obj.pcm16kMonoInt16 instanceof ArrayBuffer) && !ArrayBuffer.isView(obj.pcm16kMonoInt16)) {
    throw new Error('pcm16kMonoInt16 deve ser ArrayBuffer ou TypedArray.');
  }
  const payloadData = obj.pcm16kMonoInt16 as ArrayBuffer | Uint8Array;
  if (payloadData.byteLength <= 0 || payloadData.byteLength > MAX_PCM_CHUNK_BYTES) {
    throw new Error('pcm16kMonoInt16 fora do limite permitido.');
  }
  return {
    sessionId,
    pcm16kMonoInt16: payloadData,
  };
}

export function validateSttStopPayload(payload: unknown): SttStopPayload {
  const obj = assertObject(payload, 'stt:stop');
  rejectUnknownKeys(obj, ['sessionId'], 'stt:stop');
  return {
    sessionId: parseString(obj.sessionId, 'sessionId', { maxLength: MAX_SESSION_ID_LENGTH }),
  };
}

export { MAX_PCM_CHUNK_BYTES, MIN_AUDIO_CHUNK_INTERVAL_MS };
