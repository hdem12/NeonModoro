const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('neonPopup', {
  getSettings: () => ipcRenderer.invoke('get-settings'),
  updateSettings: (partial) => ipcRenderer.send('update-settings', partial),
  resetSettings: () => ipcRenderer.send('reset-settings'),

  getHistory: () => ipcRenderer.invoke('get-history'),

  sessionEndChoice: (choice) => ipcRenderer.send('session-end-choice', choice),
  closePopup: () => ipcRenderer.send('close-popup'),
  openExternal: (url) => ipcRenderer.send('open-external', url),
});
