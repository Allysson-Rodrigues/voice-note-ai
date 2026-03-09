import type {
  SttProvider,
  SttProviderEvents,
  SttResult,
  SttStartOptions,
} from "./types.js";
import { logWarn } from "../../logger.js";

// Reusing types from the original stt-session.ts for the internal Azure implementation
type SpeechRecognitionResultPayload = {
  text?: string;
  json?: string;
};

type SpeechRecognitionEvent = {
  result?: SpeechRecognitionResultPayload;
  reason?: unknown;
  errorDetails?: unknown;
};

type SpeechRecognizer = {
  recognizing?: (sender: unknown, event: SpeechRecognitionEvent) => void;
  recognized?: (sender: unknown, event: SpeechRecognitionEvent) => void;
  canceled?: (sender: unknown, event: SpeechRecognitionEvent) => void;
  sessionStopped?: () => void;
  startContinuousRecognitionAsync: (
    onSuccess: () => void,
    onError: (error: unknown) => void,
  ) => void;
  stopContinuousRecognitionAsync: (
    onSuccess: () => void,
    onError: (error: unknown) => void,
  ) => void;
  close: () => void;
};

type PushAudioStream = {
  write: (chunk: Buffer) => void;
  close: () => void;
};

type SpeechConfig = {
  speechRecognitionLanguage: string;
  setProperty: (propertyId: unknown, value: string) => void;
  outputFormat?: unknown;
};

type PhraseListGrammar = {
  addPhrase: (phrase: string) => void;
};

export type SpeechSdkModule = {
  SpeechConfig: {
    fromSubscription: (key: string, region: string) => SpeechConfig;
  };
  PropertyId?: {
    SpeechServiceResponse_PostProcessingOption?: unknown;
  };
  OutputFormat?: {
    Detailed: unknown;
  };
  AudioStreamFormat: {
    getWaveFormatPCM: (
      sampleRate: number,
      bitsPerSample: number,
      channels: number,
    ) => unknown;
  };
  AudioInputStream: {
    createPushStream: (streamFormat: unknown) => PushAudioStream;
  };
  AudioConfig: {
    fromStreamInput: (stream: PushAudioStream) => unknown;
  };
  SpeechRecognizer: new (
    speechConfig: SpeechConfig,
    audioConfig: unknown,
  ) => SpeechRecognizer;
  PhraseListGrammar?: {
    fromRecognizer: (recognizer: SpeechRecognizer) => PhraseListGrammar;
  };
};

type AzureSlot = {
  language: string;
  recognizer: SpeechRecognizer;
  pushStream: PushAudioStream;
  transcriptFinal: string;
  lastPartial: string;
  bestConfidence: number | null;
  ready: boolean;
  buffered: Buffer[];
  bufferedBytes: number;
  canceled: boolean;
};

const MAX_WARMUP_BUFFER_BYTES = 64 * 1024;
const DUAL_FALLBACK_CONFIDENCE_THRESHOLD = 0.6;

export class AzureSttProvider implements SttProvider {
  private sdk: SpeechSdkModule | null = null;
  private sdkLoadPromise: Promise<SpeechSdkModule> | null = null;
  private slots: AzureSlot[] = [];
  private events: SttProviderEvents | null = null;
  private currentSessionId: string | null = null;
  private startOptions: SttStartOptions = {};

  constructor(
    private config: { key: string; region: string },
    private getSdk: () => Promise<unknown>,
  ) {}

  async prewarm(): Promise<void> {
    await this.ensureSdkLoaded();
    const sdk = this.sdk;
    if (!sdk) return;

    try {
      const speechConfig = sdk.SpeechConfig.fromSubscription(
        this.config.key,
        this.config.region,
      );
      speechConfig.speechRecognitionLanguage = "pt-BR";
      sdk.AudioStreamFormat.getWaveFormatPCM(16000, 16, 1);
    } catch (error) {
      logWarn("failed to prewarm azure stt provider", { error });
    }
  }

  async start(
    sessionId: string,
    language: string,
    phrases: string[],
    events: SttProviderEvents,
    options: SttStartOptions = {},
  ): Promise<void> {
    await this.ensureSdkLoaded();
    this.events = events;
    this.currentSessionId = sessionId;
    this.startOptions = options;

    const languages = language === "dual" ? ["pt-BR", "en-US"] : [language];

    this.slots = languages.map((lang) => this.createSlot(lang, phrases));

    for (const slot of this.slots) {
      this.attachHandlers(slot, slot === this.slots[0]);
    }

    await Promise.all(this.slots.map((slot) => this.startSlot(slot)));
  }

  async stop(sessionId: string): Promise<void> {
    if (this.currentSessionId !== sessionId) return;

    await Promise.all(
      this.slots.map(async (slot) => {
        try {
          slot.pushStream.close();
        } catch (e) {
          logWarn("Error closing push stream", {
            sessionId,
            language: slot.language,
            error: e,
          });
        }

        return new Promise<void>((resolve) => {
          try {
            slot.recognizer.stopContinuousRecognitionAsync(
              () => {
                try {
                  slot.recognizer.close();
                } catch {
                  // Ignore recognizer cleanup failures during normal shutdown.
                }
                resolve();
              },
              () => {
                try {
                  slot.recognizer.close();
                } catch {
                  // Ignore recognizer cleanup failures after stop errors.
                }
                resolve();
              },
            );
          } catch {
            try {
              slot.recognizer.close();
            } catch {
              // Ignore recognizer cleanup failures when startup aborts.
            }
            resolve();
          }
        });
      }),
    );

    this.slots = [];
    this.currentSessionId = null;
  }

  writeAudio(sessionId: string, chunk: Buffer): void {
    if (this.currentSessionId !== sessionId) return;

    for (const slot of this.slots) {
      if (slot.ready) {
        slot.pushStream.write(chunk);
      } else if (slot.bufferedBytes < MAX_WARMUP_BUFFER_BYTES) {
        slot.buffered.push(chunk);
        slot.bufferedBytes += chunk.byteLength;
      }
    }
  }

  close(): void {
    if (this.currentSessionId) {
      void this.stop(this.currentSessionId);
    }
  }

  private async ensureSdkLoaded(): Promise<SpeechSdkModule> {
    if (this.sdk) return this.sdk;
    if (!this.sdkLoadPromise) {
      this.sdkLoadPromise = this.getSdk().then((mod) => {
        const maybeModule = mod as SpeechSdkModule & {
          default?: SpeechSdkModule;
        };
        const sdk = maybeModule.default ?? maybeModule;
        this.sdk = sdk;
        return sdk;
      });
    }
    return await this.sdkLoadPromise;
  }

  private createSlot(language: string, phrases: string[]): AzureSlot {
    const sdk = this.sdk!;
    const speechConfig = sdk.SpeechConfig.fromSubscription(
      this.config.key,
      this.config.region,
    );
    speechConfig.speechRecognitionLanguage = language;

    if (sdk.PropertyId?.SpeechServiceResponse_PostProcessingOption) {
      speechConfig.setProperty(
        sdk.PropertyId.SpeechServiceResponse_PostProcessingOption,
        "TrueText",
      );
    }

    if (sdk.OutputFormat) {
      try {
        speechConfig.outputFormat = sdk.OutputFormat.Detailed;
      } catch {
        // Ignore optional detailed output when the SDK build does not expose it.
      }
    }

    const streamFormat = sdk.AudioStreamFormat.getWaveFormatPCM(16000, 16, 1);
    const pushStream = sdk.AudioInputStream.createPushStream(streamFormat);
    const audioConfig = sdk.AudioConfig.fromStreamInput(pushStream);
    const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);

    if (phrases.length > 0 && sdk.PhraseListGrammar?.fromRecognizer) {
      try {
        const grammar = sdk.PhraseListGrammar.fromRecognizer(recognizer);
        for (const phrase of phrases) grammar.addPhrase(phrase);
      } catch (error) {
        logWarn("failed to apply phrase list", { language, error });
      }
    }

    return {
      language,
      recognizer,
      pushStream,
      transcriptFinal: "",
      lastPartial: "",
      bestConfidence: null,
      ready: false,
      buffered: [],
      bufferedBytes: 0,
      canceled: false,
    };
  }

  private async startSlot(slot: AzureSlot): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      slot.recognizer.startContinuousRecognitionAsync(() => {
        slot.ready = true;
        for (const chunk of slot.buffered) {
          slot.pushStream.write(chunk);
        }
        slot.buffered = [];
        slot.bufferedBytes = 0;
        resolve();
      }, reject);
    });
  }

  private attachHandlers(slot: AzureSlot, isPrimary: boolean): void {
    const sessionId = this.currentSessionId!;

    slot.recognizer.recognizing = (_, e) => {
      const text = e.result?.text?.trim() ?? "";
      slot.lastPartial = text;
      this.emitBestPartial(sessionId, isPrimary ? text : undefined);
    };

    slot.recognizer.recognized = (_, e) => {
      const text = e.result?.text?.trim();
      if (!text) return;

      slot.transcriptFinal = (slot.transcriptFinal + " " + text).trim();

      let confidence = 0.8; // Default
      if (e.result?.json) {
        try {
          const payload = JSON.parse(e.result.json);
          const candidates = payload.NBest || [];
          if (candidates.length > 0) {
            confidence = candidates[0].Confidence ?? 0.8;
          }
        } catch {
          // Fall back to the default confidence when detailed JSON is unavailable.
        }
      }

      slot.bestConfidence =
        slot.bestConfidence === null
          ? confidence
          : (slot.bestConfidence + confidence) / 2;

      this.emitBestRecognized(sessionId, slot, isPrimary);
    };

    slot.recognizer.canceled = (_, e) => {
      slot.canceled = true;
      if (this.slots.every((candidate) => candidate.canceled) && this.events) {
        this.events.onError(
          sessionId,
          String(e.errorDetails || e.reason || "Canceled"),
        );
      }
    };
  }

  private emitBestPartial(sessionId: string, primaryText?: string): void {
    if (!this.events) return;
    if (this.slots.length <= 1) {
      if (primaryText) this.events.onRecognizing(sessionId, primaryText);
      return;
    }

    const fallback = primaryText ?? this.slots[0]?.lastPartial ?? "";
    const candidate = this.pickPreferredSlot(this.slots, {
      preferTranscript: false,
    });
    const text = candidate?.lastPartial?.trim() || fallback;
    if (text) {
      this.events.onRecognizing(sessionId, text);
    }
  }

  private emitBestRecognized(
    sessionId: string,
    updatedSlot: AzureSlot,
    isPrimary: boolean,
  ): void {
    if (!this.events) return;
    if (this.slots.length <= 1) {
      if (isPrimary) {
        this.events.onRecognized(sessionId, {
          text: updatedSlot.transcriptFinal,
          confidence: updatedSlot.bestConfidence ?? 0.8,
          language: updatedSlot.language,
        });
      }
      return;
    }

    const selected =
      this.pickPreferredSlot(this.slots, { preferTranscript: true }) ??
      updatedSlot;
    this.events.onRecognized(sessionId, {
      text: selected.transcriptFinal,
      confidence: selected.bestConfidence ?? 0.8,
      language: selected.language,
    });
  }

  private pickPreferredSlot(
    slots: AzureSlot[],
    options: { preferTranscript: boolean },
  ): AzureSlot | null {
    const activeSlots = slots.filter((slot) => !slot.canceled);
    if (activeSlots.length === 0) return null;

    const [primary, ...alternatives] = activeSlots;
    const strategy =
      this.startOptions.dualLanguageStrategy ?? "fallback-on-low-confidence";
    const bestAlternative =
      alternatives.length > 0
        ? alternatives.reduce((best, current) =>
            this.compareSlots(best, current, options),
          )
        : null;

    if (!bestAlternative) return primary;
    if (strategy === "parallel") {
      return this.compareSlots(primary, bestAlternative, options);
    }

    const primaryConfidence = primary.bestConfidence ?? 0;
    if (!primary.transcriptFinal.trim() && !primary.lastPartial.trim()) {
      return bestAlternative;
    }
    if (
      bestAlternative.bestConfidence !== null &&
      bestAlternative.bestConfidence > primaryConfidence &&
      primaryConfidence < DUAL_FALLBACK_CONFIDENCE_THRESHOLD
    ) {
      return bestAlternative;
    }
    if (
      options.preferTranscript &&
      !primary.transcriptFinal.trim() &&
      bestAlternative.transcriptFinal.trim()
    ) {
      return bestAlternative;
    }
    if (
      !options.preferTranscript &&
      !primary.lastPartial.trim() &&
      bestAlternative.lastPartial.trim()
    ) {
      return bestAlternative;
    }
    return primary;
  }

  private compareSlots(
    left: AzureSlot,
    right: AzureSlot,
    options: { preferTranscript: boolean },
  ) {
    const leftConfidence = left.bestConfidence ?? 0;
    const rightConfidence = right.bestConfidence ?? 0;
    if (rightConfidence > leftConfidence) return right;
    if (rightConfidence < leftConfidence) return left;

    const leftText = options.preferTranscript
      ? left.transcriptFinal
      : left.lastPartial;
    const rightText = options.preferTranscript
      ? right.transcriptFinal
      : right.lastPartial;
    if (rightText.length > leftText.length) return right;
    return left;
  }
}
