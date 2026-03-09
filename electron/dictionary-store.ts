import { randomUUID } from 'node:crypto';
import {
  quarantineFile,
  readTextFilePair,
  unwrapStoreEnvelope,
  wrapStoreEnvelope,
  writeTextFileAtomic,
} from './store-utils.js';

export type DictionaryTerm = {
  id: string;
  term: string;
  hintPt?: string;
  enabled: boolean;
  createdAt: string;
};

export type DictionaryAddInput = {
  term: string;
  hintPt?: string;
};

export type DictionaryUpdateInput = {
  id: string;
  term?: string;
  hintPt?: string;
  enabled?: boolean;
};

export function normalizeDictionaryTerm(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function dedupeCaseInsensitive(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const normalized = normalizeDictionaryTerm(value);
    if (!normalized) continue;
    const key = normalized.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }
  return out;
}

function normalizeHint(value?: string): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = normalizeDictionaryTerm(value);
  return normalized || undefined;
}

function parseDictionary(raw: unknown): DictionaryTerm[] {
  if (!Array.isArray(raw)) return [];
  const parsed: DictionaryTerm[] = [];
  const seenIds = new Set<string>();
  const seenTerms = new Set<string>();

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const candidate = item as Partial<DictionaryTerm>;
    if (typeof candidate.id !== 'string' || !candidate.id.trim()) continue;
    const term = normalizeDictionaryTerm(typeof candidate.term === 'string' ? candidate.term : '');
    if (!term) continue;

    const id = candidate.id.trim();
    if (seenIds.has(id)) continue;
    const termKey = term.toLocaleLowerCase();
    if (seenTerms.has(termKey)) continue;

    seenIds.add(id);
    seenTerms.add(termKey);
    parsed.push({
      id,
      term,
      hintPt: normalizeHint(candidate.hintPt),
      enabled: candidate.enabled !== false,
      createdAt:
        typeof candidate.createdAt === 'string' && candidate.createdAt
          ? candidate.createdAt
          : new Date().toISOString(),
    });
  }

  return parsed;
}

export class DictionaryStore {
  private readonly filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  async list(): Promise<DictionaryTerm[]> {
    const loaded = await this.loadRaw();
    return loaded.slice().sort((a, b) => a.term.localeCompare(b.term));
  }

  async add(input: DictionaryAddInput): Promise<DictionaryTerm> {
    const term = normalizeDictionaryTerm(input.term);
    if (!term) {
      throw new Error('Term is required.');
    }

    const entries = await this.loadRaw();
    const exists = entries.some(
      (item) => item.term.toLocaleLowerCase() === term.toLocaleLowerCase(),
    );
    if (exists) {
      throw new Error('Term already exists.');
    }

    const next: DictionaryTerm = {
      id: randomUUID(),
      term,
      hintPt: normalizeHint(input.hintPt),
      enabled: true,
      createdAt: new Date().toISOString(),
    };

    entries.push(next);
    await this.persist(entries);
    return next;
  }

  async update(input: DictionaryUpdateInput): Promise<DictionaryTerm> {
    const id = input.id?.trim();
    if (!id) {
      throw new Error('Term id is required.');
    }

    const entries = await this.loadRaw();
    const index = entries.findIndex((item) => item.id === id);
    if (index < 0) {
      throw new Error('Term not found.');
    }

    const current = entries[index];
    const nextTerm =
      typeof input.term === 'string' ? normalizeDictionaryTerm(input.term) : current.term;

    if (!nextTerm) {
      throw new Error('Term cannot be empty.');
    }

    const duplicate = entries.some(
      (item, currentIndex) =>
        currentIndex !== index && item.term.toLocaleLowerCase() === nextTerm.toLocaleLowerCase(),
    );
    if (duplicate) {
      throw new Error('Term already exists.');
    }

    const updated: DictionaryTerm = {
      ...current,
      term: nextTerm,
      hintPt: typeof input.hintPt === 'string' ? normalizeHint(input.hintPt) : current.hintPt,
      enabled: typeof input.enabled === 'boolean' ? input.enabled : current.enabled,
    };

    entries[index] = updated;
    await this.persist(entries);
    return updated;
  }

  async remove(id: string): Promise<{ ok: boolean }> {
    const cleanId = id.trim();
    if (!cleanId) {
      throw new Error('Term id is required.');
    }

    const entries = await this.loadRaw();
    const next = entries.filter((item) => item.id !== cleanId);
    const removed = next.length !== entries.length;
    if (removed) {
      await this.persist(next);
    }
    return { ok: removed };
  }

  async activePhrases(extraValues: string[] = []): Promise<string[]> {
    const entries = await this.loadRaw();
    const terms = entries
      .filter((item) => item.enabled)
      .flatMap((item) => [item.term, item.hintPt ?? '']);

    return dedupeCaseInsensitive([...extraValues, ...terms]);
  }

  async export(): Promise<{ exportedAt: string; terms: DictionaryTerm[] }> {
    const terms = await this.list();
    return {
      exportedAt: new Date().toISOString(),
      terms,
    };
  }

  async import(payload: { terms: DictionaryTerm[]; mode?: 'replace' | 'merge' }) {
    const nextTerms = parseDictionary(payload.terms);
    const current = payload.mode === 'replace' ? [] : await this.loadRaw();
    const merged = parseDictionary([...current, ...nextTerms]);
    await this.persist(merged);
    return { ok: true, count: merged.length };
  }

  private async loadRaw(): Promise<DictionaryTerm[]> {
    const pair = await readTextFilePair(this.filePath);
    const primary = this.tryParse(pair.primary);
    if (primary) {
      if (primary.needsMigration) {
        await this.persist(primary.entries);
      }
      return primary.entries;
    }

    const backup = this.tryParse(pair.backup);
    if (backup) {
      await this.persist(backup.entries);
      return backup.entries;
    }

    if (pair.primary != null) {
      await quarantineFile(this.filePath, 'corrupt');
    }

    return [];
  }

  private async persist(entries: DictionaryTerm[]): Promise<void> {
    await writeTextFileAtomic(this.filePath, JSON.stringify(wrapStoreEnvelope(entries), null, 2));
  }

  private tryParse(content: string | null) {
    if (content == null) return null;

    try {
      const raw = JSON.parse(content);
      const envelope = unwrapStoreEnvelope<unknown>(raw);
      return {
        entries: parseDictionary(envelope.data),
        needsMigration: envelope.version < 1,
      };
    } catch {
      return null;
    }
  }
}
