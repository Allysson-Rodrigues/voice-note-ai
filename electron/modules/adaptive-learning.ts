import type { AdaptiveStoreState } from "../adaptive-store.js";
import type { AppSettings, TranscriptFormatStyle } from "../settings-store.js";

export type AdaptiveSuggestion =
  | {
      id: string;
      type: "protected-term";
      appKey: string;
      confidence: number;
      reason: string;
      payload: { term: string };
    }
  | {
      id: string;
      type: "format-style";
      appKey: string;
      confidence: number;
      reason: string;
      payload: { formatStyle: TranscriptFormatStyle };
    }
  | {
      id: string;
      type: "language-bias";
      appKey: string;
      confidence: number;
      reason: string;
      payload: { languageBias: "pt-BR" | "en-US" };
    };

const COMMON_WORDS = new Set([
  "para",
  "com",
  "sem",
  "isso",
  "essa",
  "esse",
  "projeto",
  "revisar",
  "enviar",
  "texto",
  "sobre",
  "mais",
  "pode",
  "quando",
  "porque",
  "where",
  "this",
  "that",
  "with",
  "from",
  "have",
  "will",
]);

function isCandidateProtectedTerm(term: string) {
  if (!term || term.length < 5) return false;
  if (COMMON_WORDS.has(term.toLocaleLowerCase())) return false;
  if (/^\d+$/.test(term)) return false;
  return /^[A-Za-zÀ-ÿ0-9+#.-]+$/.test(term);
}

function topEntry(input: Record<string, number>) {
  const entries = Object.entries(input).sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );
  return entries[0]
    ? {
        key: entries[0][0],
        count: entries[0][1],
        total: entries.reduce((sum, [, value]) => sum + value, 0),
      }
    : null;
}

function formatStyleFromIntent(intent: string): TranscriptFormatStyle | null {
  if (intent === "bullet-list") return "bullet-list";
  if (intent === "numbered-list") return "notes";
  if (intent === "email") return "email";
  if (intent === "chat") return "message";
  if (intent === "technical-note") return "technical-note";
  return null;
}

export function generateAdaptiveSuggestions(
  state: AdaptiveStoreState,
  settings: AppSettings,
): AdaptiveSuggestion[] {
  const dismissed = new Set(state.dismissedSuggestionIds);
  const suggestions: AdaptiveSuggestion[] = [];

  for (const [appKey, stats] of Object.entries(state.apps)) {
    if (stats.sessionCount < 3) continue;
    const currentProfile = settings.appProfiles?.[appKey] ?? {};

    const topIntent = topEntry(stats.intentCounts);
    const suggestedFormatStyle = topIntent
      ? formatStyleFromIntent(topIntent.key)
      : null;
    if (
      topIntent &&
      suggestedFormatStyle &&
      topIntent.key !== "free-text" &&
      topIntent.count >= 3 &&
      topIntent.count / Math.max(1, topIntent.total) >= 0.6 &&
      currentProfile.formatStyle !== suggestedFormatStyle
    ) {
      const id = `format-style:${appKey}:${suggestedFormatStyle}`;
      if (!dismissed.has(id)) {
        suggestions.push({
          id,
          type: "format-style",
          appKey,
          confidence: Number(
            (topIntent.count / Math.max(1, topIntent.total)).toFixed(2),
          ),
          reason: `O app ${appKey} recebeu principalmente sessões do tipo ${topIntent.key}.`,
          payload: { formatStyle: suggestedFormatStyle },
        });
      }
    }

    const topLanguage = topEntry(stats.languageCounts);
    if (
      topLanguage &&
      (topLanguage.key === "pt-BR" || topLanguage.key === "en-US") &&
      topLanguage.count >= 3 &&
      topLanguage.count / Math.max(1, topLanguage.total) >= 0.72 &&
      currentProfile.languageBias !== topLanguage.key
    ) {
      const id = `language-bias:${appKey}:${topLanguage.key}`;
      if (!dismissed.has(id)) {
        suggestions.push({
          id,
          type: "language-bias",
          appKey,
          confidence: Number(
            (topLanguage.count / Math.max(1, topLanguage.total)).toFixed(2),
          ),
          reason: `O app ${appKey} terminou com ${topLanguage.key} na maioria das sessões.`,
          payload: { languageBias: topLanguage.key },
        });
      }
    }

    const existingProtected = new Set(
      [
        ...(settings.protectedTerms ?? []),
        ...(currentProfile.protectedTerms ?? []),
      ].map((entry) => entry.toLocaleLowerCase()),
    );
    const topTerms = Object.values(stats.termStats)
      .filter((term) => term.count >= 4 && isCandidateProtectedTerm(term.term))
      .sort((a, b) => b.count - a.count || a.term.localeCompare(b.term))
      .slice(0, 3);

    for (const term of topTerms) {
      if (existingProtected.has(term.term.toLocaleLowerCase())) continue;
      const confidence = Number(
        Math.min(
          0.95,
          term.count / Math.max(4, stats.sessionCount + 1),
        ).toFixed(2),
      );
      const id = `protected-term:${appKey}:${term.term.toLocaleLowerCase()}`;
      if (dismissed.has(id)) continue;
      suggestions.push({
        id,
        type: "protected-term",
        appKey,
        confidence,
        reason: `O termo ${term.term} apareceu ${term.count} vezes no contexto ${appKey}.`,
        payload: { term: term.term },
      });
    }
  }

  return suggestions
    .sort((a, b) => b.confidence - a.confidence || a.id.localeCompare(b.id))
    .slice(0, 12);
}
