import { describe, expect, it } from 'vitest';
import { canPersistAdaptiveLearning, canUseHistoryPhraseBoost } from './privacy-rules.js';

describe('privacy rules', () => {
  it('uses history phrases only when history is enabled and privacy mode is off', () => {
    expect(canUseHistoryPhraseBoost({ historyEnabled: true, privacyMode: false })).toBe(true);
    expect(canUseHistoryPhraseBoost({ historyEnabled: false, privacyMode: false })).toBe(false);
    expect(canUseHistoryPhraseBoost({ historyEnabled: true, privacyMode: true })).toBe(false);
  });

  it('persists adaptive learning only when privacy allows it', () => {
    expect(
      canPersistAdaptiveLearning({
        historyEnabled: true,
        privacyMode: false,
        adaptiveLearningEnabled: true,
      }),
    ).toBe(true);
    expect(
      canPersistAdaptiveLearning({
        historyEnabled: true,
        privacyMode: true,
        adaptiveLearningEnabled: true,
      }),
    ).toBe(false);
    expect(
      canPersistAdaptiveLearning({
        historyEnabled: true,
        privacyMode: false,
        adaptiveLearningEnabled: false,
      }),
    ).toBe(false);
  });
});
