import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SettingsStore } from "./settings-store.js";
import { wrapStoreEnvelope } from "./store-utils.js";

describe("settings store defaults", () => {
  it("keeps auto paste enabled by default", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "voice-settings-"));
    const store = new SettingsStore(path.join(dir, "settings.json"));

    const settings = await store.load();
    expect(settings.autoPasteEnabled).toBe(true);
    expect(settings.lowConfidencePolicy).toBe("paste");
  });

  it("migrates legacy settings without auto paste and confidence policy keys", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "voice-settings-"));
    const filePath = path.join(dir, "settings.json");
    await writeFile(
      filePath,
      JSON.stringify(
        wrapStoreEnvelope({
          hotkeyPrimary: "CommandOrControl+Super",
          hotkeyFallback: "CommandOrControl+Super+Space",
          toneMode: "casual",
          languageMode: "pt-BR",
          sttProvider: "azure",
        }),
        null,
        2,
      ),
    );

    const store = new SettingsStore(filePath);
    const settings = await store.load();

    expect(settings.autoPasteEnabled).toBe(true);
    expect(settings.lowConfidencePolicy).toBe("paste");
  });
});
