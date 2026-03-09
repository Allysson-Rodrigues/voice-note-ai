import type { ExtendedStatus } from './types';
import type { HealthStatus } from '@/electron';

export function statusDotClass(status: ExtendedStatus | 'loading') {
  switch (status) {
    case 'loading':
      return 'bg-yellow-500 shadow-[0_0_0_3px_rgba(234,179,8,0.15)]';
    case 'listening':
      return 'bg-state-listening shadow-[0_0_0_3px_rgba(244,63,94,0.15)]';
    case 'finalizing':
      return 'bg-state-finalizing shadow-[0_0_0_3px_rgba(139,92,246,0.15)]';
    case 'injecting':
      return 'bg-state-injecting shadow-[0_0_0_3px_rgba(14,165,233,0.15)]';
    case 'success':
      return 'bg-state-success shadow-[0_0_0_3px_rgba(16,185,129,0.15)]';
    case 'error':
      return 'bg-state-error shadow-[0_0_0_3px_rgba(249,115,22,0.15)]';
    default:
      return 'bg-white/30';
  }
}

export function healthDotClass(status: HealthStatus) {
  if (status === 'ok') return 'bg-state-success';
  if (status === 'warn') return 'bg-state-finalizing';
  return 'bg-state-error';
}

export function clampHistoryRetentionDays(value: number) {
  if (!Number.isFinite(value)) return 30;
  return Math.max(1, Math.min(365, Math.round(value)));
}

export function formatHistoryDate(value: string) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return new Date(parsed).toLocaleString();
}
