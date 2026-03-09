import { afterEach, describe, expect, it, vi } from "vitest";
import { getRecentLogs, logError, logInfo, logWarn } from "./logger.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("logger", () => {
  it("redacts sensitive transcript fields from renderer-facing logs", () => {
    logInfo("session completed", {
      sessionId: "abc123",
      text: "texto final sensivel",
      rawText: "texto bruto sensivel",
      nested: {
        transcript: "trecho interno",
        kept: 42,
      },
    });

    const [entry] = getRecentLogs(1);
    expect(entry?.context).toEqual({
      sessionId: "abc123",
      text: "[redacted]",
      rawText: "[redacted]",
      nested: {
        transcript: "[redacted]",
        kept: 42,
      },
    });
  });

  it("redacts sensitive transcript fields before writing to console sinks", () => {
    const infoSpy = vi
      .spyOn(console, "log")
      .mockImplementation(() => undefined);
    const warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    logInfo("info event", {
      text: "texto final sensivel",
      nested: { transcript: "trecho interno" },
    });
    logWarn("warn event", {
      rawText: "texto bruto sensivel",
    });
    logError("error event", {
      transcriptFinal: "texto final bruto",
    });

    expect(infoSpy).toHaveBeenCalledWith(
      expect.stringContaining('"text":"[redacted]"'),
    );
    expect(infoSpy).toHaveBeenCalledWith(
      expect.stringContaining('"transcript":"[redacted]"'),
    );
    expect(infoSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("texto final sensivel"),
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('"rawText":"[redacted]"'),
    );
    expect(warnSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("texto bruto sensivel"),
    );
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('"transcriptFinal":"[redacted]"'),
    );
    expect(errorSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("texto final bruto"),
    );
  });
});
