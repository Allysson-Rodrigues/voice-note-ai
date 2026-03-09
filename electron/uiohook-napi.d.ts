declare module "uiohook-napi" {
  export type UiohookKeyEvent = {
    keycode: number;
    ctrlKey?: boolean;
    metaKey?: boolean;
    altKey?: boolean;
    shiftKey?: boolean;
  };

  export const uIOhook: {
    on: (
      event: "keydown" | "keyup" | string,
      cb: (event: UiohookKeyEvent) => void,
    ) => void;
    off: (
      event: "keydown" | "keyup" | string,
      cb: (event: UiohookKeyEvent) => void,
    ) => void;
    start: () => void;
    stop?: () => void;
  };
  const _default: { uIOhook: typeof uIOhook };
  export default _default;
}
