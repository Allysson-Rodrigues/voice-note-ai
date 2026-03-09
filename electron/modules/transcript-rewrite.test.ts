import { describe, expect, it } from 'vitest';
import { rewriteTranscript } from './transcript-rewrite.js';

describe('transcript rewrite', () => {
  it('rewrites list items into bullet format', () => {
    const result = rewriteTranscript({
      rawText: 'revisar contrato\nenviar proposta',
      intent: 'bullet-list',
      language: 'pt-BR',
      protectedTerms: [],
      toneMode: 'casual',
    });

    expect(result.text).toBe('• revisar contrato\n• enviar proposta');
    expect(result.changed).toBe(true);
  });

  it('preserves protected terms while rewriting', () => {
    const result = rewriteTranscript({
      rawText: 'google atualizar sdk',
      intent: 'technical-note',
      language: 'en-US',
      protectedTerms: ['Google'],
      toneMode: 'formal',
    });

    expect(result.text).toContain('Google');
  });
});
