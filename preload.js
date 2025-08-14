const { contextBridge, ipcRenderer } = require('electron')

// Helper: Listener registrieren und unsubscribe zurückgeben
function on(channel, handler) {
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.off(channel, handler)
}

/**
 * Renderer API (für deine App UI)
 */
contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * Ordnerauswahl (öffnet nativen Dialog)
   * @param {string} [title]
   * @param {string} [defaultPath]
   * @returns {Promise<string|null>}
   */
  pickFolder: async (title, defaultPath) => {
    try {
      return await ipcRenderer.invoke('pick-folder', { title, defaultPath })
    } catch {
      return null
    }
  },

  /**
   * Aktiven User vom Main empfangen (nach Auswahl im Picker)
   * @param {(user: string|null)=>void} cb
   * @returns {() => void} unsubscribe
   */
  onActiveUser: (cb) => {
    const handler = (_e, user) => { try { cb(user) } catch {} }
    return on('active-user', handler)
  },

  /**
   * Fenster verstecken + (optional) Logout + Picker öffnen
   * @param {{doLogout?: boolean}} [opts]
   * @returns {Promise<{ok: boolean, error?: string}>}
   */
  hideAndOpenPicker: (opts) =>
    ipcRenderer.invoke('renderer-hide-and-pick', opts || { doLogout: true }),
})

/**
 * Picker-Bridge (für assets/login.html)
 */
contextBridge.exposeInMainWorld('picker', {
  /**
   * Userliste vom Main erhalten
   * @param {(list: string[])=>void} cb
   * @returns {() => void} unsubscribe
   */
  onUsers: (cb) => {
    const handler = (_e, list) => { try { cb(list) } catch {} }
    return on('users', handler)
  },

  /**
   * Auswahl bestätigen
   * @param {string} user
   */
  choose: (user) => ipcRenderer.send('user-picked', user),

  /**
   * App sofort beenden (Beenden-Button)
   */
  quit: () => ipcRenderer.send('app-quit'),
})