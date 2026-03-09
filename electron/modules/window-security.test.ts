import { beforeEach, describe, expect, it, vi } from "vitest";

const loggerMocks = vi.hoisted(() => ({
  logInfo: vi.fn(),
  logWarn: vi.fn(),
}));

vi.mock("../logger.js", () => ({
  logInfo: loggerMocks.logInfo,
  logWarn: loggerMocks.logWarn,
}));
import {
  buildContentSecurityPolicy,
  hardenBrowserWindow,
  installSessionSecurity,
  isAllowedPermissionRequest,
  isTrustedAppOrigin,
} from "./window-security.js";

describe("window security", () => {
  beforeEach(() => {
    loggerMocks.logInfo.mockClear();
    loggerMocks.logWarn.mockClear();
  });

  it("logs permission decision context", () => {
    const setPermissionCheckHandler = vi.fn();
    const setPermissionRequestHandler = vi.fn();
    const fakeSession = {
      webRequest: { onHeadersReceived: vi.fn() },
      setPermissionCheckHandler,
      setPermissionRequestHandler,
    } as never;

    installSessionSecurity(fakeSession, "http://localhost:8080");

    const permissionRequestHandler =
      setPermissionRequestHandler.mock.calls[0]?.[0];
    const callback = vi.fn();

    permissionRequestHandler?.(
      { getURL: () => "http://localhost:8080/index.html" },
      "media",
      callback,
      { mediaTypes: ["audio"] },
    );

    expect(callback).toHaveBeenCalledWith(true);
    expect(loggerMocks.logInfo).toHaveBeenCalledWith(
      "permission request allowed",
      expect.objectContaining({
        permission: "media",
        origin: "http://localhost:8080",
        mediaTypes: ["audio"],
        decision: "allow",
      }),
    );
  });

  it("builds csp with dev server allowances", () => {
    const csp = buildContentSecurityPolicy("http://localhost:8080");
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("http://localhost:8080");
    expect(csp).toContain("'unsafe-eval'");
  });

  it("builds production csp without unsafe-eval", () => {
    const csp = buildContentSecurityPolicy();
    expect(csp).not.toContain("'unsafe-eval'");
  });

  it("trusts file urls and localhost dev origins", () => {
    expect(isTrustedAppOrigin("file://")).toBe(true);
    expect(
      isTrustedAppOrigin(
        "file:///C:/Users/allys/dev/voice-note-ai/dist/index.html",
      ),
    ).toBe(true);
    expect(
      isTrustedAppOrigin("http://localhost:8080", "http://localhost:8080"),
    ).toBe(true);
    expect(
      isTrustedAppOrigin("http://127.0.0.1:8080", "http://localhost:8080"),
    ).toBe(true);
    expect(
      isTrustedAppOrigin("https://example.com", "http://localhost:8080"),
    ).toBe(false);
  });

  it("only allows microphone permission for trusted origins", () => {
    expect(
      isAllowedPermissionRequest(
        "media",
        "http://localhost:8080",
        { mediaTypes: ["audio"] },
        "http://localhost:8080",
      ),
    ).toBe(true);
    expect(
      isAllowedPermissionRequest(
        "media",
        "http://localhost:8080",
        { mediaTypes: ["audio", "video"] },
        "http://localhost:8080",
      ),
    ).toBe(false);
    expect(
      isAllowedPermissionRequest(
        "clipboard-sanitized-write",
        "http://localhost:8080",
        {},
        "http://localhost:8080",
      ),
    ).toBe(false);
  });

  it("hardens browser window navigation", () => {
    const setWindowOpenHandler = vi.fn();
    let willNavigateHandler:
      | ((event: { preventDefault: () => void }, url: string) => void)
      | null = null;
    const preventDefault = vi.fn();
    const fakeWindow = {
      webContents: {
        setWindowOpenHandler,
        on: vi.fn((event, handler) => {
          if (event === "will-navigate") willNavigateHandler = handler;
        }),
      },
    } as never;

    hardenBrowserWindow(fakeWindow, "http://localhost:8080");
    expect(setWindowOpenHandler).toHaveBeenCalled();
    expect(willNavigateHandler).not.toBeNull();
    willNavigateHandler?.({ preventDefault }, "https://example.com");
    expect(preventDefault).toHaveBeenCalled();
  });

  it("installs csp and permission handlers on the session", () => {
    const onHeadersReceived = vi.fn();
    const setPermissionCheckHandler = vi.fn();
    const setPermissionRequestHandler = vi.fn();
    const fakeSession = {
      webRequest: { onHeadersReceived },
      setPermissionCheckHandler,
      setPermissionRequestHandler,
    } as never;

    const summary = installSessionSecurity(
      fakeSession,
      "http://localhost:8080",
    );

    expect(summary.cspEnabled).toBe(true);
    expect(summary.permissionsPolicy).toBe("default-deny");
    expect(summary.trustedOrigins).toContain("http://localhost:8080");
    expect(onHeadersReceived).toHaveBeenCalled();
    expect(setPermissionCheckHandler).toHaveBeenCalled();
    expect(setPermissionRequestHandler).toHaveBeenCalled();

    const permissionCheckHandler = setPermissionCheckHandler.mock.calls[0]?.[0];
    const permissionRequestHandler =
      setPermissionRequestHandler.mock.calls[0]?.[0];

    expect(
      permissionCheckHandler?.(
        { getURL: () => "https://example.com" },
        "media",
        "https://example.com",
        { mediaType: "audio" },
      ),
    ).toBe(false);

    const callback = vi.fn();
    permissionRequestHandler?.(
      { getURL: () => "https://example.com" },
      "media",
      callback,
      {
        mediaTypes: ["audio"],
      },
    );
    expect(callback).toHaveBeenCalledWith(false);
  });

  it("allows microphone permission for packaged file windows", () => {
    const setPermissionCheckHandler = vi.fn();
    const setPermissionRequestHandler = vi.fn();
    const fakeSession = {
      webRequest: { onHeadersReceived: vi.fn() },
      setPermissionCheckHandler,
      setPermissionRequestHandler,
    } as never;

    installSessionSecurity(fakeSession);

    const permissionCheckHandler = setPermissionCheckHandler.mock.calls[0]?.[0];
    const permissionRequestHandler =
      setPermissionRequestHandler.mock.calls[0]?.[0];

    expect(
      permissionCheckHandler?.(
        {
          getURL: () =>
            "file:///C:/Users/allys/dev/voice-note-ai/dist/index.html",
        },
        "media",
        "",
        { mediaTypes: ["audio"] },
      ),
    ).toBe(true);

    const callback = vi.fn();
    permissionRequestHandler?.(
      {
        getURL: () =>
          "file:///C:/Users/allys/dev/voice-note-ai/dist/index.html",
      },
      "media",
      callback,
      { mediaTypes: ["audio"] },
    );
    expect(callback).toHaveBeenCalledWith(true);
  });
});
