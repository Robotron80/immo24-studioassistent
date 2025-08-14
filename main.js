const { app, BrowserWindow, Menu, ipcMain, dialog } = require('electron')
const path = require('path')
const { spawn } = require('child_process')
const http = require('http')
const fs = require('fs')

// ————— Globals
let nodeRedProcess
let mainWindow
let prefWin = null
let splashWindow
let pickerWin = null

// Reuse eine TCP-Verbindung (spart ms pro Request)
const keepAliveAgent = new http.Agent({ keepAlive: true })

// === 1) Setup: User-Dateien bereitstellen (synchron, aber winzig)
function ensureUserJsonFiles() {
  const basePath = app.getPath('userData')
  const srcDir = path.join(__dirname, 'assets')
  const files = ['path.json', 'adminpw.json']
  for (const file of files) {
    const dest = path.join(basePath, file)
    if (!fs.existsSync(dest)) {
      const src = path.join(srcDir, file)
      if (fs.existsSync(src)) fs.copyFileSync(src, dest)
      else fs.writeFileSync(dest, '{}')
    }
  }
}

// === 2) Node‑RED Helpers (mit Keep‑Alive & robusten Defaults)
function getUsersFromNodeRed() {
  return new Promise((resolve) => {
    const req = http.request(
      { host: '127.0.0.1', port: 1880, path: '/api/user', method: 'GET', agent: keepAliveAgent },
      (res) => {
        let data = ''
        res.on('data', (c) => (data += c))
        res.on('end', () => {
          try { const json = JSON.parse(data); resolve(Array.isArray(json) ? json : []) }
          catch { resolve([]) }
        })
      }
    )
    req.on('error', () => resolve([]))
    req.end()
  })
}

function postActiveUserToNodeRed(user) {
  return new Promise((resolve) => {
    const payload = Buffer.from(JSON.stringify({ user }))
    const req = http.request(
      {
        host: '127.0.0.1',
        port: 1880,
        path: '/api/user',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': payload.length },
        agent: keepAliveAgent
      },
      (res) => resolve(res.statusCode >= 200 && res.statusCode < 300)
    )
    req.on('error', () => resolve(false))
    req.write(payload)
    req.end()
  })
}

function postLogoutToNodeRed() {
  return new Promise((resolve) => {
    const req = http.request(
      { host: '127.0.0.1', port: 1880, path: '/api/logout', method: 'POST', agent: keepAliveAgent },
      (res) => resolve(res.statusCode >= 200 && res.statusCode < 300)
    )
    req.on('error', () => resolve(false))
    req.end()
  })
}

// Schneller, fairer Ready‑Check: sofortiger Versuch + exponentielles Backoff
async function waitForNodeRedReady({
  host = '127.0.0.1',
  port = 1880,
  path_ = '/api/user',
  timeoutMs = 12000,         // etwas straffer
  minDelay = 120,
  maxDelay = 600
} = {}) {
  const start = Date.now()
  let delay = minDelay

  const tryOnce = () =>
    new Promise((resolve) => {
      const req = http.request({ host, port, path: path_, method: 'HEAD', agent: keepAliveAgent }, (res) => {
        resolve(res.statusCode >= 200 && res.statusCode < 400)
      })
      req.on('error', () => resolve(false))
      req.end()
    })

  // Erster Versuch sofort:
  if (await tryOnce()) return true

  while (Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, delay))
    if (await tryOnce()) return true
    delay = Math.min(Math.floor(delay * 1.6), maxDelay)
  }
  return false
}

// === 3) Windows
function createUserPickerWindow() {
  if (pickerWin && !pickerWin.isDestroyed()) return pickerWin
  pickerWin = new BrowserWindow({
    width: 420, height: 300, resizable: false, frame: false, show: true, alwaysOnTop: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  })
  pickerWin.loadFile(path.join(__dirname, 'assets', 'login.html'))
  return pickerWin
}

function createSplashWindow() {
  // Tipp: Lade Splash nur, wenn das Warten > 250ms dauern wird – vermeidet „Blinken“:
  splashWindow = new BrowserWindow({
    width: 420, height: 300, resizable: false, frame: false, transparent: false,
    alwaysOnTop: true, center: true, show: true, movable: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true }
  })
  splashWindow.loadFile(path.join(__dirname, 'assets', 'loading.html'))
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200, height: 900, useContentSize: true,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    show: false, // erst nach Auswahl zeigen
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true,
      preload: path.join(__dirname, 'preload.js'),
    }
  })
  // Wichtig: KEIN loadURL/loadFile hier – das passiert erst nach Ready‑Ping
}

// === 4) IPC
ipcMain.on('user-picked', async (_evt, user) => {
  await postActiveUserToNodeRed(user)
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('active-user', user)
  if (pickerWin && !pickerWin.isDestroyed()) { pickerWin.close(); pickerWin = null }
  if (splashWindow && !splashWindow.isDestroyed()) { splashWindow.close(); splashWindow = null }
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.show()
})

ipcMain.on('user-cancel', () => {
  if (pickerWin && !pickerWin.isDestroyed()) { pickerWin.close(); pickerWin = null }
  if (splashWindow && !splashWindow.isDestroyed()) { splashWindow.close(); splashWindow = null }
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.show() // alternativ: app.quit()
})

ipcMain.on('request-relogin', async () => {
  await postLogoutToNodeRed()
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide()
  const users = await getUsersFromNodeRed() // vorab laden → fühlt sich schneller an
  const pw = createUserPickerWindow()
  pw.webContents.once('did-finish-load', () => pw.webContents.send('users', users))
})

// === 5) Node‑RED starten (Früh, aber nicht blockierend)
function startNodeRED() {
  const nodeRedDir = path.join(__dirname, 'node-red-portable')
  const redJs = path.join(nodeRedDir, 'node_modules', 'node-red', 'red.js')
  let nodeBinary
  if (process.platform === 'win32') nodeBinary = path.join(__dirname, 'bin', 'node.exe')
  else if (process.platform === 'darwin') nodeBinary = path.join(__dirname, 'bin', process.arch === 'arm64' ? 'node-arm64' : 'node-x64')
  else nodeBinary = path.join(__dirname, 'bin', 'node')

  if (!fs.existsSync(nodeBinary) || !fs.existsSync(redJs)) { app.quit(); return }

  const basePath = app.getPath('userData')
  fs.writeFileSync(path.join(basePath, 'AppBasePath.json'), JSON.stringify({ AppBasePath: basePath }, null, 2))

  nodeRedProcess = spawn(nodeBinary, [redJs, '-u', nodeRedDir, '--port', '1880'], {
    cwd: nodeRedDir,
    stdio: ['ignore', 'pipe', 'pipe'], // weniger IO als 'inherit'
    env: { ...process.env, IMMO24_USERDATA: basePath, APP_VERSION: app.getVersion() }
  })

  // Logs drosseln (nur erste Zeilen + Fehler zeigen), um Console-Spam zu vermeiden
  let firstOut = true
  nodeRedProcess.stdout.on('data', (d) => {
    if (firstOut) { console.log(`[Node-RED] ${String(d)}`.trim()); firstOut = false }
  })
  nodeRedProcess.stderr.on('data', (d) => console.error(`[Node-RED ERROR] ${String(d)}`.trim()))
  nodeRedProcess.on('error', (err) => console.error('[Node-RED SPAWN ERROR]', err))
  nodeRedProcess.on('exit', (code, signal) => console.log(`[Node-RED EXIT] code: ${code}, signal: ${signal}`))
}

// === 6) Sonstige IPC (Preferences)
function registerIpc() {
  ipcMain.removeHandler('pick-folder')
  ipcMain.handle('pick-folder', async (evt, args = {}) => {
    const { title, defaultPath } = args || {}
    const win = BrowserWindow.fromWebContents(evt.sender)
    const result = await dialog.showOpenDialog(win || undefined, {
      title: title || 'Ordner auswählen',
      defaultPath: defaultPath || undefined,
      properties: ['openDirectory', 'createDirectory'],
      buttonLabel: 'Auswählen',
    })
    return (!result.canceled && Array.isArray(result.filePaths) && result.filePaths[0]) ? result.filePaths[0] : null
  })
}

function createPreferencesWindow() {
  if (prefWin && !prefWin.isDestroyed()) { prefWin.focus(); return }

  const parent =
    (pickerWin && !pickerWin.isDestroyed() && pickerWin.isVisible()) ? pickerWin :
    (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) ? mainWindow :
    null

  const opts = {
    width: 900, height: 650, resizable: true, title: 'Konfiguration',
    parent: parent || undefined,
    modal: !!(pickerWin && !pickerWin.isDestroyed() && pickerWin.isVisible()),
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, preload: path.join(__dirname, 'preload.js') }
  }
  if (!parent) delete opts.parent

  prefWin = new BrowserWindow(opts)
  prefWin.setMenu(null)

  const isDev = !!process.env.ELECTRON_START_URL
  if (isDev) prefWin.loadURL(process.env.ELECTRON_START_URL + '/konfiguration')
  else prefWin.loadFile(path.join(__dirname, 'immo24-ui', 'dist', 'index.html'))

  prefWin.once('ready-to-show', () => prefWin.show())
  prefWin.on('closed', () => { prefWin = null })
}

// === 7) Menü
const isMac = process.platform === 'darwin'
const template = [
  ...(isMac ? [{
    label: app.name,
    submenu: [
      { role: 'about' }, { type: 'separator' },
      { label: 'Konfiguration', accelerator: 'CommandOrControl+,', click: createPreferencesWindow },
      { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' },
      { type: 'separator' }, { role: 'quit' }
    ]
  }] : [{
    label: 'Datei',
    submenu: [
      { label: 'Konfiguration', accelerator: 'CommandOrControl+,', click: createPreferencesWindow },
      { type: 'separator' }, { role: 'quit' }
    ]
  }]),
  {
    label: 'Ansicht',
    submenu: [
      { role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' },
      { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
      { type: 'separator' }, { role: 'togglefullscreen' }
    ]
  }
]
const menu = Menu.buildFromTemplate(template)
Menu.setApplicationMenu(menu)

// === 8) App Lifecycle
app.whenReady().then(async () => {
  ensureUserJsonFiles()

  // Splash nur zeigen, wenn’s voraussichtlich länger dauert (optional):
  const splashTimer = setTimeout(() => createSplashWindow(), 250)

  startNodeRED()
  createWindow()
  registerIpc()

  const ready = await waitForNodeRedReady({ path_: '/api/user', timeoutMs: 12000 })
  if (!ready) console.warn('Node‑RED nicht rechtzeitig bereit – starte trotzdem')

  // Splash aufräumen
  clearTimeout(splashTimer)
  if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close()

  // Jetzt erst die App laden (verhindert „Hintergrund‑Requests“)
  const isDev = !app.isPackaged || process.env.NODE_ENV === 'development' || process.env.ELECTRON_START_URL
  if (isDev) await mainWindow.loadURL(process.env.ELECTRON_START_URL || 'http://localhost:3000')
  else await mainWindow.loadFile(path.join(__dirname, 'immo24-ui', 'dist', 'index.html'))

  // Picker: Nutzerliste parallel holen, dann anzeigen
  const users = await getUsersFromNodeRed()
  const pw = createUserPickerWindow()
  pw.webContents.once('did-finish-load', () => pw.webContents.send('users', users))
})

app.on('window-all-closed', () => {
  if (nodeRedProcess) nodeRedProcess.kill()
  app.quit()
})