import type { BrowserWindow, Session } from 'electron';

function withTrailingSlash(url: string) {
  return url.endsWith('/') ? url : `${url}/`;
}

function swapLocalhost(url: string) {
  if (url.includes('://localhost')) return url.replace('://localhost', '://127.0.0.1');
  if (url.includes('://127.0.0.1')) return url.replace('://127.0.0.1', '://localhost');
  return null;
}

function toOrigin(url: string) {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export function getTrustedAppOrigins(devServerUrl?: string) {
  const origins = new Set<string>(['file://']);
  if (!devServerUrl) return [...origins];

  const primary = toOrigin(devServerUrl);
  if (primary) origins.add(primary);

  const swapped = swapLocalhost(devServerUrl);
  const fallback = swapped ? toOrigin(swapped) : null;
  if (fallback) origins.add(fallback);

  return [...origins];
}

export function isTrustedAppOrigin(origin: string | undefined, devServerUrl?: string) {
  if (!origin) return false;
  return getTrustedAppOrigins(devServerUrl).includes(origin);
}

export function isTrustedAppUrl(url: string, devServerUrl?: string) {
  if (url.startsWith('file://')) return true;
  const origin = toOrigin(url);
  return origin ? isTrustedAppOrigin(origin, devServerUrl) : false;
}

export function buildContentSecurityPolicy(devServerUrl?: string) {
  const connectSrc = ["'self'"];
  const scriptSrc = ["'self'"];
  const styleSrc = ["'self'", "'unsafe-inline'"];
  const imgSrc = ["'self'", 'data:', 'blob:'];
  const fontSrc = ["'self'", 'data:'];
  if (devServerUrl) {
    const trustedOrigins = getTrustedAppOrigins(devServerUrl).filter(
      (origin) => origin !== 'file://',
    );
    connectSrc.push(...trustedOrigins, 'ws:', 'wss:');
    scriptSrc.push("'unsafe-eval'", "'unsafe-inline'");
    imgSrc.push(...trustedOrigins.map((origin) => withTrailingSlash(origin)));
  }

  return [
    `default-src 'self'`,
    `script-src ${scriptSrc.join(' ')}`,
    `style-src ${styleSrc.join(' ')}`,
    `img-src ${imgSrc.join(' ')}`,
    `font-src ${fontSrc.join(' ')}`,
    `connect-src ${connectSrc.join(' ')}`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `frame-ancestors 'none'`,
    `form-action 'self'`,
  ].join('; ');
}

function isAllowedNavigation(url: string, devServerUrl?: string) {
  if (isTrustedAppUrl(url, devServerUrl)) return true;
  if (!devServerUrl) return false;
  return getTrustedAppOrigins(devServerUrl)
    .filter((origin) => origin !== 'file://')
    .some((origin) => url === origin || url.startsWith(withTrailingSlash(origin)));
}

function getDetailsRecord(details: unknown) {
  if (!details || typeof details !== 'object') return {};
  return details as Record<string, unknown>;
}

function extractRequestOrigin(
  webContents: { getURL?: () => string } | null | undefined,
  details?: unknown,
) {
  const record = getDetailsRecord(details);
  const requestingOrigin =
    typeof record.requestingOrigin === 'string' ? record.requestingOrigin : undefined;
  const securityOrigin =
    typeof record.securityOrigin === 'string' ? record.securityOrigin : undefined;
  return requestingOrigin ?? securityOrigin ?? webContents?.getURL?.() ?? '';
}

export function isAllowedPermissionRequest(
  permission: string,
  origin: string,
  details?: unknown,
  devServerUrl?: string,
) {
  if (permission !== 'media') return false;
  if (!isTrustedAppOrigin(origin, devServerUrl)) return false;
  const record = getDetailsRecord(details);
  const mediaTypes = Array.isArray(record.mediaTypes)
    ? record.mediaTypes.filter((entry): entry is string => typeof entry === 'string')
    : [];
  return !mediaTypes.includes('video');
}

export function installSessionSecurity(session: Session, devServerUrl?: string) {
  const csp = buildContentSecurityPolicy(devServerUrl);
  session.webRequest.onHeadersReceived((details, callback) => {
    if (details.resourceType !== 'mainFrame' && details.resourceType !== 'subFrame') {
      callback({ responseHeaders: details.responseHeaders });
      return;
    }

    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    });
  });

  session.setPermissionCheckHandler((_webContents, permission, _requestingOrigin, details) => {
    // Media (microphone) is always allowed — core app functionality
    if (permission === 'media') {
      const record = getDetailsRecord(details);
      const mediaType = typeof record.mediaType === 'string' ? record.mediaType : '';
      // Block video/camera, allow audio and unknown (enumerateDevices)
      return mediaType !== 'video';
    }
    return false;
  });

  session.setPermissionRequestHandler((_webContents, permission, callback, details) => {
    if (permission === 'media') {
      const record = getDetailsRecord(details);
      const mediaTypes = Array.isArray(record.mediaTypes)
        ? record.mediaTypes.filter((entry): entry is string => typeof entry === 'string')
        : [];
      callback(!mediaTypes.includes('video'));
      return;
    }
    callback(false);
  });

  return {
    cspEnabled: true,
    permissionsPolicy: 'default-deny' as const,
    trustedOrigins: getTrustedAppOrigins(devServerUrl),
  };
}

export function hardenBrowserWindow(win: BrowserWindow, devServerUrl?: string) {
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event, url) => {
    if (isAllowedNavigation(url, devServerUrl)) return;
    event.preventDefault();
  });
}
