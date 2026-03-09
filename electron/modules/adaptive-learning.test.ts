import { describe, expect, it } from "vitest";
import { generateAdaptiveSuggestions } from "./adaptive-learning.js";

describe("adaptive learning suggestions", () => {
  it("suggests format style, language bias and protected term for repeated app patterns", () => {
    const suggestions = generateAdaptiveSuggestions(
      {
        apps: {
          slack: {
            appKey: "slack",
            sessionCount: 5,
            lowConfidenceCount: 0,
            intentCounts: { chat: 4, "free-text": 1 },
            languageCounts: { "en-US": 4, "pt-BR": 1 },
            termStats: {
              workspace: {
                term: "Workspace",
                count: 5,
                lastSeenAt: "2026-03-07T00:00:00.000Z",
              },
            },
          },
        },
        dismissedSuggestionIds: [],
      },
      {
        autoPasteEnabled: true,
        toneMode: "casual",
        languageMode: "dual",
        sttProvider: "azure",
        extraPhrases: [],
        canonicalTerms: [],
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
        lowConfidencePolicy: "review",
        adaptiveLearningEnabled: true,
        appProfiles: {},
      },
    );

    expect(suggestions.some((item) => item.type === "format-style")).toBe(true);
    expect(suggestions.some((item) => item.type === "language-bias")).toBe(
      true,
    );
    expect(suggestions.some((item) => item.type === "protected-term")).toBe(
      true,
    );
  });
});
