import { describe, expect, it, vi } from 'vitest';
import {
  buildContentSecurityPolicy,
  hardenBrowserWindow,
  installSessionSecurity,
  isAllowedPermissionRequest,
  isTrustedAppOrigin,
} from './window-security.js';

describe('window security', () => {
  it('builds csp with dev server allowances', () => {
    const csp = buildContentSecurityPolicy('http://localhost:8080');
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain('http://localhost:8080');
    expect(csp).toContain("'unsafe-eval'");
  });

  it('builds production csp without unsafe-eval', () => {
    const csp = buildContentSecurityPolicy();
    expect(csp).not.toContain("'unsafe-eval'");
  });

  it('trusts file urls and localhost dev origins', () => {
    expect(isTrustedAppOrigin('file://')).toBe(true);
    expect(isTrustedAppOrigin('http://localhost:8080', 'http://localhost:8080')).toBe(true);
    expect(isTrustedAppOrigin('http://127.0.0.1:8080', 'http://localhost:8080')).toBe(true);
    expect(isTrustedAppOrigin('https://example.com', 'http://localhost:8080')).toBe(false);
  });

  it('only allows microphone permission for trusted origins', () => {
    expect(
      isAllowedPermissionRequest(
        'media',
        'http://localhost:8080',
        { mediaTypes: ['audio'] },
        'http://localhost:8080',
      ),
    ).toBe(true);
    expect(
      isAllowedPermissionRequest(
        'media',
        'http://localhost:8080',
        { mediaTypes: ['audio', 'video'] },
        'http://localhost:8080',
      ),
    ).toBe(false);
    expect(
      isAllowedPermissionRequest(
        'clipboard-sanitized-write',
        'http://localhost:8080',
        {},
        'http://localhost:8080',
      ),
    ).toBe(false);
  });

  it('hardens browser window navigation', () => {
    const setWindowOpenHandler = vi.fn();
    let willNavigateHandler: ((event: { preventDefault: () => void }, url: string) => void) | null = null;
    const preventDefault = vi.fn();
    const fakeWindow = {
      webContents: {
        setWindowOpenHandler,
        on: vi.fn((event, handler) => {
          if (event === 'will-navigate') willNavigateHandler = handler;
        }),
      },
    } as never;

    hardenBrowserWindow(fakeWindow, 'http://localhost:8080');
    expect(setWindowOpenHandler).toHaveBeenCalled();
    expect(willNavigateHandler).not.toBeNull();
    willNavigateHandler?.({ preventDefault }, 'https://example.com');
    expect(preventDefault).toHaveBeenCalled();
  });

  it('installs csp and permission handlers on the session', () => {
    const onHeadersReceived = vi.fn();
    const setPermissionCheckHandler = vi.fn();
    const setPermissionRequestHandler = vi.fn();
    const fakeSession = {
      webRequest: { onHeadersReceived },
      setPermissionCheckHandler,
      setPermissionRequestHandler,
    } as never;

    const summary = installSessionSecurity(fakeSession, 'http://localhost:8080');

    expect(summary.cspEnabled).toBe(true);
    expect(summary.permissionsPolicy).toBe('default-deny');
    expect(summary.trustedOrigins).toContain('http://localhost:8080');
    expect(onHeadersReceived).toHaveBeenCalled();
    expect(setPermissionCheckHandler).toHaveBeenCalled();
    expect(setPermissionRequestHandler).toHaveBeenCalled();
  });
});
