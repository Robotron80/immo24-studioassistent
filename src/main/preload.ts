/**
 * immo24 Studioassistent - Electron Preload Script
 * Kontextbrücke für Haupt-UI und Picker-Fenster
 */
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

function on<T>(channel: string, callback: (value: T) => void): () => void {
  const handler = (_event: IpcRendererEvent, value: T) => callback(value)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.off(channel, handler)
}

contextBridge.exposeInMainWorld('electronAPI', {
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // Ordnerauswahl (nativer Dialog)
  pickFolder: async (title?: string, defaultPath?: string) => {
    try {
      return await ipcRenderer.invoke('pick-folder', { title, defaultPath })
    } catch {
      return null
    }
  },

  // Aktiven User empfangen (nach Auswahl im Picker)
  onActiveUser: (callback?: (user: string) => void) => on<string>('active-user', (user) => callback?.(user)),

  // Mitarbeiterliste neu laden und an Picker senden
  refreshUsers: () => ipcRenderer.invoke('refresh-users'),

  // Fenster verstecken + Picker öffnen (optional Logout)
  hideAndOpenPicker: (options?: { doLogout?: boolean }) =>
    ipcRenderer.invoke('renderer-hide-and-pick', options ?? { doLogout: true }),

  closeInitWindow: () => ipcRenderer.invoke('close-init-window'),
})

contextBridge.exposeInMainWorld('picker', {
  onUsers: (callback: (users: string[]) => void) => on<string[]>('users', callback),
  choose: (user: string) => ipcRenderer.send('user-picked', user),
  quit: () => ipcRenderer.send('app-quit'),
})
