import { describe, expect, it } from 'vitest';
import {
  MAX_PCM_CHUNK_BYTES,
  validateDictionaryAddPayload,
  validateSettingsUpdate,
  validateSttAudioPayload,
  validateSttStartPayload,
} from './ipc-validation.js';

describe('ipc validation', () => {
  it('accepts valid settings update payload', () => {
    const result = validateSettingsUpdate({
      toneMode: 'formal',
      privacyMode: true,
      historyStorageMode: 'encrypted',
      postprocessProfile: 'balanced',
      dualLanguageStrategy: 'fallback-on-low-confidence',
    });

    expect(result).toMatchObject({
      toneMode: 'formal',
      privacyMode: true,
      historyStorageMode: 'encrypted',
    });
  });

  it('rejects unknown settings keys', () => {
    expect(() => validateSettingsUpdate({ invalid: true })).toThrow(/nao permitido/i);
  });

  it('accepts valid dictionary payload', () => {
    expect(validateDictionaryAddPayload({ term: 'Workspace', hintPt: 'produto' })).toEqual({
      term: 'Workspace',
      hintPt: 'produto',
    });
  });

  it('accepts valid stt start payload', () => {
    expect(validateSttStartPayload({ sessionId: 'abc-123', language: 'pt-BR' })).toEqual({
      sessionId: 'abc-123',
      language: 'pt-BR',
    });
  });

  it('rejects oversized audio payload', () => {
    expect(() =>
      validateSttAudioPayload({
        sessionId: 'abc-123',
        pcm16kMonoInt16: new ArrayBuffer(MAX_PCM_CHUNK_BYTES + 2),
      }),
    ).toThrow(/limite/i);
  });
});
