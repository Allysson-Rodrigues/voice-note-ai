export type CanonicalTerm = {
  from: string;
  to: string;
  enabled: boolean;
  scope?: 'global' | 'app' | 'language';
  appKeys?: string[];
  confidencePolicy?: 'always' | 'safe-only';
};

export type ToneMode = 'formal' | 'casual' | 'very-casual';
export type PostprocessProfile = 'safe' | 'balanced' | 'aggressive';

export type TranscriptPostprocessOptions = {
  toneMode: ToneMode;
  canonicalTerms: CanonicalTerm[];
  formatCommandsEnabled?: boolean;
  profile?: PostprocessProfile;
  appKey?: string | null;
};

export type TranscriptPostprocessDebug = {
  normalizedText: string;
  finalText: string;
  appliedRules: string[];
};

const WORD_BOUNDARY_LEFT = '(?<![A-Za-z0-9_])';
const WORD_BOUNDARY_RIGHT = '(?![A-Za-z0-9_])';
const WORD_REGEX_FLAGS = 'gi';
const LETTER_SEQ_RE = /[A-Za-z]+/;
const PUNCT_SYMBOL_RE = /^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g;
const UPPER_RE = /[A-Z]/;
const LOWER_RE = /[a-z]/;

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeWhitespace(value: string) {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\s+([,.;!?])/g, '$1')
    .trim();
}

function capitalizeFirst(value: string) {
  if (!value) return value;
  return value.charAt(0).toLocaleUpperCase() + value.slice(1);
}

function shouldPreserveCase(token: string) {
  const cleaned = token.replace(PUNCT_SYMBOL_RE, '');
  if (cleaned.length <= 1) return false;
  const hasUpper = UPPER_RE.test(cleaned);
  const hasLower = LOWER_RE.test(cleaned);
  if (hasUpper && !hasLower) return true;
  if (UPPER_RE.test(cleaned.slice(1))) return true;
  return false;
}

function lowerFirstPreserveCase(value: string) {
  if (!value) return value;
  const match = value.match(LETTER_SEQ_RE);
  if (!match || match.index == null) return value;
  if (shouldPreserveCase(match[0])) return value;
  const index = match.index;
  const token = match[0];
  return (
    value.slice(0, index) +
    token.charAt(0).toLocaleLowerCase() +
    token.slice(1) +
    value.slice(index + token.length)
  );
}

function commandRegex(pattern: string) {
  return new RegExp(`${WORD_BOUNDARY_LEFT}(?:${pattern})${WORD_BOUNDARY_RIGHT}`, WORD_REGEX_FLAGS);
}

function formatCommandHintRegex() {
  return new RegExp(
    [
      'nova\\s+linha',
      'new\\s+line',
      'bullet\\s+point',
      'bullet',
      't[oó]pico',
      'topico',
      'item\\s+\\d{1,2}',
      'n[uú]mero\\s+\\d{1,2}',
      'numero\\s+\\d{1,2}',
      'number\\s+\\d{1,2}',
      'vírgula',
      'virgula',
      'ponto\\s+e\\s+vírgula',
      'ponto\\s+e\\s+virgula',
      'dois\\s+pontos',
      'ponto\\s+final',
      'ponto',
      'ponto\\s+de\\s+interrogação',
      'ponto\\s+de\\s+interrogacao',
      'interrogação',
      'interrogacao',
      'ponto\\s+de\\s+exclamação',
      'ponto\\s+de\\s+exclamacao',
      'exclamação',
      'exclamacao',
      'reticências',
      'reticencias',
      'abre\\s+par[êe]nteses',
      'fecha\\s+par[êe]nteses',
      'abre\\s+aspas',
      'fecha\\s+aspas',
      'abre\\s+colchetes?',
      'fecha\\s+colchetes?',
      'travess[aã]o',
    ].join('|'),
    'i',
  );
}

const FORMAT_COMMAND_HINT_RE = formatCommandHintRegex();

function normalizePunctuationSpacing(value: string) {
  let next = value;
  next = next.replace(/\s+([,.;:!?])/g, '$1');
  next = next.replace(/([,.;:!?])(?!\s|\n|$)/g, '$1 ');
  next = next.replace(/\(\s+/g, '(').replace(/\s+\)/g, ')');
  next = next.replace(/\[\s+/g, '[').replace(/\s+\]/g, ']');
  next = next.replace(/\{\s+/g, '{').replace(/\s+\}/g, '}');
  next = next.replace(/\s*—\s*/g, ' — ');
  next = next.replace(/\n[ \t]*/g, '\n');
  next = next.replace(/(^|\n)•(?!\s)/g, '$1• ');
  next = next.replace(/(^|\n)(\d+\.)\s*/g, '$1$2 ');
  next = next.replace(/\n{2,}/g, '\n');
  return normalizeWhitespace(next);
}

function applyCanonicalReplacements(
  value: string,
  canonicalTerms: CanonicalTerm[],
  opts: { appKey?: string | null; profile: PostprocessProfile; appliedRules: string[] },
) {
  let next = value;
  for (const term of canonicalTerms) {
    if (!term.enabled) continue;
    if (term.scope === 'app' && term.appKeys?.length) {
      const normalizedAppKey = opts.appKey?.trim().toLowerCase();
      if (!normalizedAppKey || !term.appKeys.includes(normalizedAppKey)) continue;
    }
    if (term.confidencePolicy === 'safe-only' && opts.profile === 'aggressive') continue;
    const target = normalizeWhitespace(term.to);
    if (!target) continue;
    const alternatives = String(term.from ?? '')
      .split('|')
      .map((entry) => normalizeWhitespace(entry))
      .filter(Boolean);
    for (const alternative of alternatives) {
      const hasTerminalBang = target.endsWith('!');
      const core = escapeRegExp(alternative);
      const boundary = `${WORD_BOUNDARY_LEFT}${core}${WORD_BOUNDARY_RIGHT}`;
      const pattern = hasTerminalBang
        ? new RegExp(`${boundary}(?!\\!)`, WORD_REGEX_FLAGS)
        : new RegExp(boundary, WORD_REGEX_FLAGS);
      const replaced = next.replace(pattern, target);
      if (replaced !== next) {
        opts.appliedRules.push(`canonical:${target}`);
      }
      next = replaced;
    }
  }
  return next;
}

function applyExplicitFormattingCommands(value: string, appliedRules: string[]) {
  let next = value;
  if (!FORMAT_COMMAND_HINT_RE.test(next)) {
    return normalizePunctuationSpacing(next);
  }
  appliedRules.push('format:commands');
  next = next.replace(commandRegex('nova\\s+linha|new\\s+line'), '\n');
  next = next.replace(commandRegex('bullet\\s+point|bullet|t[oó]pico|topico'), '\n•');
  next = next.replace(
    commandRegex('(?:item|n[uú]mero|numero|number)\\s+(\\d{1,2})'),
    (_entry, n: string) => `\n${n}.`,
  );

  // PT-BR punctuation commands (explicit)
  next = next.replace(commandRegex('vírgula|virgula'), ',');
  next = next.replace(commandRegex('ponto\\s+e\\s+vírgula|ponto\\s+e\\s+virgula'), ';');
  next = next.replace(commandRegex('dois\\s+pontos'), ':');
  next = next.replace(commandRegex('ponto\\s+final'), '.');
  next = next.replace(
    commandRegex('interrogação|interrogacao|ponto\\s+de\\s+interrogação|ponto\\s+de\\s+interrogacao'),
    '?',
  );
  next = next.replace(
    commandRegex('exclamação|exclamacao|ponto\\s+de\\s+exclamação|ponto\\s+de\\s+exclamacao'),
    '!',
  );
  next = next.replace(commandRegex('reticências|reticencias'), '...');
  next = next.replace(commandRegex('ponto'), '.');

  // Parentheses / quotes
  next = next.replace(commandRegex('abre\\s+par[êe]nteses'), '(');
  next = next.replace(commandRegex('fecha\\s+par[êe]nteses'), ')');
  next = next.replace(commandRegex('abre\\s+aspas'), '"');
  next = next.replace(commandRegex('fecha\\s+aspas'), '"');
  next = next.replace(commandRegex('abre\\s+colchetes?'), '[');
  next = next.replace(commandRegex('fecha\\s+colchetes?'), ']');
  next = next.replace(commandRegex('travess[aã]o'), ' — ');
  return normalizePunctuationSpacing(next);
}

function applyToneProfile(value: string, toneMode: ToneMode) {
  if (toneMode === 'formal') {
    return value
      .replace(/\b(vc|vcs)\b/gi, (entry) => (entry.toLowerCase() === 'vcs' ? 'vocês' : 'você'))
      .replace(/\b(pra)\b/gi, 'para')
      .replace(/\b(tá)\b/gi, 'está')
      .replace(/\b(to|tô)\b/gi, 'estou')
      .replace(/\b(ta)\b/gi, 'está')
      .replace(/\b(não tá)\b/gi, 'não está')
      .replace(/\b(cê)\b/gi, 'você');
  }
  if (toneMode === 'very-casual') {
    return value.replace(/você/gi, 'vc').replace(/para/gi, 'pra').replace(/está/gi, 'tá');
  }
  return value;
}

function punctuateLine(value: string, toneMode: ToneMode) {
  if (!value) return '';

  if (toneMode === 'very-casual') {
    return lowerFirstPreserveCase(value).replace(/[.]+$/g, '');
  }

  const capped = capitalizeFirst(value);
  if (/[.!?…]$/.test(capped)) return capped;
  if (toneMode === 'formal') return `${capped}.`;
  return capped;
}

function applyFinalPunctuation(value: string, toneMode: ToneMode) {
  if (!value) return '';
  if (!value.includes('\n')) return punctuateLine(value, toneMode);

  return value
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return '';
      if (/^(•|\d+\.)\s+/.test(trimmed)) return trimmed;
      return punctuateLine(trimmed, toneMode);
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function applyTranscriptPostprocess(rawText: string, options: TranscriptPostprocessOptions) {
  return inspectTranscriptPostprocess(rawText, options).finalText;
}

export function inspectTranscriptPostprocess(
  rawText: string,
  options: TranscriptPostprocessOptions,
): TranscriptPostprocessDebug {
  const normalized = normalizeWhitespace(rawText);
  if (!normalized) {
    return {
      normalizedText: '',
      finalText: '',
      appliedRules: [],
    };
  }

  const appliedRules: string[] = ['normalize:whitespace'];
  const withCanonical = applyCanonicalReplacements(normalized, options.canonicalTerms, {
    appKey: options.appKey,
    profile: options.profile ?? 'balanced',
    appliedRules,
  });
  const withCommands =
    options.formatCommandsEnabled === false
      ? withCanonical
      : applyExplicitFormattingCommands(withCanonical, appliedRules);
  const toned = normalizeWhitespace(applyToneProfile(withCommands, options.toneMode));
  if (toned !== withCommands) {
    appliedRules.push(`tone:${options.toneMode}`);
  }
  const finalText = applyFinalPunctuation(toned, options.toneMode);
  if (finalText !== toned) {
    appliedRules.push('final:punctuation');
  }
  return {
    normalizedText: normalized,
    finalText,
    appliedRules,
  };
}
