import { describe, expect, it } from "vitest";
import { applyTranscriptPostprocess } from "@/lib/transcript-postprocess";
import type { CanonicalTerm } from "@/electron";

const canonicalTerms: CanonicalTerm[] = [
  { from: "work space|workspace|work-space", to: "Workspace", enabled: true },
  { from: "anti gravity|anti-gravity|antigravity", to: "Antigravity", enabled: true },
];

describe("transcript postprocess commands", () => {
  it("applies explicit bullet commands in pt/en", () => {
    const output = applyTranscriptPostprocess(
      "bullet point revisar o workspace nova linha topico corrigir antigravity",
      { toneMode: "casual", canonicalTerms, formatCommandsEnabled: true },
    );

    expect(output).toBe("• revisar o Workspace\n• corrigir Antigravity");
  });

  it("applies explicit numbered item commands", () => {
    const output = applyTranscriptPostprocess(
      "item 1 revisar contrato nova linha número 2 enviar proposta",
      { toneMode: "formal", canonicalTerms, formatCommandsEnabled: true },
    );

    expect(output).toBe("1. revisar contrato\n2. enviar proposta");
  });

  it("keeps plain formatting when explicit command mode is disabled", () => {
    const output = applyTranscriptPostprocess(
      "item 1 revisar contrato",
      { toneMode: "casual", canonicalTerms, formatCommandsEnabled: false },
    );
    expect(output).toBe("Item 1 revisar contrato");
  });

  it("applies pt-br punctuation commands", () => {
    const output = applyTranscriptPostprocess(
      "Olá vírgula tudo bem interrogação nova linha abre parênteses teste fecha parênteses ponto",
      { toneMode: "casual", canonicalTerms, formatCommandsEnabled: true },
    );

    expect(output).toBe("Olá, tudo bem?\n(teste).");
  });
});
