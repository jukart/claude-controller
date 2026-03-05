const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getProjects: () => ipcRenderer.invoke('get-projects'),
  addProject: () => ipcRenderer.invoke('add-project'),
  removeProject: (path) => ipcRenderer.invoke('remove-project', path),
  startSession: (sessionId, path, launchClaude) => ipcRenderer.invoke('start-session', sessionId, path, launchClaude),
  sessionWrite: (sessionId, data) => ipcRenderer.invoke('session-write', sessionId, data),
  sessionResize: (sessionId, cols, rows) => ipcRenderer.invoke('session-resize', sessionId, cols, rows),
  sessionActive: (sessionId) => ipcRenderer.invoke('session-active', sessionId),
  stopSession: (sessionId) => ipcRenderer.invoke('stop-session', sessionId),
  getUsage: () => ipcRenderer.invoke('get-usage'),
  onSessionData: (callback) => ipcRenderer.on('session-data', (_, sessionId, data) => callback(sessionId, data)),
  onSessionExit: (callback) => ipcRenderer.on('session-exit', (_, sessionId, code) => callback(sessionId, code)),
});
