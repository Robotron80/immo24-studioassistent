// preload.js
const { contextBridge, ipcRenderer } = require('electron');
console.log('[preload] loaded');

contextBridge.exposeInMainWorld('electronAPI', {
  pickFolder: async (title, defaultPath) => {
    // Wir geben das Promise ERGEBNIS weiter:
    try {
      const res = await ipcRenderer.invoke('pick-folder', { title, defaultPath });
      // DEBUG console.log('[preload] pickFolder ->', res);
      return res; // <-- wichtig!
    } catch (e) {
      // DEBUG console.warn('[preload] pickFolder error', e);
      return null;
    }
  }
});