import { BrowserWindow, clipboard } from "electron";
import {
  buildPasteAttemptOrder,
  resolvePasteFailureReason,
  resolvePreferredWindowHandle,
  type PasteAttempt,
} from "../injection-plan.js";
import { logPerf, logWarn } from "../logger.js";
import {
  APP_KEY_CACHE_MAX_ENTRIES,
  APP_KEY_CACHE_TTL_MS,
  CLIPBOARD_RESTORE_MAX_MS,
  CLIPBOARD_TX_TIMEOUT_MS,
  getWindowHandle,
  restoreClipboard,
  sleep,
  snapshotClipboard,
  windowsLineEndings,
  withTimeout,
} from "./text-injection-support.js";
import {
  getForegroundWindowHandle,
  getWindowAppKeyByHandle,
  resolveTargetWindowInfo,
  windowsPasteToHandle,
  windowsSendCtrlV,
  windowsSendShiftInsert,
} from "./text-injection-win32.js";

type InjectMetrics = {
  resolveWindowMs: number;
  pasteAttemptMs: number;
  clipboardRestoreMs: number;
};

type InjectResult = {
  pasted: boolean;
  restored: boolean;
  skippedReason?: "WINDOW_CHANGED" | "PASTE_FAILED" | "TIMEOUT";
  metrics?: InjectMetrics;
  method?: PasteAttempt | null;
  appKey?: string | null;
};

type TextInjectionServiceOptions = {
  canAutoPaste: () => boolean;
  getMainWindow: () => BrowserWindow | null;
  getHudWindow: () => BrowserWindow | null;
  getPreferredInjectionMethod: (appKey: string | null) => PasteAttempt | null;
  rememberInjectionMethod: (
    appKey: string | null,
    method: PasteAttempt,
  ) => Promise<void>;
};

type InjectionMethodStats = Record<
  PasteAttempt,
  { success: number; failure: number }
>;

// ── Service factory ────────────────────────────────────────────────────

export function createTextInjectionService(
  options: TextInjectionServiceOptions,
) {
  let injectionQueue: Promise<void> = Promise.resolve();
  const appKeyCache = new Map<
    string,
    { appKey: string | null; expiresAt: number }
  >();
  let recentInjectionStats: {
    appKey: string | null;
    method: PasteAttempt | null;
    pasted: boolean;
    skippedReason?: "WINDOW_CHANGED" | "PASTE_FAILED" | "TIMEOUT";
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
    appKeyCache.set(handle, {
      appKey,
      expiresAt: Date.now() + APP_KEY_CACHE_TTL_MS,
    });
    if (appKeyCache.size <= APP_KEY_CACHE_MAX_ENTRIES) return;
    const firstKey = appKeyCache.keys().next().value;
    if (typeof firstKey === "string") appKeyCache.delete(firstKey);
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
    const key = appKey ?? "__default__";
    const existing = methodStats.get(key);
    if (existing) return existing;
    const seeded: InjectionMethodStats = {
      "target-handle": { success: 0, failure: 0 },
      "foreground-handle": { success: 0, failure: 0 },
      "ctrl-v": { success: 0, failure: 0 },
      "shift-insert": { success: 0, failure: 0 },
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
    skippedReason?: "WINDOW_CHANGED" | "PASTE_FAILED" | "TIMEOUT",
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

  async function resolveInjectionTargetWindowHandle(
    sessionTargetWindowHandle: string | null,
  ) {
    if (process.platform !== "win32") return sessionTargetWindowHandle;
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

            if (attempt === "target-handle" && targetWindowHandle) {
              pasted = await windowsPasteToHandle(targetWindowHandle);
              if (pasted) usedAttempt = attempt;
              continue;
            }
            if (attempt === "foreground-handle" && currentHandle) {
              pasted = await windowsPasteToHandle(currentHandle);
              if (pasted) usedAttempt = attempt;
              continue;
            }
            if (attempt === "ctrl-v") {
              try {
                await windowsSendCtrlV();
                pasted = true;
                usedAttempt = attempt;
              } catch {
                /* fallback */
              }
              continue;
            }
            if (attempt === "shift-insert") {
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

          if (usedAttempt)
            await options.rememberInjectionMethod(appKey, usedAttempt);

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
                  logWarn("clipboard changed before restore", {
                    appKey,
                    method: usedAttempt,
                  });
                }
              })(),
              CLIPBOARD_RESTORE_MAX_MS,
              "clipboard restore timeout",
            );
          } catch {
            /* ignore */
          }
          clipboardRestoreMs = Date.now() - restoreStartAt;

          recordAttemptResult(appKey, usedAttempt, pasted);
          logPerf("text injection completed", {
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
        "clipboard transaction timeout",
      ).catch(() => {
        recordAttemptResult(null, null, false, "TIMEOUT");
        return {
          pasted: false,
          restored: false,
          skippedReason: "TIMEOUT" as const,
          metrics: {
            resolveWindowMs: 0,
            pasteAttemptMs: 0,
            clipboardRestoreMs: 0,
          },
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
