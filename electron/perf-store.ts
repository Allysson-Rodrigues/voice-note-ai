import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export type PerfSample = {
  sessionId: string;
  createdAt: string;
  pttToFirstPartialMs: number;
  pttToFinalMs: number;
  injectTotalMs: number;
  resolveWindowMs?: number;
  pasteAttemptMs?: number;
  clipboardRestoreMs?: number;
  retryCount: number;
  sessionDurationMs: number;
  skippedReason?: 'WINDOW_CHANGED' | 'PASTE_FAILED' | 'TIMEOUT';
};

type PerfSummary = {
  sampleCount: number;
  averages: {
    pttToFirstPartialMs: number;
    pttToFinalMs: number;
    injectTotalMs: number;
    sessionDurationMs: number;
  };
  skipCounts: Record<'WINDOW_CHANGED' | 'PASTE_FAILED' | 'TIMEOUT', number>;
};

const MAX_SAMPLES = 120;

function clampInt(value: unknown, min: number, max: number, fallback: number) {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function parseOptionalNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value);
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.round(parsed);
  }
  return undefined;
}

function parseSample(raw: unknown): PerfSample | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as Partial<PerfSample>;
  if (!item.sessionId || typeof item.sessionId !== 'string') return null;
  return {
    sessionId: item.sessionId,
    createdAt: typeof item.createdAt === 'string' && item.createdAt ? item.createdAt : new Date().toISOString(),
    pttToFirstPartialMs: clampInt(item.pttToFirstPartialMs, -1, 600000, -1),
    pttToFinalMs: clampInt(item.pttToFinalMs, -1, 600000, -1),
    injectTotalMs: clampInt(item.injectTotalMs, -1, 600000, -1),
    resolveWindowMs: parseOptionalNumber(item.resolveWindowMs),
    pasteAttemptMs: parseOptionalNumber(item.pasteAttemptMs),
    clipboardRestoreMs: parseOptionalNumber(item.clipboardRestoreMs),
    retryCount: clampInt(item.retryCount, 0, 10, 0),
    sessionDurationMs: clampInt(item.sessionDurationMs, 0, 600000, 0),
    skippedReason:
      item.skippedReason === 'WINDOW_CHANGED' ||
      item.skippedReason === 'PASTE_FAILED' ||
      item.skippedReason === 'TIMEOUT'
        ? item.skippedReason
        : undefined,
  };
}

function average(values: number[]) {
  const filtered = values.filter((value) => Number.isFinite(value) && value >= 0);
  if (filtered.length === 0) return -1;
  return Math.round(filtered.reduce((sum, value) => sum + value, 0) / filtered.length);
}

export class PerfStore {
  constructor(private readonly filePath: string) {}

  async append(sample: PerfSample): Promise<void> {
    const next = parseSample(sample);
    if (!next) {
      throw new Error('Perf sample is invalid.');
    }
    const existing = await this.loadRaw();
    existing.push(next);
    const trimmed = existing.slice(-MAX_SAMPLES);
    await this.persist(trimmed);
  }

  async getRecent(limit = 20): Promise<PerfSample[]> {
    const all = await this.loadRaw();
    const clamped = Math.max(1, Math.min(MAX_SAMPLES, Math.round(limit)));
    return all.slice(-clamped);
  }

  async getSummary(): Promise<PerfSummary> {
    const samples = await this.loadRaw();
    const skipCounts = {
      WINDOW_CHANGED: 0,
      PASTE_FAILED: 0,
      TIMEOUT: 0,
    };
    for (const sample of samples) {
      if (sample.skippedReason) skipCounts[sample.skippedReason] += 1;
    }
    return {
      sampleCount: samples.length,
      averages: {
        pttToFirstPartialMs: average(samples.map((sample) => sample.pttToFirstPartialMs)),
        pttToFinalMs: average(samples.map((sample) => sample.pttToFinalMs)),
        injectTotalMs: average(samples.map((sample) => sample.injectTotalMs)),
        sessionDurationMs: average(samples.map((sample) => sample.sessionDurationMs)),
      },
      skipCounts,
    };
  }

  private async loadRaw(): Promise<PerfSample[]> {
    try {
      const content = await readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(content);
      if (!Array.isArray(parsed)) {
        await this.persist([]);
        return [];
      }
      const samples = parsed.map((entry) => parseSample(entry)).filter((entry): entry is PerfSample => Boolean(entry));
      await this.persist(samples);
      return samples;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') return [];
      if (error instanceof SyntaxError) {
        await this.persist([]);
        return [];
      }
      throw error;
    }
  }

  private async persist(samples: PerfSample[]): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(samples, null, 2), 'utf8');
  }
}

export type { PerfSummary };
