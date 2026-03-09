import { afterEach, describe, expect, it, vi } from 'vitest';
import { getMicrophonePermissionState, normalizeCaptureStartError } from '@/audio/capture';

const originalPermissions = navigator.permissions;
const originalMediaDevices = navigator.mediaDevices;

describe('audio capture helpers', () => {
  afterEach(() => {
    Object.defineProperty(navigator, 'permissions', {
      configurable: true,
      value: originalPermissions,
    });
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: originalMediaDevices,
    });
  });

  it('classifica NotAllowedError como permissao negada', () => {
    const normalized = normalizeCaptureStartError(
      Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' }),
    );

    expect(normalized.code).toBe('permission-denied');
    expect(normalized.message).toContain('Windows');
  });

  it('consulta o estado de permissao do microfone quando a Permissions API existe', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn(),
      },
    });
    Object.defineProperty(navigator, 'permissions', {
      configurable: true,
      value: {
        query: vi.fn(async () => ({ state: 'denied' })),
      },
    });

    await expect(getMicrophonePermissionState()).resolves.toBe('denied');
  });
});
