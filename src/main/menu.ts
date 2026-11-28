/**
 * Die Menüleiste des Programms.
 * Auf dem Mac gibt es zusätzlich das übliche App-Menü, unter Windows heißt es "Datei".
 */
import { app, Menu, type MenuItemConstructorOptions } from 'electron'

import { createPreferencesWindow, logout as logoutUser, openDevTools } from './windows'

/** Baut das Menü und setzt es. Wird einmal beim Programmstart aufgerufen. */
export function installApplicationMenu(): void {
  const isMac = process.platform === 'darwin'
  const preferences: MenuItemConstructorOptions = {
    label: 'Konfiguration',
    accelerator: 'CommandOrControl+,',
    click: () => createPreferencesWindow(),
  }

  const logout: MenuItemConstructorOptions = {
    id: 'logout',
    label: 'Abmelden',
    // Nur solange das Hauptfenster offen ist, siehe windows.ts
    enabled: false,
    click: () => logoutUser(),
  }

  const template: MenuItemConstructorOptions[] = [
    isMac
      ? {
          label: app.name,
          submenu: [
            { role: 'about' },
            { type: 'separator' },
            preferences,
            logout,
            { type: 'separator' },
            { role: 'hide' },
            { role: 'hideOthers' },
            { role: 'unhide' },
            { type: 'separator' },
            { role: 'quit' },
          ],
        }
      : {
          label: 'Datei',
          submenu: [preferences, logout, { type: 'separator' }, { role: 'quit' }],
        },
    {
      label: 'Bearbeiten',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        ...(isMac
          ? ([
              { role: 'pasteAndMatchStyle' },
              { role: 'delete' },
              { role: 'selectAll' },
              { type: 'separator' },
              { label: 'Sprachausgabe', submenu: [{ role: 'startSpeaking' }, { role: 'stopSpeaking' }] },
            ] satisfies MenuItemConstructorOptions[])
          : ([
              { role: 'delete' },
              { type: 'separator' },
              { role: 'selectAll' },
            ] satisfies MenuItemConstructorOptions[])),
      ],
    },
  ]

  // Die Entwicklerkonsole nur beim Entwickeln oder mit dem Startparameter --immo24-debug
  if (!app.isPackaged || process.argv.includes('--immo24-debug')) {
    template.push({
      label: 'Entwickler',
      submenu: [
        {
          label: 'Konsole öffnen',
          accelerator: 'CmdOrCtrl+Shift+I',
          click: () => openDevTools(),
        },
      ],
    })
  }

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
