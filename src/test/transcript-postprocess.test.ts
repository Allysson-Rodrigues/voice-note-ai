import { describe, expect, it } from "vitest";
import { applyTranscriptPostprocess } from "@/lib/transcript-postprocess";
import type { CanonicalTerm } from "@/electron";
import {
  canonicalTermsFixture,
  transcriptCases,
} from "@/test/fixtures/transcript-cases";

const canonicalTerms: CanonicalTerm[] = canonicalTermsFixture;

describe("transcript postprocess commands", () => {
  for (const testCase of transcriptCases) {
    it(testCase.name, () => {
      const output = applyTranscriptPostprocess(testCase.input, {
        toneMode: testCase.toneMode,
        canonicalTerms,
        formatCommandsEnabled: testCase.formatCommandsEnabled,
      });

      expect(output).toBe(testCase.expected);
    });
  }

  it("applies canonical replacements before punctuation", () => {
    const output = applyTranscriptPostprocess(
      "anti gravity vírgula workspace",
      {
        toneMode: "casual",
        canonicalTerms,
        formatCommandsEnabled: true,
      },
    );
    expect(output).toBe("Antigravity, Workspace");
  });
});
