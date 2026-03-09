import { describe, expect, it } from "vitest";
import { classifyTranscriptIntent } from "./transcript-intent.js";

describe("transcript intent", () => {
  it("detects explicit numbered list speech", () => {
    expect(
      classifyTranscriptIntent(
        "item 1 revisar contrato número 2 enviar proposta",
      ),
    ).toBe("numbered-list");
  });

  it("detects app-driven chat context", () => {
    expect(
      classifyTranscriptIntent("oi pode revisar isso pra mim", {
        appKey: "slack",
      }),
    ).toBe("chat");
  });
});
