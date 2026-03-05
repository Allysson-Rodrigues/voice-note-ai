import { describe, expect, it } from 'vitest';
import { getRecentLogs, logInfo } from './logger.js';

describe('logger', () => {
  it('redacts sensitive transcript fields from renderer-facing logs', () => {
    logInfo('session completed', {
      sessionId: 'abc123',
      text: 'texto final sensivel',
      rawText: 'texto bruto sensivel',
      nested: {
        transcript: 'trecho interno',
        kept: 42,
      },
    });

    const [entry] = getRecentLogs(1);
    expect(entry?.context).toEqual({
      sessionId: 'abc123',
      text: '[redacted]',
      rawText: '[redacted]',
      nested: {
        transcript: '[redacted]',
        kept: 42,
      },
    });
  });
});
