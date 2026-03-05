const { contextBridge, ipcRenderer } = require('electron');

const api = {
  windowMinimize: () => ipcRenderer.send('window:minimize'),
  windowMaximize: () => ipcRenderer.send('window:maximize'),
  windowClose: () => ipcRenderer.send('window:close'),
  isWindowMaximized: () => ipcRenderer.invoke('window:is-maximized'),
  onMaximizedChange: (cb) => {
    const listener = (_event, isMaximized) => cb(isMaximized);
    ipcRenderer.on('window:maximized-change', listener);
    return () => ipcRenderer.off('window:maximized-change', listener);
  },
  listDictionary: () => ipcRenderer.invoke('dictionary:list'),
  exportDictionary: () => ipcRenderer.invoke('dictionary:export'),
  importDictionary: (payload) => ipcRenderer.invoke('dictionary:import', payload),
  addDictionaryTerm: (payload) => ipcRenderer.invoke('dictionary:add', payload),
  updateDictionaryTerm: (payload) => ipcRenderer.invoke('dictionary:update', payload),
  removeDictionaryTerm: (id) => ipcRenderer.invoke('dictionary:remove', { id }),
  listHistory: (params) => ipcRenderer.invoke('history:list', params ?? {}),
  removeHistoryEntry: (id) => ipcRenderer.invoke('history:remove', { id }),
  clearHistory: (params) => ipcRenderer.invoke('history:clear', params ?? {}),
  startStt: (payload) => ipcRenderer.invoke('stt:start', payload),
  sendAudio: (sessionId, pcm16kMonoInt16) =>
    ipcRenderer.send('stt:audio', { sessionId, pcm16kMonoInt16 }),
  stopStt: (sessionId) => ipcRenderer.invoke('stt:stop', { sessionId }),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  getRuntimeInfo: () => ipcRenderer.invoke('app:runtime-info'),
  getHealthCheck: () => ipcRenderer.invoke('app:health-check'),
  getPerfSummary: () => ipcRenderer.invoke('app:perf-summary'),
  getRecentLogs: (params) => ipcRenderer.invoke('app:logs:recent', params ?? {}),
  retryHoldHook: () => ipcRenderer.invoke('app:retry-hold-hook'),
  updateSettings: (partial) => ipcRenderer.invoke('settings:update', partial),
  setAutoPasteEnabled: (enabled) => ipcRenderer.invoke('settings:autoPaste', { enabled }),
  setToneMode: (mode) => ipcRenderer.invoke('settings:tone', { mode }),
  onHudState: (cb) => {
    const listener = (_event, payload) => cb(payload);
    ipcRenderer.on('hud:state', listener);
    return () => ipcRenderer.off('hud:state', listener);
  },
  onHudLevel: (cb) => {
    const listener = (_event, payload) => cb(payload);
    ipcRenderer.on('hud:level', listener);
    return () => ipcRenderer.off('hud:level', listener);
  },
  onHudHover: (cb) => {
    const listener = (_event, payload) => cb(payload);
    ipcRenderer.on('hud:hover', listener);
    return () => ipcRenderer.off('hud:hover', listener);
  },
  onCaptureStart: (cb) => {
    const listener = (_event, payload) => cb(payload);
    ipcRenderer.on('capture:start', listener);
    return () => ipcRenderer.off('capture:start', listener);
  },
  onCaptureStop: (cb) => {
    const listener = (_event, payload) => cb(payload);
    ipcRenderer.on('capture:stop', listener);
    return () => ipcRenderer.off('capture:stop', listener);
  },
  onSttPartial: (cb) => {
    const listener = (_event, event) => cb(event);
    ipcRenderer.on('stt:partial', listener);
    return () => ipcRenderer.off('stt:partial', listener);
  },
  onSttFinal: (cb) => {
    const listener = (_event, event) => cb(event);
    ipcRenderer.on('stt:final', listener);
    return () => ipcRenderer.off('stt:final', listener);
  },
  onSttError: (cb) => {
    const listener = (_event, event) => cb(event);
    ipcRenderer.on('stt:error', listener);
    return () => ipcRenderer.off('stt:error', listener);
  },
  onAppError: (cb) => {
    const listener = (_event, payload) => cb(payload);
    ipcRenderer.on('app:error', listener);
    return () => ipcRenderer.off('app:error', listener);
  },
};

contextBridge.exposeInMainWorld('voiceNoteAI', api);
