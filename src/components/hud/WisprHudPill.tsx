import { useEffect, useRef, useState } from 'react';

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

const COL_COUNT = 14;
const CURVE_PROFILE = Array.from({ length: COL_COUNT }, (_, i) =>
  Math.sin((i / (COL_COUNT - 1)) * Math.PI),
);

function resolveLabel(hudState: HudState) {
  if (hudState === 'listening') return 'Ouvindo';
  if (hudState === 'finalizing') return 'Revisando';
  if (hudState === 'injecting') return 'Inserindo';
  if (hudState === 'success') return 'Concluído';
  if (hudState === 'error') return 'Atenção';
  return 'Pronto';
}

function IconMic({ state }: { state: HudState }) {
  let innerContent;

  if (state === 'success') {
    innerContent = (
      <polyline
        points="8 12 11 15 16 9"
        stroke="var(--brand-mic)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    );
  } else if (state === 'error') {
    innerContent = (
      <g stroke="var(--brand-mic)" strokeWidth="2" strokeLinecap="round">
        <line x1="9" y1="9" x2="15" y2="15" />
        <line x1="15" y1="9" x2="9" y2="15" />
      </g>
    );
  } else if (state === 'injecting') {
    innerContent = (
      <g
        stroke="var(--brand-mic)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      >
        <polyline points="10 7 10 11 15 11" />
        <path d="M10 7H7a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-4" />
      </g>
    );
  } else {
    innerContent = (
      <g>
        <rect x="9.5" y="6" width="5" height="7" rx="2.5" fill="var(--brand-mic)" />
        <path
          d="M7 12.5v0.5a5 5 0 0 0 10 0v-0.5"
          stroke="var(--brand-mic)"
          strokeWidth="1.5"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M12 18v3M9 21h6"
          stroke="var(--brand-mic)"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </g>
    );
  }

  return (
    <svg width="20" height="20" viewBox="0 0 24 24" className="brand-svg">
      {/* Anel base: Mantém a borda original sempre visível */}
      <circle
        cx="12"
        cy="12"
        r="11"
        stroke="var(--brand-ring-base)"
        strokeWidth="1.8"
        fill="none"
        className="brand-ring-base"
      />

      {/* Anel animado: Gira pontualmente por cima da borda base com pontas arredondadas */}
      <circle
        cx="12"
        cy="12"
        r="11"
        stroke="var(--brand-ring-anim)"
        strokeWidth="1.8"
        fill="none"
        className={`brand-ring-anim ring-${state}`}
        strokeLinecap="round"
      />

      <g style={{ transition: 'all 0.3s ease' }}>{innerContent}</g>
    </svg>
  );
}

function resolveBarColor(state: HudState, level: number) {
  if (state === 'idle') return 'rgba(255,255,255,0.15)';
  if (state === 'listening') return `rgba(56, 189, 248, ${Math.min(1, 0.4 + level)})`;
  if (state === 'finalizing') return 'var(--state-finalizing)';
  if (state === 'injecting') return 'var(--state-injecting)';
  if (state === 'success') return 'var(--state-success)';
  return 'var(--state-error)';
}

function Visualizer({ hudState, levelRef }: { hudState: HudState; levelRef: { current: number } }) {
  const [levels, setLevels] = useState<number[]>(() => Array(COL_COUNT).fill(0.1));

  useEffect(() => {
    let rafId = 0;

    const tick = () => {
      const now = performance.now() / 1000;
      const liveLevel = levelRef.current;

      setLevels((previous) =>
        previous.map((current, index) => {
          let target = 0.1;

          if (hudState === 'listening') {
            const noise1 = Math.sin(now * 8 + index * 0.5) * 0.3;
            const noise2 = Math.cos(now * 12 - index * 0.3) * 0.2;
            target = Math.max(
              0.1,
              Math.max(0, 0.5 + liveLevel * 0.8 + noise1 + noise2) * CURVE_PROFILE[index],
            );
          } else if (hudState === 'finalizing' || hudState === 'injecting') {
            const speed = hudState === 'injecting' ? 10 : 6;
            const active = Math.max(
              0,
              1 - Math.abs((Math.sin(now * speed) + 1) / 2 - index / (COL_COUNT - 1)) * 5,
            );
            target = 0.15 + active * 0.6 * CURVE_PROFILE[index];
          } else if (hudState === 'success' || hudState === 'error') {
            target = 0.1;
          } else {
            target = 0.1 + (Math.sin(now * 2) * 0.05 + 0.05) * CURVE_PROFILE[index];
          }

          const smoothing = hudState === 'listening' ? 0.35 : 0.25;
          return current + (target - current) * smoothing;
        }),
      );

      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [hudState, levelRef]);

  return (
    <div className="hud-wave-canvas" aria-hidden>
      {levels.map((level, i) => (
        <div
          key={i}
          className="hud-wave-bar"
          style={{
            height: `${Math.max(3, level * 16)}px`,
            backgroundColor: resolveBarColor(hudState, level),
            opacity: hudState === 'success' || hudState === 'error' ? 0 : 1,
          }}
        />
      ))}
    </div>
  );
}

export default function WisprHudPill() {
  const [hudState, setHudState] = useState<HudState>('idle');
  const [isHovered, setIsHovered] = useState(false);

  const targetLevelRef = useRef(0);

  useEffect(() => {
    if (!window.voiceNoteAI) return;

    const offHud = window.voiceNoteAI.onHudState((payload: HudEvent) => {
      setHudState(payload.state);
      if (payload.state === 'idle') {
        targetLevelRef.current = 0;
      }
    });

    const offLevel = window.voiceNoteAI.onHudLevel((payload: HudLevelEvent) => {
      targetLevelRef.current = Math.max(0, Math.min(1, Number(payload.level) || 0));
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
    };
  }, []);

  const isExpanded = hudState !== 'idle' || isHovered;

  return (
    <div className="hud-root">
      <div className="hud-stage">
        <div className={`hud-frame state-${hudState} ${isExpanded ? 'expanded' : ''}`.trim()}>
          <div
            className={`hud-pill state-${hudState} ${isExpanded ? 'expanded' : ''}`.trim()}
            onMouseEnter={() => hudState === 'idle' && setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
          >
            <div className="hud-mic-container">
              <div className="hud-mic" aria-hidden>
                <IconMic state={hudState} />
              </div>
            </div>

            <div className="pill-content-wrapper">
              <div className="hud-copy">
                <span className="hud-kicker">Voice Note</span>
                <span className="hud-label-compact">{resolveLabel(hudState)}</span>
              </div>
              <Visualizer hudState={hudState} levelRef={targetLevelRef} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
