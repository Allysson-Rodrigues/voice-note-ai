import { describe, expect, it, vi } from 'vitest';
import { AzureSttProvider } from './azure-provider.js';
import type { SttProviderEvents } from './types.js';

type RecognizerStub = {
  recognizing?: (sender: unknown, event: { result?: { text?: string } }) => void;
  recognized?: (sender: unknown, event: { result?: { text?: string; json?: string } }) => void;
  canceled?: (sender: unknown, event: { errorDetails?: unknown; reason?: unknown }) => void;
  startContinuousRecognitionAsync: (
    onSuccess: () => void,
    _onError: (error: unknown) => void,
  ) => void;
  stopContinuousRecognitionAsync: (
    onSuccess: () => void,
    _onError: (error: unknown) => void,
  ) => void;
  close: () => void;
};

function createSdkStub(recognizers: RecognizerStub[]) {
  return {
    SpeechConfig: {
      fromSubscription: () => ({
        speechRecognitionLanguage: 'pt-BR',
        setProperty: vi.fn(),
      }),
    },
    AudioStreamFormat: {
      getWaveFormatPCM: vi.fn(() => ({})),
    },
    AudioInputStream: {
      createPushStream: vi.fn(() => ({
        write: vi.fn(),
        close: vi.fn(),
      })),
    },
    AudioConfig: {
      fromStreamInput: vi.fn(() => ({})),
    },
    SpeechRecognizer: vi.fn(() => {
      const recognizer = recognizers.shift();
      if (!recognizer) {
        throw new Error('Recognizer stub missing.');
      }
      return recognizer;
    }),
  };
}

function createRecognizerStub(): RecognizerStub {
  return {
    startContinuousRecognitionAsync: (onSuccess) => onSuccess(),
    stopContinuousRecognitionAsync: (onSuccess) => onSuccess(),
    close: vi.fn(),
  };
}

describe('AzureSttProvider dual language', () => {
  it('promotes the secondary slot when it has the best recognized result in parallel mode', async () => {
    const primary = createRecognizerStub();
    const secondary = createRecognizerStub();
    const provider = new AzureSttProvider(
      { key: 'key', region: 'region' },
      async () => createSdkStub([primary, secondary]) as never,
    );

    const events: SttProviderEvents = {
      onRecognizing: vi.fn(),
      onRecognized: vi.fn(),
      onError: vi.fn(),
    };

    await provider.start('session-1', 'dual', [], events, {
      dualLanguageStrategy: 'parallel',
    });

    primary.recognized?.(null, {
      result: {
        text: 'ola mundo',
        json: JSON.stringify({ NBest: [{ Confidence: 0.41 }] }),
      },
    });
    secondary.recognized?.(null, {
      result: {
        text: 'hello world',
        json: JSON.stringify({ NBest: [{ Confidence: 0.93 }] }),
      },
    });

    expect(events.onRecognized).toHaveBeenLastCalledWith('session-1', {
      text: 'hello world',
      confidence: 0.93,
      language: 'en-US',
    });
  });
});
