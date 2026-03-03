import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { HistoryStore } from './history-store.js';

async function createStore() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'voice-history-'));
  const filePath = path.join(dir, 'history.json');
  return {
    store: new HistoryStore(filePath),
    filePath,
  };
}

describe('history store', () => {
  it('appends entries and lists newest first with query filter', async () => {
    const { store } = await createStore();

    await store.append(
      {
        sessionId: 'a1',
        text: 'primeira nota',
        pasted: true,
        retryCount: 0,
        sessionDurationMs: 1200,
        injectTotalMs: 180,
        createdAt: '2026-03-01T10:00:00.000Z',
      },
      30,
    );
    await store.append(
      {
        sessionId: 'a2',
        text: 'segunda nota importante',
        pasted: false,
        retryCount: 1,
        sessionDurationMs: 1800,
        injectTotalMs: 260,
        createdAt: '2026-03-01T10:01:00.000Z',
      },
      30,
    );

    const all = await store.list();
    expect(all).toHaveLength(2);
    expect(all[0]?.sessionId).toBe('a2');
    expect(all[1]?.sessionId).toBe('a1');

    const filtered = await store.list({ query: 'importante' });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.sessionId).toBe('a2');
  });

  it('prunes by retention days and supports remove/clear', async () => {
    const { store } = await createStore();

    await store.append(
      {
        sessionId: 'old',
        text: 'nota antiga',
        pasted: false,
        retryCount: 0,
        sessionDurationMs: 1000,
        injectTotalMs: 120,
        createdAt: '2000-01-01T00:00:00.000Z',
      },
      30,
    );
    await store.append(
      {
        sessionId: 'new',
        text: 'nota recente',
        pasted: true,
        retryCount: 0,
        sessionDurationMs: 1000,
        injectTotalMs: 120,
      },
      30,
    );

    await store.prune(30);
    const retained = await store.list();
    expect(retained).toHaveLength(1);

    const removed = await store.remove(retained[0]?.id ?? '');
    expect(removed.ok).toBe(true);

    await store.append(
      {
        sessionId: 'x',
        text: 'item um',
        pasted: true,
        retryCount: 0,
        sessionDurationMs: 900,
        injectTotalMs: 80,
      },
      30,
    );
    await store.append(
      {
        sessionId: 'y',
        text: 'item dois',
        pasted: true,
        retryCount: 0,
        sessionDurationMs: 900,
        injectTotalMs: 80,
      },
      30,
    );

    const cleared = await store.clear();
    expect(cleared.ok).toBe(true);
    expect(cleared.removed).toBe(2);
    expect(await store.list()).toHaveLength(0);
  });

  it('self-heals malformed file on load', async () => {
    const { store, filePath } = await createStore();
    await writeFile(filePath, '{not-json', 'utf8');

    const entries = await store.list();
    expect(entries).toHaveLength(0);

    const content = await readFile(filePath, 'utf8');
    expect(content.trim()).toBe('[]');
  });
});
