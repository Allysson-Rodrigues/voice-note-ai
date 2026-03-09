import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSttSessionManager } from "./stt-session.js";

const providerState = vi.hoisted(() => {
  const provider = {
    prewarm: vi.fn(async () => undefined),
    start: vi.fn(async () => undefined),
    stop: vi.fn(async () => undefined),
    writeAudio: vi.fn(),
    close: vi.fn(),
  };
  return { provider };
});

vi.mock("./stt/stt-factory.js", () => ({
  createSttProvider: vi.fn(() => providerState.provider),
}));

function createIpcMainMock() {
  const handles = new Map<
    string,
    (event: { sender: { id: number } }, payload: unknown) => Promise<unknown>
  >();
  const events = new Map<
    string,
    (event: { sender: { id: number } }, payload: unknown) => void
  >();

  return {
    ipcMain: {
      handle: vi.fn((channel, handler) => {
        handles.set(channel, handler);
      }),
      on: vi.fn((channel, handler) => {
        events.set(channel, handler);
      }),
    },
    handles,
    events,
  };
}

function createManager(
  overrides: Partial<Parameters<typeof createSttSessionManager>[0]> = {},
) {
  return createSttSessionManager({
    isPackagedApp: false,
    getSettings: () => ({
      stopGraceMs: 200,
      maxSessionSeconds: 90,
      extraPhrases: [],
      languageMode: "pt-BR",
      dualLanguageStrategy: "fallback-on-low-confidence",
    }),
    getAzureCredentials: () => ({
      key: "key",
      region: "brazilsouth",
    }),
    getCaptureBlockedReason: () => null,
    broadcast: vi.fn(),
    setHudState: vi.fn(),
    emitAppError: vi.fn(),
    postprocessTranscript: vi.fn(async ({ rawText }) => ({
      text: rawText,
      appliedRules: [],
      intent: "free-text",
      rewriteApplied: false,
      rewriteRisk: "low",
    })),
    getMainWindow: () =>
      ({
        isDestroyed: () => false,
        webContents: { send: vi.fn() },
      }) as never,
    getForegroundWindowHandle: vi.fn(async () => null),
    getWindowAppKey: vi.fn(async () => null),
    resolveInjectionTargetWindowHandle: vi.fn(async () => null),
    injectText: vi.fn(async () => ({ pasted: false })),
    getDictionaryPhrases: vi.fn(async () => []),
    ...overrides,
  });
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("stt session security", () => {
  beforeEach(() => {
    providerState.provider.start.mockClear();
    providerState.provider.prewarm.mockClear();
    providerState.provider.stop.mockClear();
    providerState.provider.writeAudio.mockClear();
    providerState.provider.close.mockClear();
  });

  it("reuses the prewarmed provider on the first start", async () => {
    const manager = createManager();
    await manager.prewarmStt();

    const { ipcMain, handles } = createIpcMainMock();
    manager.registerIpcHandlers(ipcMain as never);

    const start = handles.get("stt:start");
    await start?.({ sender: { id: 1 } }, { sessionId: "session-prewarm" });

    expect(providerState.provider.prewarm).toHaveBeenCalledTimes(1);
    expect(providerState.provider.start).toHaveBeenCalledTimes(1);
  });

  it("ignores audio from a renderer that does not own the active session", async () => {
    const manager = createManager();
    const { ipcMain, handles, events } = createIpcMainMock();
    manager.registerIpcHandlers(ipcMain as never);

    const start = handles.get("stt:start");
    const audio = events.get("stt:audio");

    expect(start).toBeDefined();
    expect(audio).toBeDefined();

    await start?.({ sender: { id: 1 } }, { sessionId: "session-1" });
    audio?.(
      { sender: { id: 2 } },
      { sessionId: "session-1", pcm16kMonoInt16: new Uint8Array([1, 2, 3, 4]) },
    );

    expect(providerState.provider.writeAudio).not.toHaveBeenCalled();
  });

  it("drops audio chunks that violate the minimum chunk interval", async () => {
    const manager = createManager();
    const { ipcMain, handles, events } = createIpcMainMock();
    manager.registerIpcHandlers(ipcMain as never);

    const start = handles.get("stt:start");
    const audio = events.get("stt:audio");

    await start?.({ sender: { id: 1 } }, { sessionId: "session-2" });
    audio?.(
      { sender: { id: 1 } },
      { sessionId: "session-2", pcm16kMonoInt16: new Uint8Array([1, 2, 3, 4]) },
    );
    audio?.(
      { sender: { id: 1 } },
      { sessionId: "session-2", pcm16kMonoInt16: new Uint8Array([5, 6, 7, 8]) },
    );

    expect(providerState.provider.writeAudio).toHaveBeenCalledTimes(1);
  });

  it("rejects stop requests from a renderer that does not own the active session", async () => {
    const manager = createManager();
    const { ipcMain, handles } = createIpcMainMock();
    manager.registerIpcHandlers(ipcMain as never);

    const start = handles.get("stt:start");
    const stop = handles.get("stt:stop");

    await start?.({ sender: { id: 1 } }, { sessionId: "session-3" });

    await expect(
      stop?.({ sender: { id: 2 } }, { sessionId: "session-3" }),
    ).rejects.toThrow(/owns the active session/i);
  });

  it("blocks a second start while the first session is still starting", async () => {
    const deferredStart = createDeferred<void>();
    providerState.provider.start.mockImplementationOnce(async () => {
      await deferredStart.promise;
    });

    const manager = createManager();
    const { ipcMain, handles } = createIpcMainMock();
    manager.registerIpcHandlers(ipcMain as never);

    const start = handles.get("stt:start");
    const firstStart = start?.(
      { sender: { id: 1 } },
      { sessionId: "session-4" },
    );

    await vi.waitFor(() => {
      expect(providerState.provider.start).toHaveBeenCalledTimes(1);
    });

    await expect(
      start?.({ sender: { id: 1 } }, { sessionId: "session-5" }),
    ).rejects.toThrow(/session is already active/i);

    deferredStart.resolve();
    await firstStart;
  });

  it("encerra a captura quando a sessao ultrapassa o tempo maximo", async () => {
    vi.useFakeTimers();
    const mainWindow = {
      isDestroyed: () => false,
      webContents: { send: vi.fn() },
    } as never;
    const setHudState = vi.fn();
    const manager = createSttSessionManager({
      isPackagedApp: false,
      getSettings: () => ({
        stopGraceMs: 200,
        maxSessionSeconds: 30,
        extraPhrases: [],
        languageMode: "pt-BR",
        dualLanguageStrategy: "fallback-on-low-confidence",
      }),
      getAzureCredentials: () => ({
        key: "key",
        region: "brazilsouth",
      }),
      getCaptureBlockedReason: () => null,
      broadcast: vi.fn(),
      setHudState,
      emitAppError: vi.fn(),
      postprocessTranscript: vi.fn(),
      getMainWindow: () => mainWindow,
      getForegroundWindowHandle: vi.fn(async () => null),
      getWindowAppKey: vi.fn(async () => null),
      resolveInjectionTargetWindowHandle: vi.fn(async () => null),
      injectText: vi.fn(async () => ({ pasted: false })),
      getDictionaryPhrases: vi.fn(async () => []),
    });
    const { ipcMain, handles } = createIpcMainMock();
    manager.registerIpcHandlers(ipcMain as never);

    const start = handles.get("stt:start");
    await start?.({ sender: { id: 1 } }, { sessionId: "timeout-1" });

    await vi.advanceTimersByTimeAsync(30_000);

    expect(mainWindow.webContents.send).toHaveBeenCalledWith("capture:stop", {
      sessionId: "timeout-1",
    });
    expect(setHudState).toHaveBeenCalledWith(
      expect.objectContaining({ state: "error" }),
    );
    vi.useRealTimers();
  });

  it("libera a sessao ativa quando o provider emite erro e permite novo inicio", async () => {
    const manager = createManager();
    const { ipcMain, handles } = createIpcMainMock();
    manager.registerIpcHandlers(ipcMain as never);

    const start = handles.get("stt:start");
    await start?.({ sender: { id: 1 } }, { sessionId: "session-error" });

    const callbacks = providerState.provider.start.mock.calls[0]?.[3];
    callbacks?.onError("session-error", "provider fault");

    await vi.waitFor(() => {
      expect(providerState.provider.stop).toHaveBeenCalledWith("session-error");
    });

    await expect(
      start?.({ sender: { id: 1 } }, { sessionId: "session-next" }),
    ).resolves.toEqual({
      ok: true,
    });
  });

  it("forca copy-only quando a politica de baixa confianca exige revisao", async () => {
    const injectText = vi.fn(async () => ({ pasted: false, method: null }));
    const manager = createManager({
      injectText,
      resolveLowConfidencePolicy: () => "review",
    });
    const { ipcMain, handles } = createIpcMainMock();
    manager.registerIpcHandlers(ipcMain as never);

    const start = handles.get("stt:start");
    const stop = handles.get("stt:stop");

    await start?.({ sender: { id: 1 } }, { sessionId: "session-review" });
    const callbacks = providerState.provider.start.mock.calls[0]?.[3];
    callbacks?.onRecognized("session-review", {
      text: "texto para revisar",
      language: "pt-BR",
      confidence: 0.42,
    });

    await expect(
      stop?.({ sender: { id: 1 } }, { sessionId: "session-review" }),
    ).resolves.toEqual(
      expect.objectContaining({
        ok: true,
        message: "Texto copiado para revisão antes de colar.",
      }),
    );
    expect(injectText).toHaveBeenCalledWith("texto para revisar", null, {
      forceCopyOnly: true,
    });
  });
});
