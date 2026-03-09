import { clipboard, type BrowserWindow } from "electron";

export const CLIPBOARD_RESTORE_MAX_MS = 200;
export const CLIPBOARD_TX_TIMEOUT_MS = 3000;
export const APP_KEY_CACHE_TTL_MS = 15000;
export const APP_KEY_CACHE_MAX_ENTRIES = 128;
export const RETRY_SLEEP_MS = 60;

export type ClipboardSnapshot = {
  text: string;
  html: string;
  rtf: string;
  image: Electron.NativeImage | null;
};

export function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export async function retryBooleanOperation(
  operation: () => Promise<boolean>,
  attempts: number,
  delayMs: number,
) {
  let lastResult = false;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    lastResult = await operation();
    if (lastResult) return true;
    if (attempt < attempts) await sleep(delayMs);
  }
  return false;
}

export async function retryPromiseOperation(
  operation: () => Promise<void>,
  attempts: number,
  delayMs: number,
) {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await operation();
      return;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(delayMs);
    }
  }
  throw lastError;
}

export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(label)), timeoutMs);
    promise.then(
      (result) => {
        clearTimeout(timer);
        resolve(result);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export function windowsLineEndings(text: string) {
  return text.replace(/\r\n?/g, "\n").replace(/\n/g, "\r\n");
}

export function snapshotClipboard(): ClipboardSnapshot {
  let image: Electron.NativeImage | null = null;
  try {
    const candidate = clipboard.readImage();
    if (candidate && !candidate.isEmpty()) image = candidate;
  } catch {
    image = null;
  }

  let text = "";
  let html = "";
  let rtf = "";
  try {
    text = clipboard.readText();
  } catch {
    text = "";
  }
  try {
    html = clipboard.readHTML();
  } catch {
    html = "";
  }
  try {
    rtf = clipboard.readRTF();
  } catch {
    rtf = "";
  }
  return { text, html, rtf, image };
}

export function restoreClipboard(snapshot: ClipboardSnapshot) {
  const payload: Electron.Data = {};
  if (snapshot.text) payload.text = snapshot.text;
  if (snapshot.html) payload.html = snapshot.html;
  if (snapshot.rtf) payload.rtf = snapshot.rtf;
  if (snapshot.image && !snapshot.image.isEmpty()) {
    payload.image = snapshot.image;
  }
  if (Object.keys(payload).length === 0) {
    clipboard.clear();
    return;
  }
  clipboard.write(payload);
}

export function getWindowHandle(win: BrowserWindow | null) {
  if (!win || win.isDestroyed()) return null;
  try {
    const raw = win.getNativeWindowHandle();
    if (!raw || raw.length === 0) return null;
    let value = 0n;
    for (let index = 0; index < raw.length; index += 1) {
      value += BigInt(raw[index] ?? 0) << BigInt(index * 8);
    }
    return value.toString();
  } catch {
    return null;
  }
}
