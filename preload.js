const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('neon', {
  getWindowBounds: () => ipcRenderer.invoke('get-window-bounds'),
  getResizeConstraints: () => ipcRenderer.invoke('get-resize-constraints'),
  resizeWindow: (bounds) => ipcRenderer.send('resize-window', bounds),
  moveWindow: (pos) => ipcRenderer.send('move-window', pos),
  showContextMenu: () => ipcRenderer.send('show-context-menu'),
  quitApp: () => ipcRenderer.send('quit-app'),

  getSettings: () => ipcRenderer.invoke('get-settings'),
  onSettingsChanged: (callback) => {
    ipcRenderer.on('settings-changed', (_event, settings) => callback(settings));
  },

  getProgress: () => ipcRenderer.invoke('get-progress'),
  completeWorkSession: (payload) => ipcRenderer.invoke('complete-work-session', payload),

  openSessionEndPopup: (longBreak) => ipcRenderer.send('open-session-end-popup', { longBreak: !!longBreak }),
  onSessionEndChoice: (callback) => {
    ipcRenderer.on('session-end-choice', (_event, result) => callback(result));
  },

  onOverlayState: (callback) => {
    ipcRenderer.on('overlay-state', (_event, open) => callback(open));
  },
});
