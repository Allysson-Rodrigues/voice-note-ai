import { useEffect, useMemo, useRef, useState } from "react";

type HudState = "idle" | "listening" | "finalizing" | "injecting" | "success" | "error";

type HudEvent = {
  state: HudState;
  message?: string;
};

type HudLevelEvent = {
  level: number;
};

function resolveStatusMessage(state: HudState, message?: string, error?: string | null) {
  if (state === "error") return message || error || "Erro ao transcrever";
  if (state === "success") return message || "Concluido";
  return "";
}

export default function WisprHudPill() {
  const [hudState, setHudState] = useState<HudState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const [durationSec, setDurationSec] = useState(0);
  const successTimerRef = useRef<number | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const targetLevelRef = useRef(0);
  const smoothedLevelRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const barsRef = useRef<Array<HTMLSpanElement | null>>([]);
  const barStateRef = useRef<Float32Array>(new Float32Array(20));

  useEffect(() => {
    if (!window.voiceNoteAI) return;

    const offHud = window.voiceNoteAI.onHudState((payload: HudEvent) => {
      setHudState(payload.state);
      if (payload.state === "idle") {
        setVisible(false);
        setError(null);
        setSuccessMessage(null);
        setDurationSec(0);
        startedAtRef.current = null;
        targetLevelRef.current = 0;
        smoothedLevelRef.current = 0;
        barStateRef.current.fill(0);
        return;
      }

      setVisible(true);
      if (payload.state === "listening") {
        startedAtRef.current = Date.now();
        setError(null);
        setSuccessMessage(null);
      }
      if (payload.state === "error") {
        setError(payload.message ?? "Erro ao transcrever");
      }
      if (payload.state === "success") {
        setSuccessMessage(payload.message ?? null);
        if (successTimerRef.current !== null) window.clearTimeout(successTimerRef.current);
        successTimerRef.current = window.setTimeout(() => {
          setVisible(false);
        }, 1100);
      }
    });

    const offFinal = window.voiceNoteAI.onSttFinal(() => {
      setHudState("injecting");
    });

    const offError = window.voiceNoteAI.onSttError((payload) => {
      setHudState("error");
      setError(payload.message);
    });

    const offLevel = window.voiceNoteAI.onHudLevel((payload: HudLevelEvent) => {
      // 0..1
      targetLevelRef.current = Math.max(0, Math.min(1, Number(payload.level) || 0));
    });

    return () => {
      offHud();
      offFinal();
      offError();
      offLevel();
      if (successTimerRef.current !== null) {
        window.clearTimeout(successTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (hudState !== "listening") {
      if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      return;
    }

    const count = 20;
    const envelope = Array.from({ length: count }, (_v, index) => {
      // Smooth bell curve: center stronger, edges softer (Wispr-like).
      const x = (index / (count - 1)) * 2 - 1; // [-1..1]
      return Math.exp(-(x * x) * 1.35);
    });

    const IDLE_FLOOR = 0.06; // subtle motion even in low voice / silence
    const LEVEL_CURVE = 0.72; // < 1 boosts low values
    const SCALE_MIN = 0.18;
    const SCALE_RANGE = 1.85;

    const tick = () => {
      const target = targetLevelRef.current;
      const prev = smoothedLevelRef.current;

      // Fast attack, slower release for a natural VU feel.
      const next = target > prev ? prev + (target - prev) * 0.55 : prev + (target - prev) * 0.18;
      smoothedLevelRef.current = next;

      const t = performance.now() / 1000;
      const drive = Math.max(next, IDLE_FLOOR);
      const energy = Math.pow(Math.max(0, Math.min(1, drive)), LEVEL_CURVE);

      const bars = barsRef.current;
      const state = barStateRef.current;

      for (let i = 0; i < count; i += 1) {
        const env = envelope[i] ?? 0;

        // Traveling waves create a "flowing" look instead of jitter.
        const travel1 = Math.sin(t * 7.4 - i * 0.85);
        const travel2 = Math.sin(t * 3.1 + i * 1.55);
        const shimmer = Math.sin(t * 12.0 + i * 0.33);

        // Base height follows energy + envelope; wobble remains visible even when quiet.
        const wave = 0.55 * travel1 + 0.45 * travel2;
        const wobble = (0.28 + 0.72 * energy) * (0.5 + 0.5 * wave) + 0.12 * shimmer;

        const raw = env * (0.18 + 0.82 * energy) + env * wobble * (0.18 + 0.62 * energy);
        const targetBar = Math.max(0, Math.min(1, raw));

        // Per-bar smoothing: less "digital", more organic.
        const prevBar = state[i] ?? 0;
        const k = targetBar > prevBar ? 0.34 : 0.16;
        const nextBar = prevBar + (targetBar - prevBar) * k;
        state[i] = nextBar;

        const el = bars[i];
        if (el) {
          const scaleY = SCALE_MIN + nextBar * SCALE_RANGE;
          el.style.transform = `scaleY(${scaleY})`;
          el.style.opacity = String(0.45 + nextBar * 0.55);
        }
      }

      rafRef.current = window.requestAnimationFrame(tick);
    };

    rafRef.current = window.requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [hudState]);

  useEffect(() => {
    if (hudState !== "listening") return;
    const timer = window.setInterval(() => {
      if (!startedAtRef.current) return;
      setDurationSec(Math.max(0, Math.floor((Date.now() - startedAtRef.current) / 1000)));
    }, 200);
    return () => window.clearInterval(timer);
  }, [hudState]);

  const shouldShowText = hudState === "success" || hudState === "error";
  const text = shouldShowText ? resolveStatusMessage(hudState, successMessage ?? undefined, error) : "";
  const waveBars = useMemo(() => Array.from({ length: 20 }), []);

  return (
    <div className="hud-root">
      <div className={`hud-pill state-${hudState} ${visible ? "visible" : ""}`}>
        <span className={`hud-dot ${hudState === "listening" ? "listening" : ""}`} />

        {hudState === "listening" ? (
          <div className="hud-wave" aria-hidden>
            {waveBars.map((_, index) => (
              <span
                key={index}
                className="hud-wave-bar"
                ref={(el) => {
                  barsRef.current[index] = el;
                }}
              />
            ))}
          </div>
        ) : null}

        {hudState === "listening" ? <div className="hud-spacer" aria-hidden /> : null}

        {shouldShowText ? (
          <div className={`hud-text ${hudState === "error" ? "error" : hudState === "success" ? "success" : ""}`}>
            {text}
          </div>
        ) : null}

        {hudState === "listening" ? (
          <>
            <span className="hud-sep" />
            <span className="hud-meta">{durationSec}s</span>
          </>
        ) : null}
      </div>
    </div>
  );
}
