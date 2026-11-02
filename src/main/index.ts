/**
 * immo24 Studioassistent: der Hauptprozess und Startpunkt des Programms.
 *
 * Eine Electron-App besteht aus zwei Teilen:
 *   - dem Hauptprozess (dieser Ordner): darf alles, verwaltet Fenster und Dateien
 *   - der Oberfläche (src/renderer): läuft abgeschirmt in den Fenstern
 *
 * Diese Datei steuert den Ablauf beim Start, siehe die Funktion startup().
 */
import fs from 'node:fs'
import path from 'node:path'

import { app, session } from 'electron'

import { registerIpc } from './ipc'
import { installGlobalErrorHandlers, logLine, showOnceErrorBox } from './logger'
import { installApplicationMenu } from './menu'
import {
  DEV_BACKEND,
  fetchInitializeStatus,
  fetchReadyStatus,
  getUsers,
  NODE_RED_HOST,
  NODE_RED_PORT,
  startNodeRed,
  stopNodeRed,
  type InitializeStatus,
} from './nodeRed'
import { assetPath, configureUserData, devServerUrl } from './paths'
import {
  closeSplashWindow,
  createInitWindow,
  createMainWindow,
  createSplashWindow,
  createUserPickerWindow,
  focusActiveWindow,
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
    if (fs.existsSync(src)) fs.copyFileSync(src, dest)
    else fs.writeFileSync(dest, '{}')
  }
}

/** Die App kommuniziert nur lokal: Alles außer dem Backend und dem Dev-Server wird blockiert. */
function installNetworkGuard(): void {
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details, callback) => {
    try {
      const url = new URL(details.url)
      const devUrl = devServerUrl()
      const isDevServer = !!devUrl && url.host === new URL(devUrl).host
      const isBackend =
        url.protocol === 'http:' &&
        (url.hostname === NODE_RED_HOST || url.hostname === 'localhost' || url.hostname === '[::1]') &&
        url.port === String(NODE_RED_PORT)
      callback({ cancel: !(isDevServer || isBackend) })
    } catch {
      callback({ cancel: true })
    }
  })
}

/** Fragt wiederholt nach einem Status, bis er passt oder die Zeit abgelaufen ist. */
async function pollUntil<T>(fetchStatus: () => Promise<T>, isDone: (status: T) => boolean, timeoutMs: number): Promise<T> {
  const start = Date.now()
  let status = await fetchStatus()
  while (!isDone(status) && Date.now() - start < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 400))
    status = await fetchStatus()
  }
  return status
}

/**
 * Der Programmstart, Schritt für Schritt:
 *   1. Grundlagen: Netzwerksperre, Einstellungsdateien, IPC und Menü
 *   2. Backend starten, dauert das länger, erscheint das Ladefenster
 *   3. Warten, bis das Backend bereit ist
 *   4. Oberfläche laden und je nach Zustand Einrichtung oder Anmeldung zeigen
 */
async function startup(): Promise<void> {
  logLine('[startup] begin', `v${app.getVersion()}`, DEV_BACKEND ? 'DEV_BACKEND' : 'PROD_READONLY')
  installNetworkGuard()
  ensureUserJsonFiles()
  registerIpc()
  installApplicationMenu()

  const splashTimer = setTimeout(createSplashWindow, 250)
  await startNodeRed()
  createMainWindow()

  const ready = await pollUntil(fetchReadyStatus, (status) => status.ok, 6000)
  logLine('[startup] runtime ready:', String(ready.ok))
  const init: InitializeStatus = await pollUntil(fetchInitializeStatus, (status) => status.ready === true, 12000)
  logLine('[startup] backend ready:', String(init.ready === true))

  clearTimeout(splashTimer)
  closeSplashWindow()

  if (!ready.ok || init.ready !== true) {
    logLine('Node-RED nicht bereit nach Timeout.')
    app.quit()
    return
  }

  await loadMainWindow()

  if (init.initialize?.needsUserAction) {
    createInitWindow()
    return
  }
  const users = Array.isArray(init.user) ? init.user.map((u) => u.name) : await getUsers()
  sendUsersToPicker(createUserPickerWindow(), users)
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

app.on('before-quit', async () => {
  logLine('[shutdown] begin')
  try {
    await stopNodeRed()
  } catch (err) {
    logLine('[shutdown] error', (err as Error)?.stack || String(err))
  } finally {
    logLine('[shutdown] end')
  }
})
