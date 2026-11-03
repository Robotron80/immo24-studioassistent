/**
 * Alle Fenster des Programms und ihr Zusammenspiel.
 *
 * Es gibt fünf Fenster:
 *   - Ladefenster (Splash):  beim Start, bis das Backend bereit ist
 *   - Einrichtung (Init):    beim allerersten Start, der Einrichtungsassistent
 *   - Anmeldung (Picker):    Auswahl des Mitarbeiters
 *   - Hauptfenster (Main):   die eigentliche Anwendung, erst nach der Anmeldung sichtbar
 *   - Konfiguration (Pref):  das passwortgeschützte Einstellungsmenü
 *
 * Die Variablen unten merken sich jeweils das offene Fenster. Geschlossene
 * Fenster werden auf null gesetzt, damit niemand mehr auf sie zugreift.
 */
import { app, BrowserWindow, dialog, shell, type WebPreferences } from 'electron'

import { backend } from './backend'
import { logLine, showOnceErrorBox } from './logger'
import { assetPath, devServerUrl, preloadPath, rendererIndexPath } from './paths'

let mainWindow: BrowserWindow | null = null
let prefWindow: BrowserWindow | null = null
let splashWindow: BrowserWindow | null = null
let pickerWindow: BrowserWindow | null = null
let initWindow: BrowserWindow | null = null
let initWindowClosedByApp = false

/** Gibt es dieses Fenster noch? Auf ein zerstörtes Fenster zuzugreifen wäre ein Fehler. */
function isOpen(win: BrowserWindow | null): win is BrowserWindow {
  return !!win && !win.isDestroyed()
}

/**
 * Sicherheitseinstellungen für jedes Fenster: Die Oberfläche darf nicht direkt auf
 * Dateien oder Node.js zugreifen, sondern nur über die Brücke aus preload.ts.
 */
function securePreferences(): WebPreferences {
  return {
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
    webSecurity: true,
    allowRunningInsecureContent: false,
    preload: preloadPath(),
  }
}

/** Überwacht ein Fenster: Stürzt es ab oder reagiert nicht mehr, wird das gemeldet. */
function attachCrashGuards(win: BrowserWindow, name: string): void {
  win.webContents.on('render-process-gone', (_event, details) => {
    logLine(`[${name}] render-process-gone`, details)
    showOnceErrorBox('Fenster abgestürzt', `${name} ist abgestürzt (${details.reason}). Starte neu…`)
    win.reload()
  })
  win.on('unresponsive', () => {
    logLine(`[${name}] unresponsive`)
    const choice = dialog.showMessageBoxSync(win, {
      type: 'warning',
      buttons: ['Warten', 'Neu laden'],
      defaultId: 0,
      cancelId: 0,
      message: `${name} reagiert nicht mehr.`,
      detail: 'Du kannst warten oder das Fenster neu laden.',
    })
    if (choice === 1) win.reload()
  })
  win.on('responsive', () => logLine(`[${name}] responsive (wieder OK)`))
}

/** Verhindert, dass ein Fenster zu einer anderen als der vorgesehenen Seite wechselt. */
function restrictNavigation(win: BrowserWindow, isAllowed: (url: URL) => boolean): void {
  win.webContents.on('will-navigate', (event, url) => {
    try {
      if (!isAllowed(new URL(url))) event.preventDefault()
    } catch {
      event.preventDefault()
    }
  })
}

/** Links öffnen sich im normalen Browser statt in einem neuen App-Fenster, und nur https. */
function openHttpsExternally(win: BrowserWindow): void {
  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      if (new URL(url).protocol === 'https:') void shell.openExternal(url)
    } catch {
      // ungültige URL ignorieren
    }
    return { action: 'deny' }
  })
}

/** Ist diese Adresse unsere gebaute Oberfläche? */
function isRendererUrl(url: URL): boolean {
  return url.protocol === 'file:' && url.pathname.endsWith('/dist/index.html')
}

// ────────────────────────────── Fenster ──────────────────────────────
/** Öffnet das Anmeldefenster. Ist es schon offen, wird das vorhandene zurückgegeben. */
export function createUserPickerWindow(): BrowserWindow {
  if (isOpen(pickerWindow)) return pickerWindow
  const win = new BrowserWindow({
    width: 420,
    height: 340,
    resizable: false,
    frame: false,
    show: false,
    webPreferences: securePreferences(),
  })
  pickerWindow = win
  attachCrashGuards(win, 'picker')
  restrictNavigation(win, (u) => isRendererUrl(u) || u.origin === devServerUrl())
  openHttpsExternally(win)
  win.once('ready-to-show', () => win.show())
  const devUrl = devServerUrl()
  if (devUrl) void win.loadURL(`${devUrl}/#/anmeldung`)
  else void win.loadFile(rendererIndexPath(), { hash: '/anmeldung' })
  win.on('closed', () => {
    pickerWindow = null
  })
  return win
}

/** Öffnet das Ladefenster für den Programmstart. */
export function createSplashWindow(): void {
  const win = new BrowserWindow({
    width: 420,
    height: 300,
    resizable: false,
    frame: false,
    alwaysOnTop: true,
    center: true,
    show: false,
    movable: false,
    webPreferences: securePreferences(),
  })
  splashWindow = win
  attachCrashGuards(win, 'splash')
  restrictNavigation(win, (u) => u.protocol === 'file:' && u.pathname.endsWith('/assets/loading.html'))
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.once('ready-to-show', () => win.show())
  void win.loadFile(assetPath('loading.html'))
  win.on('closed', () => {
    splashWindow = null
  })
}

/** Schließt das Ladefenster, sobald der Start abgeschlossen ist. */
export function closeSplashWindow(): void {
  if (isOpen(splashWindow)) splashWindow.close()
  splashWindow = null
}

/** Erstellt das Hauptfenster. Es bleibt unsichtbar, bis die Oberfläche geladen ist. */
function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 900,
    useContentSize: true,
    icon: assetPath('icon.png'),
    show: false,
    webPreferences: securePreferences(),
  })
  mainWindow = win
  attachCrashGuards(win, 'main')
  restrictNavigation(win, (u) => isRendererUrl(u) || u.origin === devServerUrl())
  openHttpsExternally(win)
  win.on('closed', () => {
    mainWindow = null
  })
  return win
}

/**
 * Nach der Anmeldung: Öffnet das Hauptfenster und schließt das Anmeldefenster.
 * Das Fenster entsteht erst jetzt, die Oberfläche lädt also genau einmal und kennt
 * von Anfang an den angemeldeten Nutzer.
 */
export async function showMainWindow(): Promise<void> {
  const win = createMainWindow()
  const devUrl = devServerUrl()
  if (devUrl) await win.loadURL(devUrl)
  else await win.loadFile(rendererIndexPath())
  win.show()
  win.focus()
  if (isOpen(pickerWindow)) pickerWindow.close()
  pickerWindow = null
}

/** Holt das aktuell wichtigste Fenster nach vorn, wenn die App ein zweites Mal gestartet wird. */
export function focusActiveWindow(): void {
  const win = [initWindow, prefWindow, pickerWindow, mainWindow].find((w) => isOpen(w) && w.isVisible())
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.focus()
}

/** Öffnet die Entwicklerkonsole des Hauptfensters (nur im Entwicklermodus erreichbar). */
export function openDevTools(): void {
  if (isOpen(mainWindow)) mainWindow.webContents.openDevTools({ mode: 'detach' })
}

/**
 * Der Ablauf beim Abmelden: zurück zur Anmeldung und das Hauptfenster schließen.
 * Bei der nächsten Anmeldung entsteht es neu, so bleibt nichts vom vorherigen Nutzer übrig.
 */
export async function openPickerFlow({ doLogout = true }: { doLogout?: boolean } = {}): Promise<{ ok: boolean }> {
  if (doLogout) backend().session.logout()
  const picker = createUserPickerWindow()
  picker.show()
  picker.focus()
  if (isOpen(prefWindow)) prefWindow.close()
  prefWindow = null
  if (isOpen(mainWindow)) mainWindow.close()
  return { ok: true }
}

/** Öffnet die Konfiguration. Während der Ersteinrichtung ist sie gesperrt. */
export function createPreferencesWindow(): void {
  if (isOpen(initWindow) && initWindow.isVisible()) {
    dialog.showMessageBoxSync({
      type: 'info',
      message: 'Die Konfiguration kann während der Ersteinrichtung nicht geöffnet werden.',
    })
    return
  }
  if (isOpen(prefWindow)) {
    prefWindow.focus()
    return
  }
  const parent = isOpen(mainWindow) && mainWindow.isVisible() ? mainWindow : undefined
  const win = new BrowserWindow({
    width: 900,
    height: 650,
    resizable: true,
    title: 'Konfiguration',
    parent,
    modal: !!parent,
    show: false,
    webPreferences: securePreferences(),
  })
  prefWindow = win
  win.setMenu(null)
  // Ohne Anmeldung ersetzt die Konfiguration das Anmeldefenster, beim Schließen kommt es wieder
  if (isOpen(pickerWindow)) pickerWindow.close()
  pickerWindow = null
  const devUrl = devServerUrl()
  if (devUrl) void win.loadURL(`${devUrl}/#/konfiguration`)
  else void win.loadFile(rendererIndexPath(), { hash: '/konfiguration' })
  win.once('ready-to-show', () => win.show())
  win.on('closed', async () => {
    prefWindow = null
    // Das Hauptfenster soll geänderte Kunden, Vorlagen und Module gleich anzeigen
    if (isOpen(mainWindow)) mainWindow.webContents.send('config-changed')
    if (!isOpen(mainWindow) || !mainWindow.isVisible()) {
      createUserPickerWindow()
    }
  })
}

/** Öffnet den Einrichtungsassistenten. Schließt ihn der Nutzer vorzeitig, endet das Programm. */
export function createInitWindow(): void {
  const win = new BrowserWindow({
    width: 900,
    height: 800,
    resizable: true,
    show: false,
    webPreferences: securePreferences(),
  })
  initWindow = win
  attachCrashGuards(win, 'init')
  restrictNavigation(win, (u) => isRendererUrl(u) || u.origin === devServerUrl())
  openHttpsExternally(win)
  win.once('ready-to-show', () => win.show())
  const devUrl = devServerUrl()
  if (devUrl) void win.loadURL(`${devUrl}/#/Setupwizard`)
  else void win.loadFile(rendererIndexPath(), { hash: '/Setupwizard' })
  win.on('closed', () => {
    if (!initWindowClosedByApp) app.quit()
    initWindow = null
    initWindowClosedByApp = false
  })
}

/** Nach erfolgreicher Einrichtung: Weiter zur Anmeldung und den Assistenten schließen. */
export function closeInitWindow(): boolean {
  if (!isOpen(initWindow)) return false
  createUserPickerWindow()
  initWindowClosedByApp = true
  initWindow.close()
  initWindow = null
  return true
}
