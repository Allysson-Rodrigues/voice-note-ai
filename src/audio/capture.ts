const TARGET_SAMPLE_RATE = 16000;
const FRAME_SAMPLES = 320;

type CaptureSession = {
  sessionId: string;
  stream: MediaStream;
  audioContext: AudioContext;
  source: MediaStreamAudioSourceNode;
  gainNode: GainNode;
  workletNode: AudioWorkletNode;
};

export type CaptureIssueEvent = {
  code: 'device-missing-fallback' | 'device-disconnected' | 'devicechange';
  message: string;
};

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
  return typeof AudioContext !== 'undefined';
}

function getOrCreateAudioContext() {
  if (!canUseAudioContext()) {
    throw new Error('AudioContext is not available in this environment.');
  }
  if (!sharedAudioContext) sharedAudioContext = new AudioContext();
  return sharedAudioContext;
}

async function ensureWorkletLoaded(audioContext: AudioContext) {
  if (workletLoaded) return;
  if (!workletLoadPromise) {
    const workletUrl = new URL('./pcm16k-worklet.ts', import.meta.url);
    workletLoadPromise = audioContext.audioWorklet.addModule(workletUrl).then(() => {
      workletLoaded = true;
    });
  }
  await workletLoadPromise;
}

function buildAudioConstraints(deviceId?: string | null): MediaTrackConstraints {
  return {
    channelCount: 1,
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    ...(deviceId ? { deviceId: { exact: deviceId } } : null),
  };
}

function attachMediaDeviceWatcher() {
  if (mediaDeviceWatcherAttached || typeof navigator === 'undefined') return;
  const mediaDevices = navigator.mediaDevices;
  if (!mediaDevices) return;
  if (typeof mediaDevices.addEventListener !== 'function') return;

  mediaDevices.addEventListener('devicechange', () => {
    emitCaptureIssue({
      code: 'devicechange',
      message: 'Dispositivos de áudio foram alterados.',
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
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: buildAudioConstraints(deviceId),
    });
    for (const track of stream.getTracks()) track.stop();
  } catch {
    // ignore permission/device issues, this is best effort
  }
}

export async function startCapture(
  sessionId: string,
  deviceId?: string | null,
  inputGain: number = 1,
) {
  if (active) {
    if (active.sessionId === sessionId) return;
    throw new Error(`Capture pipeline already active for session ${active.sessionId}.`);
  }
  if (!canUseAudioContext()) {
    throw new Error('AudioContext is not available in this environment.');
  }

  attachMediaDeviceWatcher();
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: buildAudioConstraints(deviceId),
    });
  } catch (error) {
    if (!deviceId) throw error;
    emitCaptureIssue({
      code: 'device-missing-fallback',
      message: 'Microfone selecionado indisponível. Captura alternada para dispositivo padrão.',
    });
    stream = await navigator.mediaDevices.getUserMedia({
      audio: buildAudioConstraints(null),
    });
  }

  for (const track of stream.getAudioTracks()) {
    track.onended = () => {
      emitCaptureIssue({
        code: 'device-disconnected',
        message: 'Microfone desconectado durante a captura.',
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
  const workletNode = new AudioWorkletNode(audioContext, 'pcm16k-worklet', {
    processorOptions: { targetSampleRate: TARGET_SAMPLE_RATE, frameSamples: FRAME_SAMPLES },
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
