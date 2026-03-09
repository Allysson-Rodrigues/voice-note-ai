import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { AdaptiveStore } from './adaptive-store.js';

async function createStore(codec?: {
  isEncryptionAvailable?: () => boolean;
  encryptString?: (value: string) => string;
  decryptString?: (value: string) => string;
}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'voice-adaptive-'));
  const filePath = path.join(dir, 'adaptive.json');
  return {
    store: new AdaptiveStore(filePath, codec),
    filePath,
  };
}

describe('adaptive store', () => {
  it('persists observed sessions', async () => {
    const { store } = await createStore();

    await store.load();
    await store.observeSession({
      appKey: 'slack',
      text: 'Workspace ticket alpha',
      intent: 'chat',
      languageChosen: 'en-US',
      confidenceBucket: 'low',
    });

    const state = store.get();
    expect(state.apps.slack?.sessionCount).toBe(1);
    expect(state.apps.slack?.lowConfidenceCount).toBe(1);
    expect(state.apps.slack?.termStats.workspace?.count).toBe(1);
  });

  it('encrypts persisted content when a codec is available', async () => {
    const codec = {
      isEncryptionAvailable: () => true,
      encryptString: (value: string) => Buffer.from(`enc:${value}`, 'utf8').toString('base64'),
      decryptString: (value: string) => {
        const decoded = Buffer.from(value, 'base64').toString('utf8');
        if (!decoded.startsWith('enc:')) throw new Error('invalid payload');
        return decoded.slice(4);
      },
    };
    const { store, filePath } = await createStore(codec);

    await store.load();
    await store.observeSession({
      appKey: 'slack',
      text: 'Workspace secure term',
    });

    const persisted = await readFile(filePath, 'utf8');
    expect(persisted).not.toContain('Workspace secure term');
    expect(() => JSON.parse(persisted)).toThrow();
  });

  it('migrates legacy plain-text snapshots to encrypted content on load', async () => {
    const codec = {
      isEncryptionAvailable: () => true,
      encryptString: (value: string) => Buffer.from(`enc:${value}`, 'utf8').toString('base64'),
      decryptString: (value: string) => {
        const decoded = Buffer.from(value, 'base64').toString('utf8');
        if (!decoded.startsWith('enc:')) throw new Error('invalid payload');
        return decoded.slice(4);
      },
    };
    const { store, filePath } = await createStore(codec);
    await writeFile(
      filePath,
      JSON.stringify(
        {
          version: 1,
          data: {
            apps: {
              slack: {
                appKey: 'slack',
                sessionCount: 1,
                lowConfidenceCount: 0,
                intentCounts: {},
                languageCounts: {},
                termStats: {
                  workspace: {
                    term: 'Workspace',
                    count: 2,
                    lastSeenAt: '2026-03-09T00:00:00.000Z',
                  },
                },
              },
            },
            dismissedSuggestionIds: [],
          },
        },
        null,
        2,
      ),
      'utf8',
    );

    const state = await store.load();
    expect(state.apps.slack?.termStats.workspace?.count).toBe(2);

    const persisted = await readFile(filePath, 'utf8');
    expect(persisted).not.toContain('"apps"');
  });
});
