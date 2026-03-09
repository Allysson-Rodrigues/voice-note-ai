import { describe, expect, it } from 'vitest';
import {
  MAX_PCM_CHUNK_BYTES,
  validateAdaptiveSuggestionPayload,
  validateAzureCredentialsPayload,
  validateDictionaryAddPayload,
  validateDictionaryImportPayload,
  validateHealthCheckPayload,
  validateSettingsUpdate,
  validateSttAudioPayload,
  validateSttStartPayload,
} from './ipc-validation.js';

describe('ipc validation', () => {
  it('accepts valid settings update payload', () => {
    const result = validateSettingsUpdate({
      hotkeyPrimary: 'CommandOrControl+Super',
      hotkeyFallback: 'CommandOrControl+Super+Space',
      toneMode: 'formal',
      privacyMode: true,
      historyStorageMode: 'encrypted',
      postprocessProfile: 'balanced',
      dualLanguageStrategy: 'fallback-on-low-confidence',
      rewriteEnabled: true,
      rewriteMode: 'safe',
      intentDetectionEnabled: true,
      protectedTerms: ['Workspace'],
      lowConfidencePolicy: 'review',
      adaptiveLearningEnabled: true,
    });

    expect(result).toMatchObject({
      hotkeyPrimary: 'CommandOrControl+Super',
      toneMode: 'formal',
      privacyMode: true,
      historyStorageMode: 'encrypted',
      rewriteMode: 'safe',
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

  it('rejects dictionary import payloads with unexpected keys', () => {
    expect(() =>
      validateDictionaryImportPayload({
        terms: [],
        mode: 'merge',
        extra: true,
      }),
    ).toThrow(/nao permitido/i);
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

  it('accepts valid adaptive suggestion payload', () => {
    expect(validateAdaptiveSuggestionPayload({ id: 'protected-term:slack:workspace' })).toEqual({
      id: 'protected-term:slack:workspace',
    });
  });

  it('accepts valid Azure credential payload', () => {
    expect(validateAzureCredentialsPayload({ key: 'abc', region: 'brazilsouth' })).toEqual({
      key: 'abc',
      region: 'brazilsouth',
    });
  });

  it('accepts valid health check payload with microphone state', () => {
    expect(
      validateHealthCheckPayload({
        includeExternal: true,
        microphone: {
          status: 'warn',
          message: 'Permissão pendente',
        },
      }),
    ).toEqual({
      includeExternal: true,
      microphone: {
        status: 'warn',
        message: 'Permissão pendente',
      },
    });
  });
});
