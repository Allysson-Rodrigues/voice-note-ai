import {
  copyFile,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

export const STORE_SCHEMA_VERSION = 1;

export type StoreEnvelope<T> = {
  version: number;
  data: T;
};

export function wrapStoreEnvelope<T>(data: T): StoreEnvelope<T> {
  return {
    version: STORE_SCHEMA_VERSION,
    data,
  };
}

export function unwrapStoreEnvelope<T>(raw: unknown): {
  version: number;
  data: T;
} {
  if (
    raw &&
    typeof raw === "object" &&
    !Array.isArray(raw) &&
    "version" in raw &&
    typeof (raw as { version?: unknown }).version === "number" &&
    "data" in raw
  ) {
    return {
      version: Math.max(0, Math.round((raw as { version: number }).version)),
      data: (raw as { data: T }).data,
    };
  }

  return {
    version: 0,
    data: raw as T,
  };
}

export function getBackupFilePath(filePath: string) {
  return `${filePath}.bak`;
}

async function readTextIfExists(filePath: string) {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return null;
    throw error;
  }
}

export async function readTextFilePair(filePath: string) {
  return {
    primary: await readTextIfExists(filePath),
    backup: await readTextIfExists(getBackupFilePath(filePath)),
  };
}

export async function writeTextFileAtomic(filePath: string, content: string) {
  const directory = path.dirname(filePath);
  const backupPath = getBackupFilePath(filePath);
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;

  await mkdir(directory, { recursive: true });

  try {
    await rm(backupPath, { force: true });
  } catch {
    // ignore backup cleanup failures before persisting the new snapshot
  }

  try {
    await copyFile(filePath, backupPath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") throw error;
  }

  await writeFile(tempPath, content, "utf8");

  try {
    await rm(filePath, { force: true });
    await rename(tempPath, filePath);
  } catch (error) {
    try {
      await rm(tempPath, { force: true });
    } catch {
      // ignore temp cleanup failures after a failed atomic swap
    }

    const backupContent = await readTextIfExists(backupPath);
    if (backupContent != null) {
      await writeFile(filePath, backupContent, "utf8");
    }

    throw error;
  }
}

export async function quarantineFile(filePath: string, suffix = "corrupt") {
  const targetPath = `${filePath}.${suffix}.${Date.now()}`;
  try {
    await rename(filePath, targetPath);
    return targetPath;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return null;
    throw error;
  }
}
