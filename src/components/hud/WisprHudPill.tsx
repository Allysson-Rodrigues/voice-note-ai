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

function Visualizer({
  hudState,
  levelRef,
}: {
  hudState: HudState;
  levelRef: { current: number };
}) {
  const [levels, setLevels] = useState<number[]>(
    () => Array.from({ length: COL_COUNT }, (_, index) => IDLE_PROFILE[index] ?? 0.1),
  );

  useEffect(() => {
    let rafId = 0;

    const tick = () => {
      const now = performance.now() / 1000;
      const liveLevel = clamp01(levelRef.current);

      setLevels((previous) =>
        previous.map((current, index) => {
          const amplitude = AMPLITUDE_PROFILE[index] ?? 0.2;
          const idle = IDLE_PROFILE[index] ?? 0.1;
          let next = current;

          if (hudState === 'listening') {
            const noise = Math.sin(now * (8 + index * 0.3)) * 0.2;
            next = clamp01(amplitude * (0.32 + liveLevel * 0.95) + noise);
          } else if (hudState === 'finalizing') {
            const scan = Math.sin(now * 10 - index * 0.5);
            next = scan > 0.8 ? 0.8 : 0.1;
          } else if (hudState === 'injecting') {
            const scan = Math.sin(now * 12 - index * 0.5);
            next = scan > 0.75 ? 0.9 : 0.12;
          } else if (hudState === 'success') {
            next = 0.3 + Math.sin(now * 4 - index * 0.2) * 0.1;
          } else if (hudState === 'error') {
            next = Math.random() > 0.95 ? 0.6 : 0.05;
          } else {
            const drift = Math.sin(now * 2 + index) * 0.05;
            next = Math.max(0.05, idle + drift);
          }

          const smoothing = hudState === 'listening' ? 0.35 : 0.28;
          return current + (clamp01(next) - current) * smoothing;
        }),
      );

      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [hudState, levelRef]);

  return (
    <div
      className="hud-wave-canvas"
      style={{
        height: `${WAVE_H}px`,
        gap: `${COL_GAP}px`,
      }}
      aria-hidden
    >
      {levels.map((level, columnIndex) => {
        const activeBlocks = Math.round(clamp01(level) * MAX_BLOCKS);

        return (
          <div className="hud-wave-column" style={{ gap: `${BLOCK_GAP}px` }} key={columnIndex}>
            {Array.from({ length: MAX_BLOCKS }).map((_, blockIndex) => (
              <div
                key={blockIndex}
                className="hud-wave-block"
                style={{
                  width: `${BLOCK_SIZE}px`,
                  height: `${BLOCK_SIZE}px`,
                  background: resolveBlockColor(hudState, blockIndex < activeBlocks),
                }}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}

export default function WisprHudPill() {
  const [hudState, setHudState] = useState<HudState>('idle');
  const [durationSec, setDurationSec] = useState(0);
  const [isHovered, setIsHovered] = useState(false);

  const targetLevelRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const startedAtRef = useRef<number | null>(null);

  const stopTimer = useCallback(() => {
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

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
        return;
      }

      stopTimer();
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

    return () => {
      offHud();
      offLevel();
      offHover();
      stopTimer();
    };
  }, [stopTimer]);

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
              <Visualizer hudState={hudState} levelRef={targetLevelRef} />
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
