export type PasteAttempt = 'target-handle' | 'foreground-handle' | 'ctrl-v' | 'shift-insert';

export function isInternalHandle(handle: string | null, internalHandles: Array<string | null>) {
  if (!handle) return false;
  return internalHandles.some((entry) => entry === handle);
}

export function resolvePreferredWindowHandle(params: {
  currentHandle: string | null;
  sessionTargetWindowHandle: string | null;
  internalHandles: Array<string | null>;
}) {
  const { currentHandle, sessionTargetWindowHandle, internalHandles } = params;

  if (currentHandle && !isInternalHandle(currentHandle, internalHandles)) {
    return currentHandle;
  }

  if (sessionTargetWindowHandle && !isInternalHandle(sessionTargetWindowHandle, internalHandles)) {
    return sessionTargetWindowHandle;
  }

  return currentHandle ?? sessionTargetWindowHandle;
}

export function buildPasteAttemptOrder(params: {
  targetReady: boolean;
  targetHandle: string | null;
  foregroundHandle: string | null;
  preferredAttempt?: PasteAttempt | null;
}) {
  const attempts: PasteAttempt[] = [];
  const { targetReady, targetHandle, foregroundHandle, preferredAttempt } = params;

  if (targetReady && targetHandle) {
    attempts.push('target-handle');
  }

  if (foregroundHandle && (!targetReady || foregroundHandle !== targetHandle)) {
    attempts.push('foreground-handle');
  }

  attempts.push('ctrl-v', 'shift-insert');

  if (preferredAttempt && attempts.includes(preferredAttempt)) {
    return [preferredAttempt, ...attempts.filter((item) => item !== preferredAttempt)];
  }

  return attempts;
}

export function resolvePasteFailureReason(targetReady: boolean) {
  return targetReady ? ('PASTE_FAILED' as const) : ('WINDOW_CHANGED' as const);
}
