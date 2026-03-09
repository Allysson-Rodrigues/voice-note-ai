import { BrowserWindow, clipboard } from 'electron';
import { spawn } from 'node:child_process';
import {
  buildPasteAttemptOrder,
  resolvePasteFailureReason,
  resolvePreferredWindowHandle,
  type PasteAttempt,
} from '../injection-plan.js';
import { logPerf, logWarn } from '../logger.js';

const CLIPBOARD_RESTORE_MAX_MS = 200;
const CLIPBOARD_TX_TIMEOUT_MS = 3000;
const APP_KEY_CACHE_TTL_MS = 15000;
const APP_KEY_CACHE_MAX_ENTRIES = 128;
const RESOLVE_WINDOW_RETRIES = 2;
const WINDOW_PASTE_RETRIES = 2;
const KEYBOARD_PASTE_RETRIES = 2;
const RETRY_SLEEP_MS = 60;

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
  method?: PasteAttempt | null;
  appKey?: string | null;
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

type InjectionMethodStats = Record<PasteAttempt, { success: number; failure: number }>;

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function retryBooleanOperation(
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

async function retryPromiseOperation(
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

// ── PowerShell spawn (original, proven approach) ───────────────────────

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
        /* ignore */
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

// ── Win32 helpers ──────────────────────────────────────────────────────

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

// Phase 2: Single consolidated call — resolve + focus + appKey (1 spawn instead of 4-6)
type ResolvedWindowInfo = {
  targetReady: boolean;
  currentHandle: string | null;
  appKey: string | null;
};

async function resolveTargetWindowInfo(
  targetWindowHandle: string | null,
): Promise<ResolvedWindowInfo> {
  if (process.platform !== 'win32') {
    return { targetReady: true, currentHandle: null, appKey: null };
  }

  const target = targetWindowHandle?.trim() ?? '';
  const hasTarget = Boolean(target && /^-?\d+$/.test(target));

  const focusLines = hasTarget
    ? [
        `$target = [int64]${target}`,
        'if ($current -ne $target) {',
        '  [void][VoiceNote.NativeWin32All]::SetForegroundWindow([System.IntPtr]::new($target))',
        '  Start-Sleep -Milliseconds 50',
        '  $current = [VoiceNote.NativeWin32All]::GetForegroundWindow().ToInt64()',
        '  $ready = ($current -eq $target)',
        '}',
      ]
    : [];

  const script = [
    '$ErrorActionPreference = "Stop"',
    'if (-not ("VoiceNote.NativeWin32All" -as [type])) {',
    'Add-Type -Namespace VoiceNote -Name NativeWin32All -MemberDefinition @"',
    '  [System.Runtime.InteropServices.DllImport("user32.dll")]',
    '  public static extern System.IntPtr GetForegroundWindow();',
    '  [System.Runtime.InteropServices.DllImport("user32.dll")]',
    '  public static extern bool SetForegroundWindow(System.IntPtr hWnd);',
    '  [System.Runtime.InteropServices.DllImport("user32.dll")]',
    '  public static extern uint GetWindowThreadProcessId(System.IntPtr hWnd, out uint lpdwProcessId);',
    '"@ }',
    '$current = [VoiceNote.NativeWin32All]::GetForegroundWindow().ToInt64()',
    '$ready = $true',
    ...focusLines,
    '$app = ""',
    '$wpid = 0',
    '[void][VoiceNote.NativeWin32All]::GetWindowThreadProcessId([System.IntPtr]::new($current), [ref]$wpid)',
    'if ($wpid -ne 0) {',
    '  $proc = Get-Process -Id $wpid -ErrorAction SilentlyContinue',
    '  if ($proc -and $proc.ProcessName) { $app = $proc.ProcessName }',
    '}',
    '[Console]::Out.Write((@{ handle = "$current"; ready = [bool]$ready; app = $app } | ConvertTo-Json -Compress))',
  ].join('; ');

  for (let attempt = 1; attempt <= RESOLVE_WINDOW_RETRIES; attempt += 1) {
    try {
      const raw = await runPowerShell(script, 1500);
      const parsed = JSON.parse(raw) as { handle?: string; ready?: boolean; app?: string };
      const result = {
        targetReady: parsed.ready !== false,
        currentHandle: parsed.handle && parsed.handle !== '0' ? parsed.handle : null,
        appKey: parsed.app ? parsed.app.toLowerCase() : null,
      };
      if (result.targetReady || attempt >= RESOLVE_WINDOW_RETRIES) {
        return result;
      }
    } catch {
      if (attempt >= RESOLVE_WINDOW_RETRIES) {
        return { targetReady: false, currentHandle: null, appKey: null };
      }
    }
    await sleep(RETRY_SLEEP_MS);
  }

  return { targetReady: false, currentHandle: null, appKey: null };
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
  await retryPromiseOperation(
    async () => {
      await runPowerShell(script, 1000);
    },
    KEYBOARD_PASTE_RETRIES,
    RETRY_SLEEP_MS,
  );
}

async function windowsSendShiftInsert() {
  const script = [
    '$ErrorActionPreference = "Stop"',
    '$wshell = New-Object -ComObject WScript.Shell',
    "Start-Sleep -Milliseconds 40; $wshell.SendKeys('+{INSERT}')",
  ].join('; ');
  await retryPromiseOperation(
    async () => {
      await runPowerShell(script, 1000);
    },
    KEYBOARD_PASTE_RETRIES,
    RETRY_SLEEP_MS,
  );
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

  return await retryBooleanOperation(
    async () => {
      try {
        await runPowerShell(script, 1000);
        return true;
      } catch {
        return false;
      }
    },
    WINDOW_PASTE_RETRIES,
    RETRY_SLEEP_MS,
  );
}

// ── Clipboard helpers ──────────────────────────────────────────────────

function snapshotClipboard(): ClipboardSnapshot {
  let image: Electron.NativeImage | null = null;
  try {
    const candidate = clipboard.readImage();
    if (candidate && !candidate.isEmpty()) image = candidate;
  } catch {
    image = null;
  }

  let text = '',
    html = '',
    rtf = '';
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

// ── Service factory ────────────────────────────────────────────────────

export function createTextInjectionService(options: TextInjectionServiceOptions) {
  let injectionQueue: Promise<void> = Promise.resolve();
  const appKeyCache = new Map<string, { appKey: string | null; expiresAt: number }>();
  let recentInjectionStats: {
    appKey: string | null;
    method: PasteAttempt | null;
    pasted: boolean;
    skippedReason?: 'WINDOW_CHANGED' | 'PASTE_FAILED' | 'TIMEOUT';
    updatedAt: string;
  } | null = null;
  const methodStats = new Map<string, InjectionMethodStats>();

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
    appKeyCache.set(handle, { appKey, expiresAt: Date.now() + APP_KEY_CACHE_TTL_MS });
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

  function getMethodStats(appKey: string | null) {
    const key = appKey ?? '__default__';
    const existing = methodStats.get(key);
    if (existing) return existing;
    const seeded: InjectionMethodStats = {
      'target-handle': { success: 0, failure: 0 },
      'foreground-handle': { success: 0, failure: 0 },
      'ctrl-v': { success: 0, failure: 0 },
      'shift-insert': { success: 0, failure: 0 },
    };
    methodStats.set(key, seeded);
    return seeded;
  }

  function prioritizeAttempts(appKey: string | null, attempts: PasteAttempt[]) {
    const stats = getMethodStats(appKey);
    return attempts.slice().sort((a, b) => {
      const aScore = stats[a].success - stats[a].failure;
      const bScore = stats[b].success - stats[b].failure;
      return bScore - aScore;
    });
  }

  function recordAttemptResult(
    appKey: string | null,
    method: PasteAttempt | null,
    pasted: boolean,
    skippedReason?: 'WINDOW_CHANGED' | 'PASTE_FAILED' | 'TIMEOUT',
  ) {
    recentInjectionStats = {
      appKey,
      method,
      pasted,
      skippedReason,
      updatedAt: new Date().toISOString(),
    };
    if (!method) return;
    const stats = getMethodStats(appKey);
    if (pasted) stats[method].success += 1;
    else stats[method].failure += 1;
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
    request?: { forceCopyOnly?: boolean },
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

          if (request?.forceCopyOnly || !options.canAutoPaste()) {
            return {
              pasted: false,
              restored: false,
              metrics: { resolveWindowMs, pasteAttemptMs, clipboardRestoreMs },
              method: null,
              appKey: null,
            };
          }

          // Phase 2+3: consolidated resolve with cache fast-path
          const resolveWindowStartAt = Date.now();
          let targetReady: boolean;
          let currentHandle: string | null;
          let appKey: string | null;

          const cachedAppKey = readCachedAppKey(targetWindowHandle);
          if (targetWindowHandle && cachedAppKey !== undefined) {
            // Phase 3: cache hit — trust primed handle, skip PS call
            targetReady = true;
            currentHandle = targetWindowHandle;
            appKey = cachedAppKey;
          } else {
            // Phase 2: single consolidated PS call (1 spawn instead of 4-6)
            const info = await resolveTargetWindowInfo(targetWindowHandle);
            targetReady = info.targetReady;
            currentHandle = info.currentHandle;
            appKey = info.appKey;
            if (currentHandle) cacheAppKey(currentHandle, appKey);
            if (targetWindowHandle && targetWindowHandle !== currentHandle) {
              cacheAppKey(targetWindowHandle, appKey);
            }
          }
          resolveWindowMs = Date.now() - resolveWindowStartAt;

          const preferredAttempt = options.getPreferredInjectionMethod(appKey);
          const attemptOrder = prioritizeAttempts(
            appKey,
            buildPasteAttemptOrder({
              targetReady,
              targetHandle: targetWindowHandle,
              foregroundHandle: currentHandle,
              preferredAttempt,
            }),
          );

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
                /* fallback */
              }
              continue;
            }
            if (attempt === 'shift-insert') {
              try {
                await windowsSendShiftInsert();
                pasted = true;
                usedAttempt = attempt;
              } catch {
                /* fallback */
              }
            }
          }
          pasteAttemptMs = Date.now() - pasteAttemptStartAt;

          if (!pasted) {
            const skippedReason = resolvePasteFailureReason(targetReady);
            recordAttemptResult(appKey, usedAttempt, false, skippedReason);
            return {
              pasted: false,
              restored: false,
              skippedReason,
              metrics: { resolveWindowMs, pasteAttemptMs, clipboardRestoreMs },
              method: usedAttempt,
              appKey,
            };
          }

          if (usedAttempt) await options.rememberInjectionMethod(appKey, usedAttempt);

          let restored = false;
          const restoreStartAt = Date.now();
          try {
            await withTimeout(
              (async () => {
                await sleep(110);
                if (clipboard.readText() === normalized) {
                  restoreClipboard(previous);
                  restored = true;
                } else {
                  clipboard.clear();
                  logWarn('clipboard changed before restore', { appKey, method: usedAttempt });
                }
              })(),
              CLIPBOARD_RESTORE_MAX_MS,
              'clipboard restore timeout',
            );
          } catch {
            /* ignore */
          }
          clipboardRestoreMs = Date.now() - restoreStartAt;

          recordAttemptResult(appKey, usedAttempt, pasted);
          logPerf('text injection completed', {
            appKey,
            method: usedAttempt,
            resolveWindowMs,
            pasteAttemptMs,
            clipboardRestoreMs,
            restored,
          });

          return {
            pasted,
            restored,
            metrics: { resolveWindowMs, pasteAttemptMs, clipboardRestoreMs },
            method: usedAttempt,
            appKey,
          };
        })(),
        CLIPBOARD_TX_TIMEOUT_MS,
        'clipboard transaction timeout',
      ).catch(() => {
        recordAttemptResult(null, null, false, 'TIMEOUT');
        return {
          pasted: false,
          restored: false,
          skippedReason: 'TIMEOUT' as const,
          metrics: { resolveWindowMs: 0, pasteAttemptMs: 0, clipboardRestoreMs: 0 },
          method: null,
          appKey: null,
        };
      }),
    );
  }

  return {
    getForegroundWindowHandle,
    getWindowAppKey: resolveWindowAppKey,
    resolveInjectionTargetWindowHandle,
    injectText,
    getRecentInjectionStats: () => recentInjectionStats,
  };
}

export type { InjectResult };
