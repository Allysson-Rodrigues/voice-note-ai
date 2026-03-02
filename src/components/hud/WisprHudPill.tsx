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
  const [barLevels, setBarLevels] = useState<number[]>(() => Array.from({ length: 20 }, () => 0));
  const successTimerRef = useRef<number | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const targetLevelRef = useRef(0);
  const smoothedLevelRef = useRef(0);
  const rafRef = useRef<number | null>(null);

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
        setBarLevels(Array.from({ length: 20 }, () => 0));
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

    const base = Array.from({ length: 20 }, (_v, index) => {
      // Deterministic "shape" across bars: center slightly louder.
      const x = index / 19;
      const bell = 1 - Math.abs(x - 0.5) * 1.35;
      return 0.45 + 0.55 * Math.max(0, Math.min(1, bell));
    });

    const tick = () => {
      const target = targetLevelRef.current;
      const prev = smoothedLevelRef.current;

      // Fast attack, slower release for a natural VU feel.
      const next = target > prev ? prev + (target - prev) * 0.55 : prev + (target - prev) * 0.18;
      smoothedLevelRef.current = next;

      const t = performance.now() / 1000;
      const levels = base.map((shape, index) => {
        const phase = t * 8 + index * 0.35;
        const wobble = 0.12 * Math.sin(phase) + 0.06 * Math.sin(phase * 0.6);
        const value = next * shape + wobble * next;
        return Math.max(0, Math.min(1, value));
      });

      setBarLevels(levels);
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
                style={{
                  transform: `scaleY(${0.25 + barLevels[index] * 1.25})`,
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
