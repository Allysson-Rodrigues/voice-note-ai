const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("voiceNoteAI", {
  onHudState: (cb) => {
    const listener = (_event, payload) => cb(payload);
    ipcRenderer.on("hud:state", listener);
    return () => ipcRenderer.off("hud:state", listener);
  },
  onHudLevel: (cb) => {
    const listener = (_event, payload) => cb(payload);
    ipcRenderer.on("hud:level", listener);
    return () => ipcRenderer.off("hud:level", listener);
  },
  onHudHover: (cb) => {
    const listener = (_event, payload) => cb(payload);
    ipcRenderer.on("hud:hover", listener);
    return () => ipcRenderer.off("hud:hover", listener);
  },
});
