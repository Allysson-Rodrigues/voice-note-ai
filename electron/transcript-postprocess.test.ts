import { describe, expect, it } from 'vitest';
import { applyTranscriptPostprocess } from './transcript-postprocess.js';
import { canonicalTermsFixture, transcriptCases } from '../src/test/fixtures/transcript-cases';

describe('electron transcript postprocess', () => {
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

  it('applies canonical replacements before punctuation', () => {
    const output = applyTranscriptPostprocess('anti gravity vírgula workspace', {
      toneMode: 'casual',
      canonicalTerms: canonicalTermsFixture,
      formatCommandsEnabled: true,
    });
    expect(output).toBe('Antigravity, Workspace');
  });
});
