import type { CanonicalTerm } from "@/electron";

export type ToneMode = "formal" | "casual" | "very-casual";

export type TranscriptPostprocessOptions = {
  toneMode: ToneMode;
  canonicalTerms: CanonicalTerm[];
  formatCommandsEnabled?: boolean;
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeWhitespace(value: string) {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\s+([,.;!?])/g, "$1")
    .trim();
}

function capitalizeFirst(value: string) {
  if (!value) return value;
  return value.charAt(0).toLocaleUpperCase() + value.slice(1);
}

function lowerFirst(value: string) {
  if (!value) return value;
  return value.charAt(0).toLocaleLowerCase() + value.slice(1);
}

function applyCanonicalReplacements(value: string, canonicalTerms: CanonicalTerm[]) {
  let next = value;
  for (const term of canonicalTerms) {
    if (!term.enabled) continue;
    const target = normalizeWhitespace(term.to);
    if (!target) continue;
    const alternatives = String(term.from ?? "")
      .split("|")
      .map((entry) => normalizeWhitespace(entry))
      .filter(Boolean);
    for (const alternative of alternatives) {
      const hasTerminalBang = target.endsWith("!");
      const pattern = hasTerminalBang
        ? new RegExp(`\\b${escapeRegExp(alternative)}\\b(?!\\!)`, "gi")
        : new RegExp(`\\b${escapeRegExp(alternative)}\\b`, "gi");
      next = next.replace(pattern, target);
    }
  }
  return next;
}

function applyExplicitFormattingCommands(value: string) {
  let next = value;
  next = next.replace(/\b(?:nova linha|new line)\b/gi, "\n");
  next = next.replace(/\b(?:bullet point|bullet|t[oó]pico|topico)\b/gi, "\n•");
  next = next.replace(/\b(?:item|n[uú]mero|numero|number)\s+(\d{1,2})\b/gi, (_entry, n: string) => `\n${n}.`);

  // PT-BR punctuation commands (explicit)
  next = next.replace(/\b(?:vírgula|virgula)\b/gi, ",");
  next = next.replace(/\b(?:ponto e vírgula|ponto e virgula)\b/gi, ";");
  next = next.replace(/\b(?:dois pontos)\b/gi, ":");
  next = next.replace(/\b(?:ponto)\b/gi, ".");
  next = next.replace(/\b(?:interrogação|interrogacao|ponto de interrogação|ponto de interrogacao)\b/gi, "?");
  next = next.replace(/\b(?:exclamação|exclamacao|ponto de exclamação|ponto de exclamacao)\b/gi, "!");
  next = next.replace(/\b(?:reticências|reticencias)\b/gi, "...");

  // Parentheses / quotes
  next = next.replace(/\b(?:abre parênteses|abre parenteses)\b/gi, "(");
  next = next.replace(/\b(?:fecha parênteses|fecha parenteses)\b/gi, ")");
  next = next.replace(/\b(?:abre aspas)\b/gi, "\"");
  next = next.replace(/\b(?:fecha aspas)\b/gi, "\"");

  // Normalize spaces around punctuation.
  next = next.replace(/\s+([,.;:!?])/g, "$1");
  next = next.replace(/([,.;:!?])(?!\s|\n|$)/g, "$1 ");
  next = next.replace(/\(\s+/g, "(").replace(/\s+\)/g, ")");

  next = next.replace(/\n[ \t]*/g, "\n");
  next = next.replace(/(^|\n)•(?!\s)/g, "$1• ");
  next = next.replace(/(^|\n)(\d+\.)\s*/g, "$1$2 ");
  next = next.replace(/\n{2,}/g, "\n");
  return normalizeWhitespace(next);
}

function applyToneProfile(value: string, toneMode: ToneMode) {
  if (toneMode === "formal") {
    return value
      .replace(/\b(vc|vcs)\b/gi, (entry) => (entry.toLowerCase() === "vcs" ? "vocês" : "você"))
      .replace(/\b(pra)\b/gi, "para")
      .replace(/\b(tá)\b/gi, "está")
      .replace(/\b(to|tô)\b/gi, "estou")
      .replace(/\b(ta)\b/gi, "está")
      .replace(/\b(não tá)\b/gi, "não está")
      .replace(/\b(cê)\b/gi, "você");
  }
  if (toneMode === "very-casual") {
    return value
      .replace(/você/gi, "vc")
      .replace(/para/gi, "pra")
      .replace(/está/gi, "tá");
  }
  return value;
}

function punctuateLine(value: string, toneMode: ToneMode) {
  if (!value) return "";

  if (toneMode === "very-casual") {
    return lowerFirst(value).replace(/[.]+$/g, "");
  }

  const capped = capitalizeFirst(value);
  if (/[.!?…]$/.test(capped)) return capped;
  if (toneMode === "formal") return `${capped}.`;
  return capped;
}

function applyFinalPunctuation(value: string, toneMode: ToneMode) {
  if (!value) return "";
  if (!value.includes("\n")) return punctuateLine(value, toneMode);

  return value
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return "";
      if (/^(•|\d+\.)\s+/.test(trimmed)) return trimmed;
      return punctuateLine(trimmed, toneMode);
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function applyTranscriptPostprocess(rawText: string, options: TranscriptPostprocessOptions) {
  const normalized = normalizeWhitespace(rawText);
  if (!normalized) return "";

  const withCanonical = applyCanonicalReplacements(normalized, options.canonicalTerms);
  const withCommands = options.formatCommandsEnabled === false ? withCanonical : applyExplicitFormattingCommands(withCanonical);
  const toned = normalizeWhitespace(applyToneProfile(withCommands, options.toneMode));
  return applyFinalPunctuation(toned, options.toneMode);
}
