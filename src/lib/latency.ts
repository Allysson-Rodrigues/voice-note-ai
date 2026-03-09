export type LatencyProfile = "fast" | "balanced" | "accurate";

export const STOP_GRACE_BY_PROFILE: Record<LatencyProfile, number> = {
  fast: 80,
  balanced: 200,
  accurate: 350,
};

export function latencyProfileFromStopGrace(
  stopGraceMs: number,
): LatencyProfile {
  if (stopGraceMs <= 120) return "fast";
  if (stopGraceMs >= 300) return "accurate";
  return "balanced";
}
