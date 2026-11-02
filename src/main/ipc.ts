/**
 * IPC: die Gesprächsleitung zwischen Oberfläche und Hauptprozess.
 *
 * IPC heißt "Inter-Process Communication". Die Oberfläche läuft aus Sicherheitsgründen
 * in einem eigenen Prozess und darf z. B. keinen Dateidialog öffnen. Sie schickt dafür
 * eine benannte Nachricht (siehe preload.ts), und hier steht, was dann passiert.
 *   ipcMain.on:     Nachricht ohne Antwort
 *   ipcMain.handle: Anfrage, auf die die Oberfläche eine Antwort bekommt
 */
import { app, BrowserWindow, dialog, ipcMain } from 'electron'

import { getUsers, postActiveUser } from './nodeRed'
import { closeInitWindow, openPickerFlow, refreshPickerUsers, showMainWindowForUser } from './windows'

/** Meldet alle Nachrichten an. Wird einmal beim Programmstart aufgerufen. */
export function registerIpc(): void {
  ipcMain.on('user-picked', async (_event, user: string) => {
    await postActiveUser(user)
    showMainWindowForUser(user)
  })

  ipcMain.on('app-quit', () => app.quit())

  ipcMain.handle('renderer-hide-and-pick', async (_event, args?: { doLogout?: boolean }) => {
    try {
      return await openPickerFlow(args ?? { doLogout: true })
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  ipcMain.handle('close-init-window', () => closeInitWindow())

  ipcMain.handle('refresh-users', async () => {
    const users = await getUsers()
    refreshPickerUsers(users)
    return users
  })

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
}
