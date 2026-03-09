const TARGET_SAMPLE_RATE = 16000;
const FRAME_SAMPLES = 320;

export type MicrophonePermissionState =
  | "granted"
  | "prompt"
  | "denied"
  | "unsupported";
export type CaptureStartErrorCode =
  | "permission-denied"
  | "device-missing"
  | "device-busy"
  | "constraints-invalid"
  | "unsupported"
  | "unknown";

type CaptureStartErrorOptions = {
  cause?: unknown;
};

type CaptureSession = {
  sessionId: string;
  stream: MediaStream;
  audioContext: AudioContext;
  source: MediaStreamAudioSourceNode;
  gainNode: GainNode;
  workletNode: AudioWorkletNode;
};

export type CaptureIssueEvent = {
  code: "device-missing-fallback" | "device-disconnected" | "devicechange";
  message: string;
};

export class CaptureStartError extends Error {
  code: CaptureStartErrorCode;
  cause?: unknown;

  constructor(
    code: CaptureStartErrorCode,
    message: string,
    options: CaptureStartErrorOptions = {},
  ) {
    super(message);
    this.name = "CaptureStartError";
    this.code = code;
    this.cause = options.cause;
  }
}

let active: CaptureSession | null = null;
let sharedAudioContext: AudioContext | null = null;
let workletLoaded = false;
let workletLoadPromise: Promise<void> | null = null;
let mediaDeviceWatcherAttached = false;
const captureIssueListeners = new Set<(event: CaptureIssueEvent) => void>();

function emitCaptureIssue(event: CaptureIssueEvent) {
  for (const listener of captureIssueListeners) listener(event);
}

export function onCaptureIssue(listener: (event: CaptureIssueEvent) => void) {
  captureIssueListeners.add(listener);
  return () => {
    captureIssueListeners.delete(listener);
  };
}

function canUseAudioContext() {
  return typeof AudioContext !== "undefined";
}

function getNavigatorPermissions() {
  if (typeof navigator === "undefined") return null;
  const permissions =
    (navigator as Navigator & { permissions?: Navigator["permissions"] })
      .permissions ?? null;
  return permissions;
}

function getDomExceptionName(error: unknown) {
  if (!error || typeof error !== "object") return "";
  return "name" in error && typeof error.name === "string" ? error.name : "";
}

export function normalizeCaptureStartError(error: unknown) {
  if (error instanceof CaptureStartError) return error;

  const name = getDomExceptionName(error);
  if (
    name === "NotAllowedError" ||
    name === "PermissionDeniedError" ||
    name === "SecurityError"
  ) {
    return new CaptureStartError(
      "permission-denied",
      "Permissão de microfone negada. Libere o acesso ao microfone para este app nas configurações do Windows e reinicie o Voice Note AI.",
      { cause: error },
    );
  }

  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return new CaptureStartError(
      "device-missing",
      "Nenhum microfone disponível foi encontrado. Conecte um dispositivo de áudio e tente novamente.",
      { cause: error },
    );
  }

  if (
    name === "NotReadableError" ||
    name === "TrackStartError" ||
    name === "AbortError"
  ) {
    return new CaptureStartError(
      "device-busy",
      "Não foi possível acessar o microfone. Ele pode estar em uso por outro aplicativo ou bloqueado pelo sistema.",
      { cause: error },
    );
  }

  if (
    name === "OverconstrainedError" ||
    name === "ConstraintNotSatisfiedError"
  ) {
    return new CaptureStartError(
      "constraints-invalid",
      "O microfone selecionado não atende aos requisitos de captura. Escolha outro dispositivo e tente novamente.",
      { cause: error },
    );
  }

  if (
    error instanceof Error &&
    error.message === "AudioContext is not available in this environment."
  ) {
    return new CaptureStartError(
      "unsupported",
      "Captura de áudio indisponível neste ambiente.",
      {
        cause: error,
      },
    );
  }

  return new CaptureStartError(
    "unknown",
    error instanceof Error ? error.message : "Falha ao acessar o microfone.",
    { cause: error },
  );
}

export async function getMicrophonePermissionState(): Promise<MicrophonePermissionState> {
  if (
    typeof navigator === "undefined" ||
    !navigator.mediaDevices?.getUserMedia
  ) {
    return "unsupported";
  }

  const permissions = getNavigatorPermissions();
  if (!permissions?.query) return "unsupported";

  try {
    const result = await permissions.query({
      name: "microphone" as PermissionName,
    });
    if (
      result.state === "granted" ||
      result.state === "prompt" ||
      result.state === "denied"
    ) {
      return result.state;
    }
    return "unsupported";
  } catch {
    return "unsupported";
  }
}

function getOrCreateAudioContext() {
  if (!canUseAudioContext()) {
    throw new Error("AudioContext is not available in this environment.");
  }
  if (!sharedAudioContext) sharedAudioContext = new AudioContext();
  return sharedAudioContext;
}

async function ensureWorkletLoaded(audioContext: AudioContext) {
  if (workletLoaded) return;
  if (!workletLoadPromise) {
    // Moved to public/pcm16k-worklet.js, so it deploys to the same folder as index.html
    const workletUrl = "./pcm16k-worklet.js";
    workletLoadPromise = audioContext.audioWorklet
      .addModule(workletUrl)
      .then(() => {
        workletLoaded = true;
      });
  }
  await workletLoadPromise;
}

function buildAudioConstraints(
  deviceId?: string | null,
): MediaTrackConstraints {
  return {
    channelCount: 1,
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    ...(deviceId ? { deviceId: { exact: deviceId } } : null),
  };
}

function attachMediaDeviceWatcher() {
  if (mediaDeviceWatcherAttached || typeof navigator === "undefined") return;
  const mediaDevices = navigator.mediaDevices;
  if (!mediaDevices) return;
  if (typeof mediaDevices.addEventListener !== "function") return;

  mediaDevices.addEventListener("devicechange", () => {
    emitCaptureIssue({
      code: "devicechange",
      message: "Dispositivos de áudio foram alterados.",
    });
  });
  mediaDeviceWatcherAttached = true;
}

export async function warmupCapturePipeline() {
  if (!canUseAudioContext()) return;
  attachMediaDeviceWatcher();
  const audioContext = getOrCreateAudioContext();
  await ensureWorkletLoaded(audioContext);
}

export async function primeMicrophone(deviceId?: string | null) {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia)
    return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: buildAudioConstraints(deviceId),
    });
    for (const track of stream.getTracks()) track.stop();
  } catch (error) {
    throw normalizeCaptureStartError(error);
  }
}

export async function startCapture(
  sessionId: string,
  deviceId?: string | null,
  inputGain: number = 1,
) {
  if (active) {
    if (active.sessionId === sessionId) return;
    throw new Error(
      `Capture pipeline already active for session ${active.sessionId}.`,
    );
  }
  if (!canUseAudioContext()) {
    throw new Error("AudioContext is not available in this environment.");
  }

  attachMediaDeviceWatcher();
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: buildAudioConstraints(deviceId),
    });
  } catch (error) {
    const normalized = normalizeCaptureStartError(error);
    if (!deviceId || normalized.code !== "constraints-invalid")
      throw normalized;
    emitCaptureIssue({
      code: "device-missing-fallback",
      message:
        "Microfone selecionado indisponível. Captura alternada para dispositivo padrão.",
    });
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: buildAudioConstraints(null),
      });
    } catch (fallbackError) {
      throw normalizeCaptureStartError(fallbackError);
    }
  }

  for (const track of stream.getAudioTracks()) {
    track.onended = () => {
      emitCaptureIssue({
        code: "device-disconnected",
        message: "Microfone desconectado durante a captura.",
      });
    };
  }

  const audioContext = getOrCreateAudioContext();
  await ensureWorkletLoaded(audioContext);
  try {
    await audioContext.resume();
  } catch {
    // ignore
  }

  const source = audioContext.createMediaStreamSource(stream);
  const gainNode = audioContext.createGain();
  gainNode.gain.value = Number.isFinite(inputGain) ? inputGain : 1;
  const workletNode = new AudioWorkletNode(audioContext, "pcm16k-worklet", {
    processorOptions: {
      targetSampleRate: TARGET_SAMPLE_RATE,
      frameSamples: FRAME_SAMPLES,
    },
  });

  workletNode.port.onmessage = (ev) => {
    const buf = ev.data as ArrayBuffer;
    window.voiceNoteAI.sendAudio(sessionId, buf);
  };

  source.connect(gainNode);
  gainNode.connect(workletNode);
  // Keep node in graph; no destination output.
  workletNode.connect(audioContext.destination);

  active = { sessionId, stream, audioContext, source, gainNode, workletNode };
}

export function setInputGain(next: number) {
  if (!active) return;
  const value = Number.isFinite(next) ? next : 1;
  active.gainNode.gain.setValueAtTime(value, active.audioContext.currentTime);
}

export async function stopCapture() {
  const session = active;
  active = null;
  if (!session) return;

  session.workletNode.port.onmessage = null;
  session.workletNode.disconnect();
  session.gainNode.disconnect();
  session.source.disconnect();

  for (const track of session.stream.getTracks()) {
    track.onended = null;
    track.stop();
  }
  // Keep the AudioContext running to reduce start latency between sessions.
}
