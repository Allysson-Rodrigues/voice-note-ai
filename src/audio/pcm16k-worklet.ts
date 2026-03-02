type ProcessorOptions = {
  targetSampleRate: number;
  frameSamples: number;
};

class Pcm16kWorklet extends AudioWorkletProcessor {
  private targetSampleRate: number;
  private frameSamples: number;
  private ratio: number;
  private lastSample: number;
  private pos: number;
  private out: Int16Array;
  private outIndex: number;

  constructor(options?: AudioWorkletNodeOptions) {
    super();
    const opts = (options?.processorOptions ?? {}) as Partial<ProcessorOptions>;

    this.targetSampleRate = opts.targetSampleRate ?? 16000;
    this.frameSamples = opts.frameSamples ?? 320; // 20ms at 16kHz
    this.ratio = sampleRate / this.targetSampleRate;
    this.lastSample = 0;
    this.pos = 0;
    this.out = new Int16Array(this.frameSamples);
    this.outIndex = 0;
  }

  private pushSample(floatSample: number) {
    const clamped = Math.max(-1, Math.min(1, floatSample));
    const int16 = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    this.out[this.outIndex++] = int16 | 0;

    if (this.outIndex >= this.out.length) {
      this.port.postMessage(this.out.buffer, [this.out.buffer]);
      this.out = new Int16Array(this.frameSamples);
      this.outIndex = 0;
    }
  }

  process(inputs: Float32Array[][]) {
    const inputChannel = inputs[0]?.[0];
    if (!inputChannel || inputChannel.length === 0) return true;

    const input = new Float32Array(inputChannel.length + 1);
    input[0] = this.lastSample;
    input.set(inputChannel, 1);

    while (this.pos + 1 < input.length) {
      const idx = Math.floor(this.pos);
      const frac = this.pos - idx;
      const s0 = input[idx] ?? 0;
      const s1 = input[idx + 1] ?? s0;
      const sample = s0 + (s1 - s0) * frac;
      this.pushSample(sample);
      this.pos += this.ratio;
    }

    this.pos -= input.length - 1;
    this.lastSample = input[input.length - 1] ?? this.lastSample;
    return true;
  }
}

registerProcessor('pcm16k-worklet', Pcm16kWorklet);

