/**
 * immo24 Studioassistent: der Hauptprozess und Startpunkt des Programms.
 *
 * Eine Electron-App besteht aus zwei Teilen:
 *   - dem Hauptprozess (dieser Ordner): darf alles, verwaltet Fenster und Dateien
 *   - der Oberfläche (src/renderer): läuft abgeschirmt in den Fenstern
 *
 * Die Fachlogik liegt in src/core. Diese Datei steuert den Ablauf beim Start,
 * siehe die Funktion startup().
 */
import fs from 'node:fs'
import path from 'node:path'

import { app, session } from 'electron'

import { backend } from './backend'
import { registerIpc } from './ipc'
import { installGlobalErrorHandlers, logLine, rotateLog, showOnceErrorBox } from './logger'
import { installApplicationMenu } from './menu'
import { assetPath, configureUserData, devServerUrl } from './paths'
import {
  closeSplashWindow,
  createInitWindow,
  createMainWindow,
  createSplashWindow,
  createUserPickerWindow,
  focusActiveWindow,
  listUserNames,
  loadMainWindow,
  sendUsersToPicker,
} from './windows'

configureUserData()
installGlobalErrorHandlers()

// Nur eine Instanz erlauben: Wird die App erneut gestartet, beendet sich die neue
// Instanz sofort, und die bereits laufende holt ihr Fenster nach vorn.
if (!app.requestSingleInstanceLock()) {
  app.exit(0)
}
app.on('second-instance', () => focusActiveWindow())

/** Legt beim ersten Start die Einstellungsdateien an, falls sie noch fehlen. */
function ensureUserJsonFiles(): void {
  const basePath = app.getPath('userData')
  fs.mkdirSync(basePath, { recursive: true })
  for (const file of ['path.json', 'adminpw.json', 'config.json']) {
    const dest = path.join(basePath, file)
    if (fs.existsSync(dest)) continue
    const src = assetPath(file)
    if (fs.existsSync(src)) fs.writeFileSync(dest, fs.readFileSync(src))
    else fs.writeFileSync(dest, '{}')
  }
}

/** Das Programm arbeitet nur lokal: Web-Zugriffe werden blockiert, außer zum Entwicklungsserver. */
function installNetworkGuard(): void {
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details, callback) => {
    try {
      const devUrl = devServerUrl()
      callback({ cancel: !devUrl || new URL(details.url).host !== new URL(devUrl).host })
    } catch {
      callback({ cancel: true })
    }
  })
}

/**
 * Der Programmstart, Schritt für Schritt:
 *   1. Grundlagen: Netzwerksperre, Einstellungsdateien, IPC und Menü
 *   2. Einrichtung prüfen. Das liest vom Speicher: Dauert es länger, erscheint das Ladefenster.
 *   3. Oberfläche laden und je nach Zustand Einrichtung oder Anmeldung zeigen
 */
async function startup(): Promise<void> {
  const startedAt = Date.now()
  rotateLog()
  logLine('[startup] begin', `v${app.getVersion()}`)
  installNetworkGuard()
  ensureUserJsonFiles()
  registerIpc()
  installApplicationMenu()

  const splashTimer = setTimeout(createSplashWindow, 250)
  createMainWindow()
  const status = await backend().config.getInitializeStatus()
  await loadMainWindow()
  clearTimeout(splashTimer)
  closeSplashWindow()
  logLine('[startup] fertig nach', `${Date.now() - startedAt} ms`)

  if (status.initialize.needsUserAction) {
    createInitWindow()
    return
  }
  sendUsersToPicker(createUserPickerWindow(), await listUserNames())
}

app.whenReady().then(async () => {
  try {
    await startup()
  } catch (err) {
    const error = err as Error
    logLine('[startup] error', error?.stack || String(err))
    showOnceErrorBox('Startfehler', String(error?.message || err))
    app.quit()
  }
})
