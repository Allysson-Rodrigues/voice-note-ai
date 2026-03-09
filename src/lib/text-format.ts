import type { CanonicalTerm } from "@/electron";
import {
  applyTranscriptPostprocess,
  type ToneMode,
} from "@/lib/transcript-postprocess";

export type { ToneMode };

export function applyTranscriptFormatting(
  rawText: string,
  toneMode: ToneMode,
  canonicalTerms: CanonicalTerm[],
) {
  return applyTranscriptPostprocess(rawText, {
    toneMode,
    canonicalTerms,
    formatCommandsEnabled: false,
  });
}
