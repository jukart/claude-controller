const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getProjects: () => ipcRenderer.invoke('get-projects'),
  addProject: () => ipcRenderer.invoke('add-project'),
  removeProject: (path) => ipcRenderer.invoke('remove-project', path),
  startSession: (path) => ipcRenderer.invoke('start-session', path),
  sessionWrite: (path, data) => ipcRenderer.invoke('session-write', path, data),
  sessionResize: (path, cols, rows) => ipcRenderer.invoke('session-resize', path, cols, rows),
  sessionActive: (path) => ipcRenderer.invoke('session-active', path),
  stopSession: (path) => ipcRenderer.invoke('stop-session', path),
  onSessionData: (callback) => ipcRenderer.on('session-data', (_, path, data) => callback(path, data)),
  onSessionExit: (callback) => ipcRenderer.on('session-exit', (_, path, code) => callback(path, code)),
});
