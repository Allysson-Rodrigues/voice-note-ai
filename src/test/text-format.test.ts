import { describe, expect, it } from "vitest";
import { applyTranscriptFormatting } from "@/lib/text-format";
import type { CanonicalTerm } from "@/electron";

const canonicalTerms: CanonicalTerm[] = [
  { from: "work space|workspace|work-space", to: "Workspace", enabled: true },
  { from: "anti gravity|anti-gravity|antigravity", to: "Antigravity", enabled: true },
  { from: "googel|gogle|google", to: "Google", enabled: true },
  { from: "ei|hey", to: "Hey!", enabled: true },
];

describe("transcript formatting", () => {
  it("formats formal profile with punctuation and canonical terms", () => {
    const output = applyTranscriptFormatting("ei vc viu o work space da anti gravity no googel", "formal", canonicalTerms);
    expect(output).toBe("Hey! você viu o Workspace da Antigravity no Google.");
  });

  it("keeps casual profile lighter", () => {
    const output = applyTranscriptFormatting("workspace está pronto pra revisão", "casual", canonicalTerms);
    expect(output).toBe("Workspace está pronto pra revisão");
  });

  it("keeps very casual profile informal", () => {
    const output = applyTranscriptFormatting("Você está no Workspace.", "very-casual", canonicalTerms);
    expect(output).toBe("vc tá no Workspace");
  });
});
