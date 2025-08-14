// preload.js
const { contextBridge, ipcRenderer } = require('electron')

// Kleiner Helfer: registriert einen Listener und gibt eine unsubscribe-Funktion zurück
function on(channel, handler) {
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.off(channel, handler)
}

// 1) Renderer-API
contextBridge.exposeInMainWorld('electronAPI', {
  // Ordnerauswahl (invoke → Promise)
  pickFolder: async (title, defaultPath) => {
    try {
      return await ipcRenderer.invoke('pick-folder', { title, defaultPath })
    } catch {
      return null
    }
  },

  // Re-Login (Main blendet Hauptfenster aus, öffnet Picker)
  relogin: () => ipcRenderer.send('request-relogin'),

  // Aktiven User vom Main erhalten (nach erfolgreicher Picker-Auswahl)
  onActiveUser: (cb) => {
    const handler = (_e, user) => { try { cb(user) } catch {} }
    return on('active-user', handler)
  }
})

// 2) Picker-Bridge (für assets/login.html)
contextBridge.exposeInMainWorld('picker', {
  onUsers: (cb) => {
    const handler = (_e, list) => { try { cb(list) } catch {} }
    return on('users', handler)
  },
  choose: (user) => ipcRenderer.send('user-picked', user),
  cancel: () => ipcRenderer.send('user-cancel')
})