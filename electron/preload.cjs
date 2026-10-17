const { contextBridge, ipcRenderer } = require('electron');

try {
  contextBridge.exposeInMainWorld('electronAPI', {
    downloadYoutube: (url, options) => ipcRenderer.invoke('youtube:download', url, options),
    getDownloadProgress: (callback) => {
      const handler = (_event, progress) => callback(progress);
      ipcRenderer.on('youtube:progress', handler);
      return () => ipcRenderer.removeListener('youtube:progress', handler);
    },
    cancelDownload: () => ipcRenderer.invoke('youtube:cancel'),
    onBeforeClose: (callback) => {
      const handler = () => callback();
      ipcRenderer.on('app:before-close', handler);
      return () => ipcRenderer.removeListener('app:before-close', handler);
    },
    confirmClose: () => ipcRenderer.invoke('app:close'),
    secureStore: {
      get: (key) => ipcRenderer.invoke('secure:get', key),
      set: (key, value) => ipcRenderer.invoke('secure:set', key, value),
      clear: (key) => ipcRenderer.invoke('secure:clear', key),
    },
  });
} catch (err) {
  console.error('[preload] contextBridge.exposeInMainWorld FAILED:', err.message);
}
