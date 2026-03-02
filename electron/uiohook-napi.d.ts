declare module 'uiohook-napi' {
  export const uIOhook: {
    on: (event: string, cb: (event: any) => void) => void;
    off: (event: string, cb: (event: any) => void) => void;
    start: () => void;
    stop?: () => void;
  };
  const _default: { uIOhook: typeof uIOhook };
  export default _default;
}

