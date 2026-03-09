import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AzureCredentialsStore } from "./azure-credentials-store.js";

async function createStore(encryptionAvailable = true) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "voice-azure-credentials-"));
  const filePath = path.join(dir, "azure-credentials.json");
  const store = new AzureCredentialsStore(filePath, {
    isEncryptionAvailable: () => encryptionAvailable,
    encryptString: (value) => `enc:${value}`,
    decryptString: (value) => {
      if (!value.startsWith("enc:"))
        throw new Error("invalid encrypted payload");
      return value.slice(4);
    },
  });
  return { store, filePath };
}

describe("azure credentials store", () => {
  it("recusa novas gravacoes quando safeStorage nao esta disponivel", async () => {
    const { store } = await createStore(false);

    await expect(
      store.save({
        key: "secret-key",
        region: "brazilsouth",
      }),
    ).rejects.toThrow(/safeStorage indisponível/i);
  });

  it("migra snapshots legados em texto simples quando a criptografia esta disponivel", async () => {
    const { store, filePath } = await createStore(true);
    await writeFile(
      filePath,
      JSON.stringify(
        {
          version: 1,
          data: {
            key: "secret-key",
            region: "brazilsouth",
            updatedAt: "2026-03-08T00:00:00.000Z",
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    await store.load();

    const persisted = await readFile(filePath, "utf8");
    expect(persisted.startsWith("enc:")).toBe(true);
    expect(store.resolve()).toMatchObject({
      key: "secret-key",
      region: "brazilsouth",
      storageMode: "encrypted",
    });
  });
});
