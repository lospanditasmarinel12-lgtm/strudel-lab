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
  });
} catch (err) {
  console.error('[preload] contextBridge.exposeInMainWorld FAILED:', err.message);
}
