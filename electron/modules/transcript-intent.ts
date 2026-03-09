import type { TranscriptFormatStyle } from "../settings-store.js";

export type TranscriptIntent =
  | "free-text"
  | "bullet-list"
  | "numbered-list"
  | "email"
  | "chat"
  | "technical-note";

type ClassifyTranscriptIntentOptions = {
  appKey?: string | null;
  formatStyle?: TranscriptFormatStyle;
};

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

const BULLET_HINT_RE =
  /\b(?:bullet(?:\s+point)?|t[oó]pico|topico|lista|list(?:a)?|primeiro|segundo|terceiro)\b/i;
const NUMBERED_HINT_RE = /\b(?:item|n[uú]mero|numero|passo|step)\s+\d{1,2}\b/i;
const EMAIL_HINT_RE =
  /\b(?:assunto|subject|atenciosamente|att|prezado|ol[aá]\s+time|ol[aá]\s+pessoal)\b/i;
const CHAT_HINT_RE =
  /\b(?:oi|ola|olá|bom dia|boa tarde|boa noite|blz|beleza|valeu)\b/i;
const TECHNICAL_HINT_RE =
  /\b(?:api|json|http|https|sql|typescript|javascript|react|electron|azure|prompt|regex|sdk)\b/i;

function inferFromFormatStyle(
  formatStyle?: TranscriptFormatStyle,
): TranscriptIntent | null {
  if (formatStyle === "bullet-list" || formatStyle === "notes")
    return "bullet-list";
  if (formatStyle === "email") return "email";
  if (formatStyle === "message") return "chat";
  if (formatStyle === "technical-note") return "technical-note";
  if (formatStyle === "paragraph") return "free-text";
  return null;
}

export function classifyTranscriptIntent(
  rawText: string,
  options: ClassifyTranscriptIntentOptions = {},
): TranscriptIntent {
  const explicit = inferFromFormatStyle(options.formatStyle);
  if (explicit) return explicit;

  const normalized = normalizeWhitespace(rawText).toLowerCase();
  if (!normalized) return "free-text";

  if (EMAIL_HINT_RE.test(normalized)) return "email";
  if (NUMBERED_HINT_RE.test(normalized)) return "numbered-list";
  if (BULLET_HINT_RE.test(normalized)) return "bullet-list";

  const appKey = options.appKey?.toLowerCase() ?? "";
  if (
    /(slack|discord|whatsapp|telegram|teams|skype)/.test(appKey) ||
    CHAT_HINT_RE.test(normalized)
  ) {
    return "chat";
  }

  if (
    /(vscode|code|cursor|terminal|powershell|cmd|warp)/.test(appKey) ||
    TECHNICAL_HINT_RE.test(normalized)
  ) {
    return "technical-note";
  }

  if (normalized.length <= 90 && !/[.!?]/.test(normalized)) {
    return "chat";
  }

  return "free-text";
}
