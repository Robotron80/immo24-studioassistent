/**
 * IPC: die Gesprächsleitung zwischen Oberfläche und Hauptprozess.
 *
 * IPC heißt "Inter-Process Communication". Die Oberfläche läuft aus Sicherheitsgründen
 * in einem eigenen Prozess und darf z. B. keinen Dateidialog öffnen. Sie schickt dafür
 * eine benannte Nachricht (siehe preload.ts), und hier steht, was dann passiert.
 *   ipcMain.on:     Nachricht ohne Antwort
 *   ipcMain.handle: Anfrage, auf die die Oberfläche eine Antwort bekommt
 *
 * Hier stehen nur Dinge rund um Fenster und Betriebssystem. Die Fachlogik läuft
 * über backend.ts.
 */
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'

import { backend, registerBackendIpc } from './backend'
import { closeInitWindow, logout, showMainWindow } from './windows'

/** Meldet alle Nachrichten an. Wird einmal beim Programmstart aufgerufen. */
export function registerIpc(): void {
  registerBackendIpc()

  ipcMain.on('user-picked', async (_event, user: string) => {
    await backend().session.login(user)
    // Fehlende Ablageordner ergänzen. Klappt das nicht (Share weg), geht die Anmeldung trotzdem weiter.
    await backend().users.addMissingFolders(user).catch(() => {})
    await showMainWindow()
  })

  ipcMain.on('app-quit', () => app.quit())

  ipcMain.handle('logout', () => logout())

  ipcMain.handle('close-init-window', () => closeInitWindow())

  ipcMain.handle('get-app-version', () => app.getVersion())

  ipcMain.handle('pick-folder', async (event, args?: { title?: string; defaultPath?: string }) => {
    const options: Electron.OpenDialogOptions = {
      title: args?.title || 'Ordner auswählen',
      defaultPath: args?.defaultPath || undefined,
      properties: ['openDirectory', 'createDirectory'],
      buttonLabel: 'Auswählen',
    }
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })

  // Öffnet eine Session im zugehörigen Programm. Nur .ptx-Dateien, damit die Oberfläche
  // hierüber keine beliebigen Programme starten kann. Gibt einen Fehlertext zurück, sonst ''.
  ipcMain.handle('open-session', async (_event, file: unknown) => {
    if (typeof file !== 'string' || !/\.ptx$/i.test(file)) return 'Keine Pro Tools Session.'
    return shell.openPath(file)
  })
}
