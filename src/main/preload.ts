/**
 * Preload: die kontrollierte Brücke zwischen Oberfläche und Hauptprozess.
 *
 * Dieses Skript läuft in jedem Fenster, bevor die Oberfläche lädt. Es stellt genau
 * die Funktionen bereit, die die Oberfläche benutzen darf, und nichts darüber hinaus.
 * Sie ruft zum Beispiel window.electronAPI.pickFolder() auf, die Nachricht landet
 * dann in ipc.ts im Hauptprozess.
 */
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

/** Hört auf eine Nachricht des Hauptprozesses. Gibt eine Funktion zum Abmelden zurück. */
function on<T>(channel: string, callback: (value: T) => void): () => void {
  const handler = (_event: IpcRendererEvent, value: T) => callback(value)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.off(channel, handler)
}

// Funktionen für die Hauptoberfläche und den Einrichtungsassistenten
contextBridge.exposeInMainWorld('electronAPI', {
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // Aufrufe ins Backend (siehe src/renderer/lib/backend.js und src/main/backend.ts)
  backend: (method: string, arg?: unknown) => ipcRenderer.invoke('backend', method, arg),

  // Session im zugehörigen Programm öffnen
  openSession: (file: string) => ipcRenderer.invoke('open-session', file),

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

// Funktionen für das Anmeldefenster (assets/login.html)
contextBridge.exposeInMainWorld('picker', {
  onUsers: (callback: (users: string[]) => void) => on<string[]>('users', callback),
  choose: (user: string) => ipcRenderer.send('user-picked', user),
  quit: () => ipcRenderer.send('app-quit'),
})
