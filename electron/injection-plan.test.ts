import { describe, expect, it } from 'vitest';
import {
  buildPasteAttemptOrder,
  resolvePasteFailureReason,
  resolvePreferredWindowHandle,
} from './injection-plan.js';

describe('injection plan helpers', () => {
  it('prefers current foreground handle when it is not internal', () => {
    const handle = resolvePreferredWindowHandle({
      currentHandle: '300',
      sessionTargetWindowHandle: '200',
      internalHandles: ['100', '101'],
    });
    expect(handle).toBe('300');
  });

  it('falls back to session target when current is internal', () => {
    const handle = resolvePreferredWindowHandle({
      currentHandle: '100',
      sessionTargetWindowHandle: '200',
      internalHandles: ['100', '101'],
    });
    expect(handle).toBe('200');
  });

  it('returns available handle when both are internal or missing', () => {
    const handle = resolvePreferredWindowHandle({
      currentHandle: '100',
      sessionTargetWindowHandle: null,
      internalHandles: ['100', '101'],
    });
    expect(handle).toBe('100');
  });

  it('builds paste attempt order with both handles', () => {
    const order = buildPasteAttemptOrder({
      targetReady: true,
      targetHandle: '200',
      foregroundHandle: '300',
    });
    expect(order).toEqual(['target-handle', 'foreground-handle', 'ctrl-v', 'shift-insert']);
  });

  it('skips target-handle attempt when target is not ready', () => {
    const order = buildPasteAttemptOrder({
      targetReady: false,
      targetHandle: '200',
      foregroundHandle: '300',
    });
    expect(order).toEqual(['foreground-handle', 'ctrl-v', 'shift-insert']);
  });

  it('prioritizes preferred paste attempt when available', () => {
    const order = buildPasteAttemptOrder({
      targetReady: true,
      targetHandle: '200',
      foregroundHandle: '300',
      preferredAttempt: 'ctrl-v',
    });
    expect(order).toEqual(['ctrl-v', 'target-handle', 'foreground-handle', 'shift-insert']);
  });

  it('maps failure reason based on target readiness', () => {
    expect(resolvePasteFailureReason(false)).toBe('WINDOW_CHANGED');
    expect(resolvePasteFailureReason(true)).toBe('PASTE_FAILED');
  });
});
