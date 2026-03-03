import { useCallback, useEffect, useRef, useState } from 'react';

type HudState = 'idle' | 'listening' | 'finalizing' | 'injecting' | 'success' | 'error';

type HudEvent = {
  state: HudState;
};

type HudLevelEvent = {
  level: number;
};

type HudHoverEvent = {
  hovered: boolean;
};

const COL_COUNT = 28;
const MAX_BLOCKS = 8;
const BLOCK_SIZE = 3;
const BLOCK_GAP = 1.5;
const COL_GAP = 1.5;
const WAVE_H = MAX_BLOCKS * BLOCK_SIZE + (MAX_BLOCKS - 1) * BLOCK_GAP;
const WAVE_W = COL_COUNT * BLOCK_SIZE + (COL_COUNT - 1) * COL_GAP;

const AMPLITUDE_PROFILE = [
  0.2, 0.45, 0.3, 0.7, 0.38, 0.85, 0.5, 0.95, 0.6, 0.75, 0.35, 0.9, 0.55, 1.0, 0.65, 0.82, 0.42,
  0.7, 0.28, 0.92, 0.88, 0.45, 0.78, 0.32, 0.85, 0.55, 0.72, 0.22,
];

const IDLE_PROFILE = [
  0.12, 0.25, 0.18, 0.38, 0.22, 0.48, 0.3, 0.55, 0.35, 0.42, 0.2, 0.5, 0.32, 0.58, 0.38, 0.46, 0.25,
  0.4, 0.16, 0.52, 0.5, 0.26, 0.44, 0.18, 0.48, 0.32, 0.4, 0.14,
];

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function resolveLabel(hudState: HudState) {
  if (hudState === 'listening') return 'REC';
  if (hudState === 'finalizing') return 'PENSAR';
  if (hudState === 'injecting') return 'FLOW';
  if (hudState === 'success') return 'FEITO!';
  if (hudState === 'error') return 'OPS...';
  return 'FLOW';
}

function resolveMeta(hudState: HudState, durationSec: number) {
  if (hudState === 'listening') return `${durationSec}s`;
  if (hudState === 'finalizing' || hudState === 'injecting') return 'FLOW';
  if (hudState === 'success') return 'OK';
  if (hudState === 'error') return '!';
  return 'IDLE';
}

function resolveBlockColor(hudState: HudState, active: boolean) {
  if (!active) return 'rgba(255,255,255,0.05)';
  if (hudState === 'idle') return 'rgba(255,255,255,0.2)';
  if (hudState === 'listening') return 'rgba(255,255,255,0.9)';
  if (hudState === 'finalizing') return 'var(--warn)';
  if (hudState === 'injecting') return 'var(--accentB)';
  if (hudState === 'success') return 'var(--accentG)';
  return 'var(--danger)';
}

function IconMic({ hudState }: { hudState: HudState }) {
  if (hudState === 'success') {
    return (
      <svg
        width={14}
        height={14}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="20 6 9 17 4 12" />
      </svg>
    );
  }

  if (hudState === 'error') {
    return (
      <svg
        width={14}
        height={14}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    );
  }

  return (
    <svg
      width={12}
      height={12}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

export default function WisprHudPill() {
  const [hudState, setHudState] = useState<HudState>('idle');
  const [durationSec, setDurationSec] = useState(0);
  const [isHovered, setIsHovered] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const levelsRef = useRef<Float32Array>(new Float32Array(COL_COUNT).fill(0.1));
  const targetLevelRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const hudStateRef = useRef<HudState>('idle');

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

  const drawWave = useCallback((state: HudState) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const widthPx = Math.ceil(WAVE_W * dpr);
    const heightPx = Math.ceil(WAVE_H * dpr);
    if (canvas.width !== widthPx || canvas.height !== heightPx) {
      canvas.width = widthPx;
      canvas.height = heightPx;
      canvas.style.width = `${WAVE_W}px`;
      canvas.style.height = `${WAVE_H}px`;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, WAVE_W, WAVE_H);

    const levels = levelsRef.current;
    for (let columnIndex = 0; columnIndex < COL_COUNT; columnIndex += 1) {
      const level = levels[columnIndex] ?? 0.1;
      const activeBlocks = Math.round(clamp01(level) * MAX_BLOCKS);
      const x = columnIndex * (BLOCK_SIZE + COL_GAP);

      for (let blockIndex = 0; blockIndex < MAX_BLOCKS; blockIndex += 1) {
        const y = WAVE_H - BLOCK_SIZE - blockIndex * (BLOCK_SIZE + BLOCK_GAP);
        ctx.fillStyle = resolveBlockColor(state, blockIndex < activeBlocks);
        ctx.fillRect(x, y, BLOCK_SIZE, BLOCK_SIZE);
      }
    }
  }, []);

  const animateVisualizer = useCallback(() => {
    stopRaf();

    const tick = () => {
      const state = hudStateRef.current;
      const now = performance.now() / 1000;
      const levels = levelsRef.current;

      for (let index = 0; index < levels.length; index += 1) {
        const current = levels[index] ?? 0.1;
        const listeningLevel = clamp01(targetLevelRef.current);
        const amplitude = AMPLITUDE_PROFILE[index] ?? 0.2;
        const idle = IDLE_PROFILE[index] ?? 0.1;
        let next = current;

        if (state === 'listening') {
          const noise = Math.sin(now * (8 + index * 0.3)) * 0.2;
          next = clamp01(amplitude * (0.32 + listeningLevel * 0.95) + noise);
        } else if (state === 'finalizing') {
          const scan = Math.sin(now * 10 - index * 0.5);
          next = scan > 0.8 ? 0.8 : 0.1;
        } else if (state === 'injecting') {
          const scan = Math.sin(now * 12 - index * 0.5);
          next = scan > 0.75 ? 0.9 : 0.12;
        } else if (state === 'success') {
          next = 0.3 + Math.sin(now * 4 - index * 0.2) * 0.1;
        } else if (state === 'error') {
          next = Math.random() > 0.95 ? 0.6 : 0.05;
        } else {
          const centerDist = Math.abs(index - COL_COUNT / 2);
          const breath = Math.sin(now * 1.2 - centerDist * 0.15) * 0.12;
          next = Math.max(0.05, idle * 0.7 + breath);
        }

        const smoothing = state === 'listening' ? 0.35 : 0.28;
        levels[index] = current + (clamp01(next) - current) * smoothing;
      }

      drawWave(state);
      rafRef.current = window.requestAnimationFrame(tick);
    };

    rafRef.current = window.requestAnimationFrame(tick);
  }, [drawWave, stopRaf]);

  useEffect(() => {
    if (!window.voiceNoteAI) return;

    const offHud = window.voiceNoteAI.onHudState((payload: HudEvent) => {
      const nextState = payload.state;
      setHudState(nextState);

      if (nextState === 'idle') {
        setDurationSec(0);
        startedAtRef.current = null;
        stopTimer();
        targetLevelRef.current = 0;
        animateVisualizer();
        return;
      }

      if (nextState === 'listening') {
        setDurationSec(0);
        startedAtRef.current = Date.now();
        stopTimer();
        timerRef.current = window.setInterval(() => {
          if (!startedAtRef.current) return;
          setDurationSec(Math.floor((Date.now() - startedAtRef.current) / 1000));
        }, 500);
        animateVisualizer();
        return;
      }

      stopTimer();
      animateVisualizer();
    });

    const offLevel = window.voiceNoteAI.onHudLevel((payload: HudLevelEvent) => {
      targetLevelRef.current = clamp01(Number(payload.level) || 0);
    });

    const offHover =
      typeof window.voiceNoteAI.onHudHover === 'function'
        ? window.voiceNoteAI.onHudHover((payload: HudHoverEvent) => {
            setIsHovered(Boolean(payload.hovered));
          })
        : () => {};

    animateVisualizer();

    return () => {
      offHud();
      offLevel();
      offHover();
      stopTimer();
      stopRaf();
    };
  }, [animateVisualizer, stopRaf, stopTimer]);

  const isExpanded = hudState !== 'idle' || isHovered;
  const idleHoveredClass = hudState === 'idle' && isHovered ? 'hovered' : '';

  return (
    <div className="hud-root">
      <div className="hud-stage">
        <div className={`hud-frame state-${hudState} ${isExpanded ? 'expanded' : ''}`.trim()}>
          <div
            className={`hud-pill state-${hudState} ${isExpanded ? 'expanded' : ''} ${idleHoveredClass}`.trim()}
          >
            <div className="pill-content-wrapper">
              <div className="hud-mic" aria-hidden>
                <IconMic hudState={hudState} />
              </div>
              <div className="hud-dot" />
              <canvas ref={canvasRef} className="hud-wave-canvas" aria-hidden />
            </div>
          </div>
          <div className="hud-label-group">
            <span className="hud-label" aria-live="polite">
              {resolveLabel(hudState)}
            </span>
            <span className="hud-meta">{resolveMeta(hudState, durationSec)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
