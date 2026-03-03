import { BrowserWindow, clipboard } from 'electron';
import { spawn } from 'node:child_process';
import {
  buildPasteAttemptOrder,
  resolvePasteFailureReason,
  resolvePreferredWindowHandle,
  type PasteAttempt,
} from '../injection-plan.js';

const CLIPBOARD_RESTORE_MAX_MS = 200;
const CLIPBOARD_TX_TIMEOUT_MS = 1200;
const APP_KEY_CACHE_TTL_MS = 15000;
const APP_KEY_CACHE_MAX_ENTRIES = 128;

type InjectMetrics = {
  resolveWindowMs: number;
  pasteAttemptMs: number;
  clipboardRestoreMs: number;
};

type InjectResult = {
  pasted: boolean;
  restored: boolean;
  skippedReason?: 'WINDOW_CHANGED' | 'PASTE_FAILED' | 'TIMEOUT';
  metrics?: InjectMetrics;
};

type ClipboardSnapshot = {
  text: string;
  html: string;
  rtf: string;
  image: Electron.NativeImage | null;
};

type TextInjectionServiceOptions = {
  canAutoPaste: () => boolean;
  getMainWindow: () => BrowserWindow | null;
  getHudWindow: () => BrowserWindow | null;
  getPreferredInjectionMethod: (appKey: string | null) => PasteAttempt | null;
  rememberInjectionMethod: (appKey: string | null, method: PasteAttempt) => Promise<void>;
};

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
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

function windowsLineEndings(text: string) {
  return text.replace(/\r\n?/g, '\n').replace(/\n/g, '\r\n');
}

async function runPowerShell(command: string, timeoutMs = 900) {
  return await new Promise<string>((resolve, reject) => {
    const ps = spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-WindowStyle',
        'Hidden',
        '-Command',
        command,
      ],
      { windowsHide: true },
    );

    let stdout = '';
    let stderr = '';

    const timer = setTimeout(() => {
      try {
        ps.kill();
      } catch {
        // ignore
      }
      reject(new Error('powershell timeout'));
    }, timeoutMs);

    ps.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    ps.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    ps.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });

    ps.on('exit', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(stderr || `powershell exited with code ${code ?? 'unknown'}`));
    });
  });
}

async function getForegroundWindowHandle() {
  if (process.platform !== 'win32') return null;

  const script = [
    '$ErrorActionPreference = "Stop"',
    'if (-not ("VoiceNote.NativeWin32" -as [type])) {',
    'Add-Type -Namespace VoiceNote -Name NativeWin32 -MemberDefinition @"',
    '  [System.Runtime.InteropServices.DllImport("user32.dll")]',
    '  public static extern System.IntPtr GetForegroundWindow();',
    '  [System.Runtime.InteropServices.DllImport("user32.dll")]',
    '  public static extern bool SetForegroundWindow(System.IntPtr hWnd);',
    '"@ }',
    '$h = [VoiceNote.NativeWin32]::GetForegroundWindow()',
    '$raw = $h.ToInt64()',
    '[Console]::Out.Write((@{ handle = "$raw" } | ConvertTo-Json -Compress))',
  ].join('; ');

  try {
    const raw = await runPowerShell(script);
    const parsed = JSON.parse(raw) as { handle?: string };
    if (!parsed.handle || parsed.handle === '0') return null;
    return parsed.handle;
  } catch {
    return null;
  }
}

async function getWindowAppKeyByHandle(handle: string | null) {
  if (process.platform !== 'win32' || !handle) return null;
  const normalized = handle.trim();
  if (!/^-?\d+$/.test(normalized)) return null;

  const script = [
    '$ErrorActionPreference = "Stop"',
    'if (-not ("VoiceNote.NativeWin32Proc" -as [type])) {',
    'Add-Type -Namespace VoiceNote -Name NativeWin32Proc -MemberDefinition @"',
    '  [System.Runtime.InteropServices.DllImport("user32.dll")]',
    '  public static extern uint GetWindowThreadProcessId(System.IntPtr hWnd, out uint lpdwProcessId);',
    '"@ }',
    `$h = [System.IntPtr]::new([int64]${normalized})`,
    '$pid = 0',
    '[void][VoiceNote.NativeWin32Proc]::GetWindowThreadProcessId($h, [ref]$pid)',
    'if ($pid -eq 0) { [Console]::Out.Write((@{ app = "" } | ConvertTo-Json -Compress)); exit 0 }',
    '$proc = Get-Process -Id $pid -ErrorAction SilentlyContinue',
    'if (-not $proc) { [Console]::Out.Write((@{ app = "" } | ConvertTo-Json -Compress)); exit 0 }',
    '$name = $proc.ProcessName',
    'if (-not $name) { $name = "" }',
    '[Console]::Out.Write((@{ app = $name } | ConvertTo-Json -Compress))',
  ].join('; ');

  try {
    const raw = await runPowerShell(script, 1100);
    const parsed = JSON.parse(raw) as { app?: string };
    const app = (parsed.app ?? '').trim();
    return app ? app.toLowerCase() : null;
  } catch {
    return null;
  }
}

async function focusWindowByHandle(handle: string) {
  if (process.platform !== 'win32' || !handle) return false;

  const script = [
    '$ErrorActionPreference = "Stop"',
    'if (-not ("VoiceNote.NativeWin32" -as [type])) {',
    'Add-Type -Namespace VoiceNote -Name NativeWin32 -MemberDefinition @"',
    '  [System.Runtime.InteropServices.DllImport("user32.dll")]',
    '  public static extern bool SetForegroundWindow(System.IntPtr hWnd);',
    '"@ }',
    `$ok = [VoiceNote.NativeWin32]::SetForegroundWindow([System.IntPtr]::new([int64]${handle}))`,
    '[Console]::Out.Write((@{ ok = $ok } | ConvertTo-Json -Compress))',
  ].join('; ');

  try {
    const raw = await runPowerShell(script);
    const parsed = JSON.parse(raw) as { ok?: boolean };
    return parsed.ok === true;
  } catch {
    return false;
  }
}

async function windowsSendCtrlV() {
  const script = [
    '$ErrorActionPreference = "Stop"',
    '$wshell = New-Object -ComObject WScript.Shell',
    "Start-Sleep -Milliseconds 40; $wshell.SendKeys('^v')",
  ].join('; ');

  await runPowerShell(script, 1000);
}

async function windowsSendShiftInsert() {
  const script = [
    '$ErrorActionPreference = "Stop"',
    '$wshell = New-Object -ComObject WScript.Shell',
    "Start-Sleep -Milliseconds 40; $wshell.SendKeys('+{INSERT}')",
  ].join('; ');

  await runPowerShell(script, 1000);
}

async function windowsPasteToHandle(handle: string) {
  const normalized = handle.trim();
  if (!/^-?\d+$/.test(normalized)) return false;

  const script = [
    '$ErrorActionPreference = "Stop"',
    'if (-not ("VoiceNote.NativeWin32" -as [type])) {',
    'Add-Type -Namespace VoiceNote -Name NativeWin32 -MemberDefinition @"',
    '  [System.Runtime.InteropServices.DllImport("user32.dll", CharSet=System.Runtime.InteropServices.CharSet.Unicode)]',
    '  public static extern System.IntPtr SendMessageW(System.IntPtr hWnd, uint Msg, System.IntPtr wParam, System.IntPtr lParam);',
    '"@ }',
    `$h = [System.IntPtr]::new([int64]${normalized})`,
    'if ($h -eq [System.IntPtr]::Zero) { throw "invalid handle" }',
    '[void][VoiceNote.NativeWin32]::SendMessageW($h, 0x0302, [System.IntPtr]::Zero, [System.IntPtr]::Zero)',
    '[Console]::Out.Write((@{ ok = $true } | ConvertTo-Json -Compress))',
  ].join('; ');

  try {
    await runPowerShell(script, 1000);
    return true;
  } catch {
    return false;
  }
}

function snapshotClipboard(): ClipboardSnapshot {
  let image: Electron.NativeImage | null = null;
  try {
    const candidate = clipboard.readImage();
    if (candidate && !candidate.isEmpty()) image = candidate;
  } catch {
    image = null;
  }

  let text = '';
  let html = '';
  let rtf = '';
  try {
    text = clipboard.readText();
  } catch {
    text = '';
  }
  try {
    html = clipboard.readHTML();
  } catch {
    html = '';
  }
  try {
    rtf = clipboard.readRTF();
  } catch {
    rtf = '';
  }

  return { text, html, rtf, image };
}

function restoreClipboard(snapshot: ClipboardSnapshot) {
  const payload: Electron.Data = {};
  if (snapshot.text) payload.text = snapshot.text;
  if (snapshot.html) payload.html = snapshot.html;
  if (snapshot.rtf) payload.rtf = snapshot.rtf;
  if (snapshot.image && !snapshot.image.isEmpty()) payload.image = snapshot.image;

  if (Object.keys(payload).length === 0) {
    clipboard.clear();
    return;
  }

  clipboard.write(payload);
}

async function ensureTargetWindow(targetWindowHandle: string | null) {
  if (process.platform !== 'win32') return true;
  if (!targetWindowHandle) return true;

  const current = await getForegroundWindowHandle();
  if (current === targetWindowHandle) return true;

  await focusWindowByHandle(targetWindowHandle);
  await sleep(70);
  const after = await getForegroundWindowHandle();
  return after === targetWindowHandle;
}

function getWindowHandle(win: BrowserWindow | null) {
  if (!win || win.isDestroyed()) return null;
  try {
    const raw = win.getNativeWindowHandle();
    if (!raw || raw.length === 0) return null;

    let value = 0n;
    for (let i = 0; i < raw.length; i += 1) {
      value += BigInt(raw[i] ?? 0) << BigInt(i * 8);
    }
    return value.toString();
  } catch {
    return null;
  }
}

export function createTextInjectionService(options: TextInjectionServiceOptions) {
  let injectionQueue: Promise<void> = Promise.resolve();
  const appKeyCache = new Map<string, { appKey: string | null; expiresAt: number }>();

  function withClipboardLock<T>(task: () => Promise<T>): Promise<T> {
    const pending = injectionQueue.then(task, task);
    injectionQueue = pending.then(
      () => undefined,
      () => undefined,
    );
    return pending;
  }

  function readCachedAppKey(handle: string | null): string | null | undefined {
    if (!handle) return undefined;
    const cached = appKeyCache.get(handle);
    if (!cached) return undefined;
    if (cached.expiresAt < Date.now()) {
      appKeyCache.delete(handle);
      return undefined;
    }
    return cached.appKey;
  }

  function cacheAppKey(handle: string | null, appKey: string | null) {
    if (!handle) return;
    appKeyCache.set(handle, {
      appKey,
      expiresAt: Date.now() + APP_KEY_CACHE_TTL_MS,
    });
    if (appKeyCache.size <= APP_KEY_CACHE_MAX_ENTRIES) return;
    const firstKey = appKeyCache.keys().next().value;
    if (typeof firstKey === 'string') appKeyCache.delete(firstKey);
  }

  async function resolveWindowAppKey(handle: string | null) {
    if (!handle) return null;
    const cached = readCachedAppKey(handle);
    if (cached !== undefined) return cached;
    const appKey = await getWindowAppKeyByHandle(handle).catch(() => null);
    cacheAppKey(handle, appKey);
    return appKey;
  }

  async function resolveInjectionTargetWindowHandle(sessionTargetWindowHandle: string | null) {
    if (process.platform !== 'win32') return sessionTargetWindowHandle;

    const internalHandles = [
      getWindowHandle(options.getMainWindow()),
      getWindowHandle(options.getHudWindow()),
    ];
    const currentHandle = await getForegroundWindowHandle().catch(() => null);
    return resolvePreferredWindowHandle({
      currentHandle,
      sessionTargetWindowHandle,
      internalHandles,
    });
  }

  async function injectText(
    text: string,
    targetWindowHandle: string | null,
  ): Promise<InjectResult> {
    const normalized = windowsLineEndings(text);

    return withClipboardLock(() =>
      withTimeout(
        (async () => {
          let resolveWindowMs = 0;
          let pasteAttemptMs = 0;
          let clipboardRestoreMs = 0;
          const previous = snapshotClipboard();
          clipboard.writeText(normalized);

          if (!options.canAutoPaste()) {
            return {
              pasted: false,
              restored: false,
              metrics: {
                resolveWindowMs,
                pasteAttemptMs,
                clipboardRestoreMs,
              },
            };
          }

          const resolveWindowStartAt = Date.now();
          const targetReady = await ensureTargetWindow(targetWindowHandle);
          const currentHandle = await getForegroundWindowHandle().catch(() => null);
          const appKey =
            (await resolveWindowAppKey(targetWindowHandle)) ??
            (currentHandle === targetWindowHandle
              ? null
              : await resolveWindowAppKey(currentHandle));
          resolveWindowMs = Date.now() - resolveWindowStartAt;

          const preferredAttempt = options.getPreferredInjectionMethod(appKey);
          const attemptOrder = buildPasteAttemptOrder({
            targetReady,
            targetHandle: targetWindowHandle,
            foregroundHandle: currentHandle,
            preferredAttempt,
          });

          const pasteAttemptStartAt = Date.now();
          let pasted = false;
          let usedAttempt: PasteAttempt | null = null;
          for (const attempt of attemptOrder) {
            if (pasted) break;

            if (attempt === 'target-handle' && targetWindowHandle) {
              pasted = await windowsPasteToHandle(targetWindowHandle);
              if (pasted) usedAttempt = attempt;
              continue;
            }

            if (attempt === 'foreground-handle' && currentHandle) {
              pasted = await windowsPasteToHandle(currentHandle);
              if (pasted) usedAttempt = attempt;
              continue;
            }

            if (attempt === 'ctrl-v') {
              try {
                await windowsSendCtrlV();
                pasted = true;
                usedAttempt = attempt;
              } catch {
                // ignore and continue fallback chain
              }
              continue;
            }

            if (attempt === 'shift-insert') {
              try {
                await windowsSendShiftInsert();
                pasted = true;
                usedAttempt = attempt;
              } catch {
                // ignore and continue fallback chain
              }
            }
          }
          pasteAttemptMs = Date.now() - pasteAttemptStartAt;

          if (!pasted) {
            return {
              pasted: false,
              restored: false,
              skippedReason: resolvePasteFailureReason(targetReady),
              metrics: {
                resolveWindowMs,
                pasteAttemptMs,
                clipboardRestoreMs,
              },
            };
          }

          if (usedAttempt) {
            await options.rememberInjectionMethod(appKey, usedAttempt);
          }

          let restored = false;
          const restoreStartAt = Date.now();
          try {
            await withTimeout(
              (async () => {
                await sleep(110);
                if (clipboard.readText() === normalized) {
                  restoreClipboard(previous);
                  restored = true;
                }
              })(),
              CLIPBOARD_RESTORE_MAX_MS,
              'clipboard restore timeout',
            );
          } catch {
            // ignore restore timeout
          }
          clipboardRestoreMs = Date.now() - restoreStartAt;

          console.log(
            `[perf] resolve_window_ms=${resolveWindowMs} paste_attempt_ms=${pasteAttemptMs} clipboard_restore_ms=${clipboardRestoreMs}`,
          );

          return {
            pasted,
            restored,
            metrics: {
              resolveWindowMs,
              pasteAttemptMs,
              clipboardRestoreMs,
            },
          };
        })(),
        CLIPBOARD_TX_TIMEOUT_MS,
        'clipboard transaction timeout',
      ).catch(() => ({
        pasted: false,
        restored: false,
        skippedReason: 'TIMEOUT' as const,
        metrics: {
          resolveWindowMs: 0,
          pasteAttemptMs: 0,
          clipboardRestoreMs: 0,
        },
      })),
    );
  }

  return {
    getForegroundWindowHandle,
    resolveInjectionTargetWindowHandle,
    injectText,
  };
}

export type { InjectResult };
