import { describe, expect, it } from "vitest";
import { hotkeyLabelFromAccelerator, pickToggleHotkeyMode } from "@/lib/hotkey";

describe("hotkey helpers", () => {
  it("maps accelerator to user label", () => {
    expect(hotkeyLabelFromAccelerator("CommandOrControl+Super")).toBe(
      "Ctrl+Win",
    );
    expect(hotkeyLabelFromAccelerator("CommandOrControl+Super+Space")).toBe(
      "Ctrl+Win+Space",
    );
  });

  it("selects fallback mode when primary fails", () => {
    expect(pickToggleHotkeyMode(true, false)).toBe("toggle-primary");
    expect(pickToggleHotkeyMode(false, true)).toBe("toggle-fallback");
    expect(pickToggleHotkeyMode(false, false)).toBe("unavailable");
  });
});
