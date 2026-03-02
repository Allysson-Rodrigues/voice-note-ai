import { useEffect, useMemo, useRef, useState } from "react";

type HudState = "idle" | "listening" | "finalizing" | "injecting" | "success" | "error";

type HudEvent = {
  state: HudState;
  message?: string;
};

function renderMessage(state: HudState, partial: string, error: string | null) {
  if (state === "error") return error || "Erro ao transcrever";
  if (state === "success") return "Colado com sucesso";
  if (state === "injecting") return "Colando...";
  if (state === "finalizing") return "Transcrevendo...";
  if (partial) return partial;
  return "Ouvindo...";
}

function clampWords(value: string, maxWords: number) {
  const words = value
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length <= maxWords) return words.join(" ");
  return `${words.slice(0, maxWords).join(" ")} ...`;
}

export default function WisprHudPill() {
  const [hudState, setHudState] = useState<HudState>("idle");
  const [partial, setPartial] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const [durationSec, setDurationSec] = useState(0);
  const successTimerRef = useRef<number | null>(null);
  const startedAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (!window.voiceNoteAI) return;

    const offHud = window.voiceNoteAI.onHudState((payload: HudEvent) => {
      setHudState(payload.state);
      if (payload.state === "idle") {
        setVisible(false);
        setPartial("");
        setError(null);
        setDurationSec(0);
        startedAtRef.current = null;
        return;
      }

      setVisible(true);
      if (payload.state === "listening") {
        startedAtRef.current = Date.now();
        setError(null);
      }
      if (payload.state === "error") {
        setError(payload.message ?? "Erro ao transcrever");
      }
      if (payload.state === "success") {
        if (successTimerRef.current !== null) window.clearTimeout(successTimerRef.current);
        successTimerRef.current = window.setTimeout(() => {
          setVisible(false);
        }, 1100);
      }
    });

    const offPartial = window.voiceNoteAI.onSttPartial((payload) => {
      setPartial(payload.text);
    });

    const offFinal = window.voiceNoteAI.onSttFinal(() => {
      setPartial("");
      setHudState("injecting");
    });

    const offError = window.voiceNoteAI.onSttError((payload) => {
      setHudState("error");
      setError(payload.message);
    });

    return () => {
      offHud();
      offPartial();
      offFinal();
      offError();
      if (successTimerRef.current !== null) {
        window.clearTimeout(successTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (hudState !== "listening") return;
    const timer = window.setInterval(() => {
      if (!startedAtRef.current) return;
      setDurationSec(Math.max(0, Math.floor((Date.now() - startedAtRef.current) / 1000)));
    }, 200);
    return () => window.clearInterval(timer);
  }, [hudState]);

  const rawText = renderMessage(hudState, partial, error);
  const text = hudState === "listening" && partial ? clampWords(rawText, 3) : rawText;
  const waveBars = useMemo(() => Array.from({ length: 20 }), []);

  return (
    <div className="hud-root">
      <div className={`hud-pill state-${hudState} ${visible ? "visible" : ""}`}>
        <span className={`hud-dot ${hudState === "listening" ? "listening" : ""}`} />

        {hudState === "listening" ? (
          <div className={`hud-wave ${hudState === "listening" ? "active" : ""}`} aria-hidden>
            {waveBars.map((_, index) => (
              <span
                key={index}
                className="hud-wave-bar"
                style={{
                  animationDelay: `${(index % 5) * 70}ms`,
                  height: `${4 + (index % 4) * 2}px`,
                }}
              />
            ))}
          </div>
        ) : null}

        <div
          className={`hud-text ${
            hudState === "error" ? "error" : hudState === "success" ? "success" : partial ? "partial" : ""
          }`}
        >
          {text}
        </div>

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
