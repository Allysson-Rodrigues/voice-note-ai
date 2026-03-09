import { describe, expect, it } from "vitest";
import {
  STOP_GRACE_BY_PROFILE,
  latencyProfileFromStopGrace,
} from "@/lib/latency";

describe("latency profile mapping", () => {
  it("maps profiles to stop grace values", () => {
    expect(STOP_GRACE_BY_PROFILE.fast).toBe(80);
    expect(STOP_GRACE_BY_PROFILE.balanced).toBe(200);
    expect(STOP_GRACE_BY_PROFILE.accurate).toBe(350);
  });

  it("maps stop grace value back to profile", () => {
    expect(latencyProfileFromStopGrace(80)).toBe("fast");
    expect(latencyProfileFromStopGrace(200)).toBe("balanced");
    expect(latencyProfileFromStopGrace(350)).toBe("accurate");
  });
});
