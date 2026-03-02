import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

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
  return value.replace(/\s+/g, " ").trim();
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
  if (typeof value !== "string") return undefined;
  const normalized = normalizeDictionaryTerm(value);
  return normalized || undefined;
}

function parseDictionary(raw: unknown): DictionaryTerm[] {
  if (!Array.isArray(raw)) return [];
  const parsed: DictionaryTerm[] = [];
  const seenIds = new Set<string>();
  const seenTerms = new Set<string>();

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const candidate = item as Partial<DictionaryTerm>;
    if (typeof candidate.id !== "string" || !candidate.id.trim()) continue;
    const term = normalizeDictionaryTerm(typeof candidate.term === "string" ? candidate.term : "");
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
      createdAt: typeof candidate.createdAt === "string" && candidate.createdAt ? candidate.createdAt : new Date().toISOString(),
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
      throw new Error("Term is required.");
    }

    const entries = await this.loadRaw();
    const exists = entries.some((item) => item.term.toLocaleLowerCase() === term.toLocaleLowerCase());
    if (exists) {
      throw new Error("Term already exists.");
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
      throw new Error("Term id is required.");
    }

    const entries = await this.loadRaw();
    const index = entries.findIndex((item) => item.id === id);
    if (index < 0) {
      throw new Error("Term not found.");
    }

    const current = entries[index];
    const nextTerm =
      typeof input.term === "string" ? normalizeDictionaryTerm(input.term) : current.term;

    if (!nextTerm) {
      throw new Error("Term cannot be empty.");
    }

    const duplicate = entries.some(
      (item, currentIndex) =>
        currentIndex !== index && item.term.toLocaleLowerCase() === nextTerm.toLocaleLowerCase(),
    );
    if (duplicate) {
      throw new Error("Term already exists.");
    }

    const updated: DictionaryTerm = {
      ...current,
      term: nextTerm,
      hintPt: typeof input.hintPt === "string" ? normalizeHint(input.hintPt) : current.hintPt,
      enabled: typeof input.enabled === "boolean" ? input.enabled : current.enabled,
    };

    entries[index] = updated;
    await this.persist(entries);
    return updated;
  }

  async remove(id: string): Promise<{ ok: boolean }> {
    const cleanId = id.trim();
    if (!cleanId) {
      throw new Error("Term id is required.");
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
      .flatMap((item) => [item.term, item.hintPt ?? ""]);

    return dedupeCaseInsensitive([...extraValues, ...terms]);
  }

  private async loadRaw(): Promise<DictionaryTerm[]> {
    try {
      const content = await readFile(this.filePath, "utf8");
      const parsed = parseDictionary(JSON.parse(content));
      // Self-heal malformed file on read.
      await this.persist(parsed);
      return parsed;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") return [];
      if (error instanceof SyntaxError) {
        await this.persist([]);
        return [];
      }
      throw error;
    }
  }

  private async persist(entries: DictionaryTerm[]): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(entries, null, 2), "utf8");
  }
}
