export function normalizeDictionaryTerm(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function mergeUniquePhrases(envValues: string[], dictionaryValues: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const value of [...envValues, ...dictionaryValues]) {
    const normalized = normalizeDictionaryTerm(value);
    if (!normalized) continue;
    const key = normalized.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }

  return out;
}
