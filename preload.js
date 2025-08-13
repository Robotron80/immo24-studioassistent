// preload.js
const { contextBridge, ipcRenderer } = require('electron')

console.log('[preload] loaded')

// 1) Bestehende API beibehalten
contextBridge.exposeInMainWorld('electronAPI', {
  pickFolder: async (title, defaultPath) => {
    try {
      const res = await ipcRenderer.invoke('pick-folder', { title, defaultPath })
      return res
    } catch (e) {
      return null
    }
  },
  onActiveUser: (cb) => {
      const handler = (_e, user) => { try { cb(user) } catch {} }
      ipcRenderer.on('active-user', handler)
      return () => ipcRenderer.off('active-user', handler)
  }
})

// 2) Neue Picker-Bridge für das Mitarbeiter-Fenster
//    -> passt zu den IPC-Channels aus dem Main-Prozess:
//       'users' (Liste), 'user-picked' (Auswahl), 'user-cancel' (Abbruch)
contextBridge.exposeInMainWorld('picker', {
  // Liste empfangen; gibt eine unsubscribe-Funktion zurück
  onUsers: (cb) => {
    const handler = (_evt, list) => {
      try { cb(list) } catch {}
    }
    ipcRenderer.on('users', handler)
    return () => ipcRenderer.off('users', handler)
  },

  // Auswahl an den Main-Prozess senden
  choose: (user) => {
    ipcRenderer.send('user-picked', user)
  },

  // Abbrechen
  cancel: () => {
    ipcRenderer.send('user-cancel')
  }
})
