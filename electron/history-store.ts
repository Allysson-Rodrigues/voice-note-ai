import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export type HistorySkipReason = 'WINDOW_CHANGED' | 'PASTE_FAILED' | 'TIMEOUT';

export type HistoryEntry = {
  id: string;
  sessionId: string;
  text: string;
  pasted: boolean;
  skippedReason?: HistorySkipReason;
  retryCount: number;
  sessionDurationMs: number;
  injectTotalMs: number;
  resolveWindowMs?: number;
  pasteAttemptMs?: number;
  clipboardRestoreMs?: number;
  createdAt: string;
};

export type HistoryListParams = {
  query?: string;
  limit?: number;
  offset?: number;
};

export type HistoryAppendInput = {
  sessionId: string;
  text: string;
  pasted: boolean;
  skippedReason?: HistorySkipReason;
  retryCount: number;
  sessionDurationMs: number;
  injectTotalMs: number;
  resolveWindowMs?: number;
  pasteAttemptMs?: number;
  clipboardRestoreMs?: number;
  createdAt?: string;
};

function clampInt(value: unknown, min: number, max: number, fallback: number) {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function normalizeText(value: string) {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parseOptionalNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value);
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.round(parsed);
  }
  return undefined;
}

function parseHistoryEntry(raw: unknown): HistoryEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as Partial<HistoryEntry>;
  const id = typeof item.id === 'string' ? item.id.trim() : '';
  const sessionId = typeof item.sessionId === 'string' ? item.sessionId.trim() : '';
  const text = typeof item.text === 'string' ? normalizeText(item.text) : '';
  const createdAt =
    typeof item.createdAt === 'string' && item.createdAt
      ? item.createdAt
      : new Date().toISOString();

  if (!id || !sessionId || !text) return null;

  const skippedReason =
    item.skippedReason === 'WINDOW_CHANGED' ||
    item.skippedReason === 'PASTE_FAILED' ||
    item.skippedReason === 'TIMEOUT'
      ? item.skippedReason
      : undefined;

  return {
    id,
    sessionId,
    text,
    pasted: item.pasted === true,
    skippedReason,
    retryCount: clampInt(item.retryCount, 0, 5, 0),
    sessionDurationMs: clampInt(item.sessionDurationMs, 0, 600000, 0),
    injectTotalMs: clampInt(item.injectTotalMs, -1, 120000, -1),
    resolveWindowMs: parseOptionalNumber(item.resolveWindowMs),
    pasteAttemptMs: parseOptionalNumber(item.pasteAttemptMs),
    clipboardRestoreMs: parseOptionalNumber(item.clipboardRestoreMs),
    createdAt,
  };
}

function sortNewestFirst(entries: HistoryEntry[]) {
  return entries.slice().sort((a, b) => {
    const bt = Date.parse(b.createdAt);
    const at = Date.parse(a.createdAt);
    if (!Number.isFinite(bt) || !Number.isFinite(at)) return b.createdAt.localeCompare(a.createdAt);
    return bt - at;
  });
}

export class HistoryStore {
  private readonly filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  async list(params: HistoryListParams = {}): Promise<HistoryEntry[]> {
    const entries = sortNewestFirst(await this.loadRaw());
    const query = (params.query ?? '').trim().toLocaleLowerCase();
    const filtered = query
      ? entries.filter((entry) => entry.text.toLocaleLowerCase().includes(query))
      : entries;
    const offset = clampInt(params.offset, 0, 100000, 0);
    const limit = clampInt(params.limit, 1, 500, 100);
    return filtered.slice(offset, offset + limit);
  }

  async append(input: HistoryAppendInput, retentionDays: number): Promise<HistoryEntry> {
    const text = normalizeText(input.text);
    if (!text) throw new Error('History entry text is required.');
    if (!input.sessionId?.trim()) throw new Error('History entry sessionId is required.');

    const next: HistoryEntry = {
      id: randomUUID(),
      sessionId: input.sessionId.trim(),
      text,
      pasted: input.pasted === true,
      skippedReason: input.skippedReason,
      retryCount: clampInt(input.retryCount, 0, 5, 0),
      sessionDurationMs: clampInt(input.sessionDurationMs, 0, 600000, 0),
      injectTotalMs: clampInt(input.injectTotalMs, -1, 120000, -1),
      resolveWindowMs: parseOptionalNumber(input.resolveWindowMs),
      pasteAttemptMs: parseOptionalNumber(input.pasteAttemptMs),
      clipboardRestoreMs: parseOptionalNumber(input.clipboardRestoreMs),
      createdAt:
        input.createdAt && input.createdAt.trim() ? input.createdAt : new Date().toISOString(),
    };

    const entries = await this.loadRaw();
    const persisted = this.pruneByRetention([...entries, next], retentionDays);
    await this.persist(persisted);
    return next;
  }

  async remove(id: string): Promise<{ ok: boolean }> {
    const cleanId = id.trim();
    if (!cleanId) throw new Error('History entry id is required.');

    const entries = await this.loadRaw();
    const next = entries.filter((item) => item.id !== cleanId);
    const removed = next.length !== entries.length;
    if (removed) await this.persist(next);
    return { ok: removed };
  }

  async clear(params: { before?: string } = {}): Promise<{ ok: boolean; removed: number }> {
    const entries = await this.loadRaw();
    if (!params.before) {
      if (entries.length > 0) await this.persist([]);
      return { ok: true, removed: entries.length };
    }

    const cutoff = Date.parse(params.before);
    if (!Number.isFinite(cutoff)) throw new Error('Invalid clear cutoff date.');

    const next = entries.filter((item) => Date.parse(item.createdAt) > cutoff);
    const removed = entries.length - next.length;
    if (removed > 0) await this.persist(next);
    return { ok: true, removed };
  }

  async prune(retentionDays: number): Promise<void> {
    const entries = await this.loadRaw();
    const next = this.pruneByRetention(entries, retentionDays);
    if (next.length !== entries.length) await this.persist(next);
  }

  private pruneByRetention(entries: HistoryEntry[], retentionDays: number) {
    const days = clampInt(retentionDays, 1, 365, 30);
    const cutoffMs = Date.now() - days * 24 * 60 * 60 * 1000;
    return entries.filter((entry) => {
      const created = Date.parse(entry.createdAt);
      if (!Number.isFinite(created)) return true;
      return created >= cutoffMs;
    });
  }

  private async loadRaw(): Promise<HistoryEntry[]> {
    try {
      const content = await readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(content);
      if (!Array.isArray(parsed)) {
        await this.persist([]);
        return [];
      }

      const entries: HistoryEntry[] = [];
      const seen = new Set<string>();
      for (const item of parsed) {
        const entry = parseHistoryEntry(item);
        if (!entry) continue;
        if (seen.has(entry.id)) continue;
        seen.add(entry.id);
        entries.push(entry);
      }

      await this.persist(entries);
      return entries;
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

  private async persist(entries: HistoryEntry[]): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(sortNewestFirst(entries), null, 2), 'utf8');
  }
}
