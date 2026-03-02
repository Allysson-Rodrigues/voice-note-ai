import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type HudState = "idle" | "listening" | "finalizing" | "injecting" | "success" | "error";

type HudEvent = {
  state: HudState;
  message?: string;
};

type HudLevelEvent = {
  level: number;
};

const BAR_COUNT = 40;

// Matches the reference demo: irregular profile so the wave doesn't look like a perfect bell.
const AMPLITUDE_PROFILE: number[] = [
  0.18, 0.32, 0.22, 0.55, 0.28, 0.72, 0.38, 0.91, 0.45, 0.62, 0.3, 0.85, 0.42, 0.98, 0.55, 0.78, 0.35,
  0.65, 0.2, 0.88, 0.95, 0.4, 0.75, 0.25, 0.82, 0.5, 0.68, 0.33, 0.9, 0.48, 0.7, 0.22, 0.58, 0.85, 0.3,
  0.65, 0.42, 0.78, 0.25, 0.15,
];

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function formatDuration(sec: number) {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m${s}s`;
}

export default function WisprHudPill() {
  const [hudState, setHudState] = useState<HudState>("idle");
  const [durationSec, setDurationSec] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const targetLevelRef = useRef(0);
  const smoothedLevelRef = useRef(0);
  const startedAtRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const hudStateRef = useRef<HudState>("idle");
  const barsRef = useRef<Array<HTMLSpanElement | null>>(Array.from({ length: BAR_COUNT }, () => null));

  const noise = useRef(
    AMPLITUDE_PROFILE.map((_, i) => ({
      phase: i * 0.71 + ((i * 137.508) % 6.28),
      speed: 5.5 + ((i * 0.618) % 6),
      speed2: 2.8 + ((i * 0.382) % 4),
    })),
  );

  hudStateRef.current = hudState;

  const stopRaf = useCallback(() => {
    if (rafRef.current != null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startWave = useCallback(() => {
    stopRaf();
    const tick = () => {
      if (hudStateRef.current !== "listening") return;

      const t = targetLevelRef.current;
      const p = smoothedLevelRef.current;
      smoothedLevelRef.current = p + (t > p ? 0.55 : 0.12) * (t - p);

      const s = smoothedLevelRef.current;
      const now = performance.now() / 1000;
      const bars = barsRef.current;

      for (let i = 0; i < BAR_COUNT; i += 1) {
        const profile = AMPLITUDE_PROFILE[i] ?? 0.3;
        const { phase, speed, speed2 } = noise.current[i] ?? { phase: i * 0.7, speed: 6, speed2: 3 };
        const osc =
          0.2 * Math.sin(now * speed + phase) +
          0.1 * Math.sin(now * speed2 + phase * 1.4) +
          0.05 * Math.sin(now * speed * 2.3 + i * 0.3);

        // The max(s, 0.08) keeps the wave alive even when speaking quietly.
        const v = clamp01(s * profile + osc * Math.max(s, 0.08));
        const heightPx = 2 + v * 30;

        const el = bars[i];
        if (el) {
          el.style.height = `${heightPx}px`;
          el.style.opacity = String(0.35 + v * 0.65);
        }
      }

      rafRef.current = window.requestAnimationFrame(tick);
    };

    rafRef.current = window.requestAnimationFrame(tick);
  }, [stopRaf]);

  const resetBars = useCallback(() => {
    const bars = barsRef.current;
    for (let i = 0; i < BAR_COUNT; i += 1) {
      const el = bars[i];
      if (!el) continue;
      el.style.height = "2px";
      el.style.opacity = "0.35";
    }
  }, []);

  const resolveLabel = useCallback(() => {
    if (hudState === "error") return error || "Erro ao transcrever";
    if (hudState === "success") return successMessage || "Concluido";
    return "";
  }, [error, hudState, successMessage]);

  useEffect(() => {
    if (!window.voiceNoteAI) return;

    const offHud = window.voiceNoteAI.onHudState((payload: HudEvent) => {
      const prev = hudStateRef.current;
      setHudState(payload.state);

      if (payload.state === "idle") {
        setError(null);
        setSuccessMessage(null);
        setDurationSec(0);
        startedAtRef.current = null;
        smoothedLevelRef.current = 0;
        stopTimer();
        stopRaf();
        resetBars();
        return;
      }

      if (payload.state === "listening") {
        setError(null);
        setSuccessMessage(null);
        startedAtRef.current = Date.now();
        smoothedLevelRef.current = 0;
        setDurationSec(0);

        stopTimer();
        timerRef.current = window.setInterval(() => {
          if (!startedAtRef.current) return;
          setDurationSec(Math.max(0, Math.floor((Date.now() - startedAtRef.current) / 1000)));
        }, 200);

        startWave();
        return;
      }

      if (payload.state === "error") {
        setError(payload.message ?? "Erro ao transcrever");
        if (prev === "listening") {
          stopTimer();
          stopRaf();
          resetBars();
        }
        return;
      }

      if (payload.state === "success") {
        setSuccessMessage(payload.message ?? null);
        if (prev === "listening") {
          stopTimer();
          stopRaf();
          resetBars();
        }
        return;
      }

      // Any other non-listening state: ensure capture-related loops are stopped.
      if (prev === "listening") {
        stopTimer();
        stopRaf();
        resetBars();
      }
    });

    const offLevel = window.voiceNoteAI.onHudLevel((payload: HudLevelEvent) => {
      targetLevelRef.current = clamp01(Number(payload.level) || 0);
    });

    return () => {
      offHud();
      offLevel();
      stopTimer();
      stopRaf();
    };
  }, [resetBars, startWave, stopRaf, stopTimer]);

  const isIdle = hudState === "idle";
  const isListening = hudState === "listening";
  const isProcessing = hudState === "finalizing" || hudState === "injecting";
  const showLabel = hudState === "success" || hudState === "error";
  const isExpanded = !isIdle;

  const labelText = resolveLabel();
  const labelClass = hudState === "error" ? "error" : hudState === "success" ? "success" : "neutral";

  const bars = useMemo(() => Array.from({ length: BAR_COUNT }), []);

  return (
    <div className="hud-root">
      <div className="hud-stage">
        <div className={`hud-pill state-${hudState} ${isExpanded ? "expanded" : ""}`}>
          {isProcessing ? <span className="hud-shimmer" aria-hidden /> : null}

          <span className="hud-dot" />

          {isListening ? (
            <div className="hud-wave" aria-hidden>
              {bars.map((_, i) => (
                <span
                  key={i}
                  className="hud-wave-bar"
                  ref={(el) => {
                    barsRef.current[i] = el;
                  }}
                />
              ))}
            </div>
          ) : null}

          {showLabel ? <span className={`hud-label ${labelClass}`}>{labelText}</span> : null}

          {isListening ? (
            <>
              <span className="hud-sep" />
              <span className="hud-meta">{formatDuration(durationSec)}</span>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
