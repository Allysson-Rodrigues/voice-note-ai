import { describe, expect, it } from "vitest";
import { mergeUniquePhrases, normalizeDictionaryTerm } from "@/lib/dictionary";

describe("dictionary helpers", () => {
  it("normalizes whitespace and trims terms", () => {
    expect(normalizeDictionaryTerm("  standup   meeting ")).toBe(
      "standup meeting",
    );
  });

  it("merges and deduplicates env + dictionary phrases case-insensitively", () => {
    const merged = mergeUniquePhrases(
      ["Slack", " standup ", "notebook"],
      ["slack", "reunião diária", "Notebook", " "],
    );

    expect(merged).toEqual(["Slack", "standup", "notebook", "reunião diária"]);
  });

  it("filters out invalid values", () => {
    const merged = mergeUniquePhrases(["   ", ""], ["\n", "\t"]);
    expect(merged).toEqual([]);
  });
});
