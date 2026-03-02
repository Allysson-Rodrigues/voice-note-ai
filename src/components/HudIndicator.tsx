import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useMemo, useRef } from "react";

type HudState = "idle" | "listening" | "finalizing" | "error";

const LABEL_BY_STATE: Record<HudState, string> = {
  idle: "IDLE",
  listening: "LISTENING",
  finalizing: "FINALIZING",
  error: "ERROR",
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function smoothstep(x: number) {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
}

function buildWavePath({
  t,
  width,
  height,
  amplitude,
  speed,
  jitter,
}: {
  t: number;
  width: number;
  height: number;
  amplitude: number;
  speed: number;
  jitter: number;
}) {
  const mid = height / 2;
  const points = 62;
  const step = width / (points - 1);
  const phase = t * speed;
  let d = `M 0 ${mid.toFixed(2)}`;

  const phaseBucket = Math.floor(phase * 3);
  const hash = (n: number) => {
    const s = Math.sin(n) * 43758.5453123;
    return (s - Math.floor(s)) * 2 - 1; // [-1, 1]
  };
  const tri = (x: number) => (2 / Math.PI) * Math.asin(Math.sin(x));

  for (let i = 0; i < points; i++) {
    const x = i * step;
    const nx = i / (points - 1);
    const env = smoothstep(nx) * smoothstep(1 - nx);
    const w1 = Math.sin(nx * 8.8 + phase * 0.85);
    const w2 = Math.sin(nx * 40.0 + phase * 2.35);
    const w3 = tri(nx * 16.0 + phase * 0.95);

    // Deterministic pseudo-jitter without allocations.
    const j =
      jitter === 0
        ? 0
        : (hash(nx * 96 + phaseBucket * 9.2) * 0.6 + Math.sin(phase * 2.2 + nx * 14.5) * 0.4) * jitter;

    const spiky = Math.sign(w2) * Math.pow(Math.abs(w2), 0.22);
    const noisy = hash(nx * 280 + phaseBucket * 7.1) * 0.4 + hash(nx * 92 + phaseBucket * 2.9) * 0.3;
    const mix = w1 * 0.34 + spiky * 0.48 + w3 * 0.18 + noisy * 0.15 + j;

    let y = mid + mix * amplitude * env;
    // Slight quantization gives a more hand-drawn/jagged feel.
    y = Math.round(y * 2) / 2;
    y = clamp(y, 3, height - 3);
    d += ` L ${x.toFixed(2)} ${y.toFixed(2)}`;
  }

  return d;
}

function Oscilloscope({ state }: { state: HudState }) {
  const reduceMotion = useReducedMotion();
  const allowMotion = !reduceMotion || state !== "idle";
  const pathRef = useRef<SVGPathElement | null>(null);
  const glowRef = useRef<SVGPathElement | null>(null);
  const ampRef = useRef(0);
  const speedRef = useRef(1);
  const stateRef = useRef<HudState>(state);
  stateRef.current = state;

  const staticPath = useMemo(() => {
    return buildWavePath({
      t: 0,
      width: 160,
      height: 34,
      amplitude: 1.8,
      speed: 1,
      jitter: 0,
    });
  }, []);

  useEffect(() => {
    if (!allowMotion) {
      if (pathRef.current) pathRef.current.setAttribute("d", staticPath);
      if (glowRef.current) glowRef.current.setAttribute("d", staticPath);
      return;
    }

    let raf = 0;
    let last = 0;

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const current = stateRef.current;

      const frameMs =
        current === "listening" ? 28 : current === "finalizing" ? 46 : current === "error" ? 82 : 130;
      if (now - last < frameMs) return;
      last = now;

      const t = now / 1000;

      const ampTarget =
        current === "listening" ? 6.9 : current === "finalizing" ? 3.9 : current === "error" ? 2.6 : 1.7;
      const speedTarget =
        current === "listening" ? 5.4 : current === "finalizing" ? 2.4 : current === "error" ? 1.3 : 0.9;
      const jitter = current === "error" ? 0.25 : 0;

      ampRef.current += (ampTarget - ampRef.current) * 0.08;
      speedRef.current += (speedTarget - speedRef.current) * 0.08;

      const d = buildWavePath({
        t,
        width: 160,
        height: 34,
        amplitude: ampRef.current,
        speed: speedRef.current,
        jitter,
      });

      if (pathRef.current) pathRef.current.setAttribute("d", d);
      if (glowRef.current) glowRef.current.setAttribute("d", d);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [allowMotion, staticPath]);

  return (
    <svg viewBox="0 0 160 34" className="h-[12px] w-[94px]">
      <path
        ref={glowRef}
        d={staticPath}
        fill="none"
        stroke="rgba(107,185,255,0.18)"
        strokeWidth="1.8"
        strokeLinecap="butt"
        strokeLinejoin="miter"
        style={{ filter: "blur(0.6px)" }}
      />
      <path
        ref={pathRef}
        d={staticPath}
        fill="none"
        stroke="rgba(184,223,255,0.86)"
        strokeWidth="1"
        strokeLinecap="butt"
        strokeLinejoin="miter"
      />
    </svg>
  );
}

export default function HudIndicator({ state }: { state: HudState }) {
  const reduceMotion = useReducedMotion();
  const allowMotion = !reduceMotion || state !== "idle";
  const active = state === "listening" || state === "finalizing";
  const error = state === "error";

  const border = error ? "border-rose-300/50" : "border-white/15";
  const dot = error
    ? "bg-rose-300/90 shadow-[0_0_0_3px_rgba(251,113,133,0.18)]"
    : state === "listening"
      ? "bg-cyan-300/90 shadow-[0_0_0_3px_rgba(34,211,238,0.18)]"
      : state === "finalizing"
        ? "bg-white/75 shadow-[0_0_0_3px_rgba(255,255,255,0.10)]"
        : "bg-white/35";

  return (
    <motion.div
      className="relative h-full w-full"
      animate={allowMotion && active ? { scale: [1, 1.009, 1] } : { opacity: 1 }}
      transition={{ duration: 0.85, repeat: allowMotion && active ? Infinity : 0, ease: "easeInOut" }}
      role="status"
      aria-live="polite"
      aria-label={`HUD ${LABEL_BY_STATE[state]}`}
    >
      <div className={`absolute inset-0 rounded-full border ${border} bg-[#0a0f18]/90 p-[1px] shadow-[0_14px_36px_rgba(0,0,0,0.42)]`}>
        <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-[#080c14]/92 px-2.5 backdrop-blur-xl">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_65%_at_50%_0%,rgba(255,255,255,0.06),transparent_62%),radial-gradient(100%_80%_at_20%_120%,rgba(56,189,248,0.10),transparent_68%)]" />

          <motion.div
            className="pointer-events-none absolute -left-[35%] top-0 h-full w-[65%] bg-[linear-gradient(115deg,transparent,rgba(56,189,248,0.08),transparent)]"
            animate={!allowMotion || !active ? { x: 0, opacity: 0 } : { x: ["-10%", "220%"], opacity: [0, 1, 0] }}
            transition={{ duration: 1.7, repeat: !allowMotion || !active ? 0 : Infinity, ease: "easeInOut" }}
          />

          <div className="relative flex items-center gap-2">
            <motion.div
              className={`h-[6px] w-[6px] rounded-full ${dot}`}
              animate={
                !allowMotion
                  ? { opacity: 0.7 }
                  : active
                    ? { scale: [1, 1.3, 1], opacity: [0.45, 1, 0.45] }
                    : { scale: [1, 1.08, 1], opacity: [0.25, 0.42, 0.25] }
              }
              transition={{ duration: active ? 0.66 : 2.5, repeat: !allowMotion ? 0 : Infinity, ease: "easeInOut" }}
            />
            <Oscilloscope state={state} />
          </div>
        </div>
      </div>
    </motion.div>
  );
}
