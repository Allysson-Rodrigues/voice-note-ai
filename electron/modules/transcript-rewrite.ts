import type { ToneMode } from "../settings-store.js";
import type { TranscriptIntent } from "./transcript-intent.js";

export type RewriteRequest = {
  rawText: string;
  intent: TranscriptIntent;
  language: "pt-BR" | "en-US";
  appKey?: string | null;
  protectedTerms: string[];
  toneMode: ToneMode;
};

export type RewriteResult = {
  text: string;
  changed: boolean;
  risk: "low" | "medium" | "high";
  notes?: string[];
};

function normalizeWhitespace(value: string) {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();
}

function capitalizeFirst(value: string) {
  return value ? value.charAt(0).toLocaleUpperCase() + value.slice(1) : value;
}

function protectTerms(text: string, protectedTerms: string[]) {
  const replacements = new Map<string, string>();
  let next = text;

  protectedTerms.forEach((term, index) => {
    const clean = normalizeWhitespace(term);
    if (!clean) return;
    const token = `__TERM_${index}__`;
    const escaped = clean.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    next = next.replace(new RegExp(escaped, "gi"), token);
    replacements.set(token, clean);
  });

  return {
    text: next,
    restore(value: string) {
      let restored = value;
      for (const [token, term] of replacements.entries()) {
        restored = restored.replace(new RegExp(token, "g"), term);
      }
      return restored;
    },
  };
}

function rewriteBulletList(text: string) {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const trimmed = line.replace(/^(?:[-*•]\s*|\d+\.\s*)/, "");
      return `• ${trimmed}`;
    })
    .join("\n");
}

function rewriteNumberedList(text: string) {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const trimmed = line.replace(/^(?:[-*•]\s*|\d+\.\s*)/, "");
      return `${index + 1}. ${trimmed}`;
    })
    .join("\n");
}

function rewriteEmail(
  text: string,
  language: "pt-BR" | "en-US",
  toneMode: ToneMode,
) {
  const compact = normalizeWhitespace(text);
  const intro =
    language === "pt-BR"
      ? toneMode === "formal"
        ? "Olá,"
        : "Oi,"
      : toneMode === "formal"
        ? "Hello,"
        : "Hi,";
  if (/^(ol[aá]|oi|hello|hi|prezado|prezada)/i.test(compact)) {
    return compact.replace(/\.\s+/g, ".\n\n");
  }
  return `${intro}\n\n${compact.replace(/\.\s+/g, ".\n\n")}`;
}

function rewriteChat(text: string, toneMode: ToneMode) {
  const compact = normalizeWhitespace(text);
  if (toneMode === "formal") return capitalizeFirst(compact);
  return compact;
}

function rewriteTechnicalNote(text: string) {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

export function rewriteTranscript(request: RewriteRequest): RewriteResult {
  const normalized = normalizeWhitespace(request.rawText);
  if (!normalized) {
    return { text: "", changed: false, risk: "low", notes: ["empty-input"] };
  }

  const protectedText = protectTerms(normalized, request.protectedTerms);
  let rewritten = protectedText.text;
  const notes: string[] = [];

  switch (request.intent) {
    case "bullet-list":
      rewritten = rewriteBulletList(rewritten);
      notes.push("structured:bullet-list");
      break;
    case "numbered-list":
      rewritten = rewriteNumberedList(rewritten);
      notes.push("structured:numbered-list");
      break;
    case "email":
      rewritten = rewriteEmail(rewritten, request.language, request.toneMode);
      notes.push("structured:email");
      break;
    case "chat":
      rewritten = rewriteChat(rewritten, request.toneMode);
      notes.push("structured:chat");
      break;
    case "technical-note":
      rewritten = rewriteTechnicalNote(rewritten);
      notes.push("structured:technical-note");
      break;
    default:
      rewritten = normalized;
  }

  rewritten = protectedText.restore(rewritten);
  rewritten = normalizeWhitespace(rewritten);

  const lengthDelta = Math.abs(rewritten.length - normalized.length);
  const risk =
    lengthDelta > Math.max(24, normalized.length * 0.28) ? "medium" : "low";
  return {
    text: rewritten,
    changed: rewritten !== normalized,
    risk,
    notes,
  };
}
