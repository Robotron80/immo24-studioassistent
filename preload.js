/**
 * immo24 Studioassistent - Electron Preload Script
 * ------------------------------------------------
 * - Kontextbrücke für Renderer- und Picker-API
 * - IPC-Kommunikation zwischen Renderer und Main
 */

const { contextBridge, ipcRenderer } = require('electron')

/* ────────────── Helper: Event Listener mit Unsubscribe ─────────────── */
function on(channel, handler) {
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.off(channel, handler)
}

/* ───────────────────────── Renderer API ────────────────────────────── */
/**
 * API für die Haupt-App (UI)
 */
contextBridge.exposeInMainWorld('electronAPI', {
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // Ordnerauswahl (nativer Dialog)
  pickFolder: async (title, defaultPath) => {
    try {
      return await ipcRenderer.invoke('pick-folder', { title, defaultPath })
    } catch {
      return null
    }
  },

  // Aktiven User empfangen (nach Auswahl im Picker)
  onActiveUser: (cb) => {
    const handler = (_e, user) => cb?.(user)
    ipcRenderer.on('active-user', handler)
    return () => ipcRenderer.off('active-user', handler)
  },

  // Mitarbeiterliste neu laden und an Picker senden
  refreshUsers: () => ipcRenderer.invoke('refresh-users'),

  // Fenster verstecken + Picker öffnen (optional Logout)
  hideAndOpenPicker: (opts) =>
    ipcRenderer.invoke('renderer-hide-and-pick', opts || { doLogout: true }),

  // Initialisierungsfenster schließen
  closeInitWindow: () => ipcRenderer.invoke('close-init-window'),
})

/* ───────────────────────── Picker API ──────────────────────────────── */
/**
 * API für das Picker-Fenster (assets/login.html)
 */
contextBridge.exposeInMainWorld('picker', {
  // Userliste vom Main erhalten
  onUsers: (cb) => {
    const handler = (_e, list) => { try { cb(list) } catch {} }
    return on('users', handler)
  },

  // Auswahl bestätigen (User auswählen)
  choose: (user) => ipcRenderer.send('user-picked', user),

  // App sofort beenden (Beenden-Button)
  quit: () => ipcRenderer.send('app-quit'),
})