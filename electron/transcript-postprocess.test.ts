import { describe, expect, it } from "vitest";
import { applyTranscriptPostprocess } from "./transcript-postprocess.js";
import {
  canonicalTermsFixture,
  transcriptCases,
} from "../src/test/fixtures/transcript-cases";

describe("electron transcript postprocess", () => {
  for (const testCase of transcriptCases) {
    it(testCase.name, () => {
      const output = applyTranscriptPostprocess(testCase.input, {
        toneMode: testCase.toneMode,
        canonicalTerms: canonicalTermsFixture,
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
        canonicalTerms: canonicalTermsFixture,
        formatCommandsEnabled: true,
      },
    );
    expect(output).toBe("Antigravity, Workspace");
  });

  it("structures bullet list intent and preserves protected terms", () => {
    const output = applyTranscriptPostprocess("googel revisar anti gravity", {
      toneMode: "casual",
      canonicalTerms: canonicalTermsFixture,
      formatCommandsEnabled: true,
      intent: "bullet-list",
      protectedTerms: ["Google"],
    });

    expect(output).toBe("• Google revisar Antigravity");
  });

  it("formats email intent with greeting", () => {
    const output = applyTranscriptPostprocess(
      "assunto atualização do projeto ponto final enviar hoje",
      {
        toneMode: "formal",
        canonicalTerms: canonicalTermsFixture,
        formatCommandsEnabled: true,
        intent: "email",
        language: "pt-BR",
      },
    );

    expect(output.startsWith("Olá,")).toBe(true);
  });

  it("merges stray period caused by a short breathing pause", () => {
    const output = applyTranscriptPostprocess(
      "eu preciso respirar. e depois continuar",
      {
        toneMode: "casual",
        canonicalTerms: canonicalTermsFixture,
        formatCommandsEnabled: true,
        intent: "free-text",
        language: "pt-BR",
      },
    );

    expect(output).toBe("Eu preciso respirar e depois continuar");
  });
});
