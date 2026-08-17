const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  closeWindow: () => ipcRenderer.send('window-close'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  getAppConfig: () => ipcRenderer.invoke('get-app-config'),
  saveAppConfig: (config) => ipcRenderer.invoke('save-app-config', config),
  getWindowState: () => ipcRenderer.invoke('get-window-state'),
  onMaximizeChange: (callback) => {
    ipcRenderer.on('maximize-change', (_event, isMaximized) => callback(isMaximized));
  },
  onFindCommand: (callback) => {
    ipcRenderer.on('find-command', (_event, command) => callback(command));
  },
});
