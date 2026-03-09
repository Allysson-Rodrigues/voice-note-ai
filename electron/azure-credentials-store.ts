import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import {
  quarantineFile,
  readTextFilePair,
  unwrapStoreEnvelope,
  wrapStoreEnvelope,
  writeTextFileAtomic,
} from './store-utils.js';

export type AzureCredentialSource = 'secure-store' | 'environment' | 'missing';
export type AzureCredentialStorageMode = 'encrypted' | 'plain' | 'none';

export type AzureCredentialsInput = {
  key: string;
  region: string;
};

type StoredAzureCredentials = AzureCredentialsInput & {
  updatedAt: string;
};

type AzureCredentialsStoreOptions = {
  isEncryptionAvailable: () => boolean;
  encryptString: (value: string) => string;
  decryptString: (value: string) => string;
};

function normalizeCredentialValue(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function parseStoredCredentials(raw: unknown): StoredAzureCredentials | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as Partial<StoredAzureCredentials>;
  const key = typeof item.key === 'string' ? item.key.trim() : '';
  const region = typeof item.region === 'string' ? normalizeCredentialValue(item.region) : '';

  if (!key || !region) return null;

  return {
    key,
    region,
    updatedAt:
      typeof item.updatedAt === 'string' && item.updatedAt.trim()
        ? item.updatedAt
        : new Date().toISOString(),
  };
}

function stripCredentialSource(
  value: StoredAzureCredentials | null,
  storageMode: AzureCredentialStorageMode,
  encryptionAvailable: boolean,
) {
  if (!value) {
    return {
      source: 'missing' as const,
      storageMode: 'none' as const,
      hasStoredCredentials: false,
      encryptionAvailable,
      canPersistSecurely: encryptionAvailable,
    };
  }

  return {
    source: 'secure-store' as const,
    storageMode,
    hasStoredCredentials: true,
    encryptionAvailable,
    canPersistSecurely: encryptionAvailable,
    region: value.region,
    updatedAt: value.updatedAt,
  };
}

export class AzureCredentialsStore {
  private readonly filePath: string;
  private readonly options: AzureCredentialsStoreOptions;
  private cached: StoredAzureCredentials | null = null;
  private storageMode: AzureCredentialStorageMode = 'none';

  constructor(filePath: string, options: AzureCredentialsStoreOptions) {
    this.filePath = filePath;
    this.options = options;
  }

  async load() {
    const encryptionAvailable = this.options.isEncryptionAvailable();
    const pair = await readTextFilePair(this.filePath);
    const primary = await this.tryParse(pair.primary);
    if (primary) {
      this.cached = primary.credentials;
      this.storageMode = primary.storageMode;
      if (primary.needsMigration && encryptionAvailable) {
        this.storageMode = 'encrypted';
        await this.persistCurrent();
      }
      return this.cached;
    }

    const backup = await this.tryParse(pair.backup);
    if (backup) {
      this.cached = backup.credentials;
      this.storageMode = backup.storageMode;
      if (encryptionAvailable) {
        this.storageMode = 'encrypted';
        await this.persistCurrent();
      }
      return this.cached;
    }

    if (pair.primary != null) {
      await quarantineFile(this.filePath, 'corrupt');
    }
    this.cached = null;
    this.storageMode = 'none';
    return null;
  }

  getStatus(env: NodeJS.ProcessEnv = process.env) {
    const encryptionAvailable = this.options.isEncryptionAvailable();
    if (this.cached) {
      return stripCredentialSource(this.cached, this.storageMode, encryptionAvailable);
    }

    const key = (env.AZURE_SPEECH_KEY ?? '').trim();
    const region = normalizeCredentialValue(env.AZURE_SPEECH_REGION ?? '');
    if (key && region) {
      return {
        source: 'environment' as const,
        storageMode: 'none' as const,
        hasStoredCredentials: false,
        encryptionAvailable,
        canPersistSecurely: encryptionAvailable,
        region,
      };
    }

    return stripCredentialSource(null, 'none', encryptionAvailable);
  }

  resolve(env: NodeJS.ProcessEnv = process.env) {
    if (this.cached) {
      return {
        key: this.cached.key,
        region: this.cached.region,
        source: 'secure-store' as AzureCredentialSource,
        storageMode: this.storageMode,
      };
    }

    const key = (env.AZURE_SPEECH_KEY ?? '').trim();
    const region = normalizeCredentialValue(env.AZURE_SPEECH_REGION ?? '');
    if (key && region) {
      return {
        key,
        region,
        source: 'environment' as AzureCredentialSource,
        storageMode: 'none' as AzureCredentialStorageMode,
      };
    }

    return {
      key: '',
      region: '',
      source: 'missing' as AzureCredentialSource,
      storageMode: 'none' as AzureCredentialStorageMode,
    };
  }

  async save(input: AzureCredentialsInput) {
    const key = input.key.trim();
    const region = normalizeCredentialValue(input.region);
    if (!key || !region) {
      throw new Error('Azure Speech requer chave e regiao.');
    }
    if (!this.options.isEncryptionAvailable()) {
      throw new Error(
        'safeStorage indisponível neste ambiente. Para evitar texto simples, configure AZURE_SPEECH_KEY e AZURE_SPEECH_REGION no sistema.',
      );
    }

    this.cached = {
      key,
      region,
      updatedAt: new Date().toISOString(),
    };
    this.storageMode = 'encrypted';
    await this.persistCurrent();
    return this.getStatus();
  }

  async clear() {
    this.cached = null;
    this.storageMode = 'none';
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await rm(this.filePath, { force: true });
    await rm(`${this.filePath}.bak`, { force: true });
    return this.getStatus();
  }

  private async persistCurrent() {
    if (!this.cached) return;
    if (!this.options.isEncryptionAvailable()) {
      throw new Error('safeStorage indisponível para persistir credenciais com segurança.');
    }
    const serialized = JSON.stringify(wrapStoreEnvelope(this.cached), null, 2);
    const content = this.options.encryptString(serialized);
    await writeTextFileAtomic(this.filePath, content);
  }

  private async tryParse(content: string | null) {
    if (content == null) return null;

    const attempts: Array<{ raw: string; storageMode: AzureCredentialStorageMode }> = [];
    attempts.push({ raw: content, storageMode: 'plain' });

    if (this.options.isEncryptionAvailable()) {
      try {
        attempts.unshift({
          raw: this.options.decryptString(content),
          storageMode: 'encrypted',
        });
      } catch {
        // ignore encrypted parsing fallback
      }
    }

    for (const attempt of attempts) {
      try {
        const parsed = JSON.parse(attempt.raw);
        const envelope = unwrapStoreEnvelope<unknown>(parsed);
        const credentials = parseStoredCredentials(envelope.data);
        if (credentials) {
          return {
            credentials,
            storageMode: attempt.storageMode,
            needsMigration:
              attempt.storageMode === 'plain' && this.options.isEncryptionAvailable()
                ? true
                : envelope.version < 1,
          };
        }
      } catch {
        // try next decoding strategy
      }
    }

    return null;
  }
}
