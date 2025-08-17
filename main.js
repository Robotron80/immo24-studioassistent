// main.js
const { app, BrowserWindow, Menu, ipcMain, dialog } = require('electron')
const path = require('path')
const { spawn } = require('child_process')
const http = require('http')
const fs = require('fs')

/* ────────────────────────────── Globals ────────────────────────────── */
let nodeRedProcess
let mainWindow
let prefWin = null
let splashWindow
let pickerWin = null

// Reuse TCP-Verbindungen für alle HTTP-Calls zu Node-RED
const keepAliveAgent = new http.Agent({ keepAlive: true })

/* ───────────────────────── Setup: User-Dateien ─────────────────────── */
function ensureUserJsonFiles() {
  const basePath = app.getPath('userData')
  const srcDir = path.join(__dirname, 'assets')
  for (const file of ['path.json', 'adminpw.json']) {
    const dest = path.join(basePath, file)
    if (!fs.existsSync(dest)) {
      const src = path.join(srcDir, file)
      fs.existsSync(src) ? fs.copyFileSync(src, dest) : fs.writeFileSync(dest, '{}')
    }
  }
}

/* ─────────────────────── Node‑RED: HTTP‑Helpers ────────────────────── */
function getUsersFromNodeRed() {
  return new Promise((resolve) => {
    const req = http.request(
      { host: '127.0.0.1', port: 1880, path: '/api/user', method: 'GET', agent: keepAliveAgent },
      (res) => {
        let data = ''
        res.on('data', c => (data += c))
        res.on('end', () => {
          try {
            const arr = JSON.parse(data)
            // Direkt ein Array von Objekten [{name, kuerzel}, ...]
            if (Array.isArray(arr)) {
              resolve(arr.map(u => u.name))
            } else {
              resolve([])
            }
          } catch {
            resolve([])
          }
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
        host: '127.0.0.1', port: 1880, path: '/api/login', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': payload.length },
        agent: keepAliveAgent
      },
      (res) => resolve(res.statusCode >= 200 && res.statusCode < 300)
    )
    req.on('error', () => resolve(false))
    req.write(payload); req.end()
  })
}

// schneller, fehlertoleranter Logout (non-blocking verwendbar)
function postLogoutToNodeRed(timeoutMs = 1200) {
  return new Promise((resolve) => {
    const req = http.request(
      { host: '127.0.0.1', port: 1880, path: '/api/logout', method: 'POST', agent: keepAliveAgent },
      (res) => { res.resume(); resolve(res.statusCode >= 200 && res.statusCode < 300) }
    )
    req.setTimeout(timeoutMs, () => { try { req.destroy(new Error('logout timeout')) } catch {} })
    req.on('error', () => resolve(false))
    req.end()
  })
}

/* ───────────── Ready‑Check: HEAD‑Ping mit Backoff & Timeout ─────────── */
async function waitForNodeRedReady({
  host = '127.0.0.1',
  port = 1880,
  path_ = '/api/user',
  timeoutMs = 12000,      // harte Obergrenze
  perRequestTimeout = 1500,
  minDelay = 120,
  maxDelay = 600,
  useAgent = false        // HEAD ohne Keep‑Alive vermeidet hängende Sockets
} = {}) {
  const start = Date.now()
  let delay = minDelay

  const tryOnce = () => new Promise((resolve) => {
    const req = http.request(
      { host, port, path: path_, method: 'HEAD', agent: useAgent ? keepAliveAgent : undefined },
      (res) => { res.resume(); resolve(res.statusCode >= 200 && res.statusCode < 400) }
    )
    req.setTimeout(perRequestTimeout, () => { try { req.destroy(new Error('probe timeout')) } catch {} })
    req.on('error', () => resolve(false))
    req.end()
  })

  if (await tryOnce()) return true
  while (Date.now() - start < timeoutMs) {
    await new Promise(r => setTimeout(r, delay))
    if (await tryOnce()) return true
    delay = Math.min(Math.floor(delay * 1.6), maxDelay)
  }
  return false
}

/* ───────────────────────────── Fenster ─────────────────────────────── */
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
    show: false, // erst nach Anmeldung
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true,
      preload: path.join(__dirname, 'preload.js'),
    }
  })
  // WICHTIG: KEIN loadURL/loadFile hier – erst nach Node‑RED‑Ready
}

// zuverlässig verstecken (behandelt Fullscreen/Kiosk etc.)
async function hideMainWindowRobust(win, maxWaitMs = 900) {
  if (!win || win.isDestroyed()) return
  try { win.setFullScreen(false) } catch {}
  try { win.setKiosk(false) } catch {}
  try { win.unmaximize() } catch {}
  try { win.setAlwaysOnTop(false) } catch {}
  try { win.setVisibleOnAllWorkspaces(false) } catch {}
  try { win.blur() } catch {}
  try { win.hide() } catch {}

  const start = Date.now()
  while (Date.now() - start < maxWaitMs) {
    if (!win.isVisible()) break
    await new Promise(r => setTimeout(r, 40))
  }
  if (win.isVisible()) { try { win.minimize() } catch {} }
}

/* ─────────────── Zentraler Flow: Fenster weg + Picker ──────────────── */
async function openPickerFlow({ doLogout = true } = {}) {
  // 1) Prefs schließen (sonst ziehen sie das Main ggf. hoch)
  if (prefWin && !prefWin.isDestroyed()) { prefWin.close(); prefWin = null }

  // 2) Main-Fenster robust verstecken
  if (mainWindow && !mainWindow.isDestroyed()) {
    await hideMainWindowRobust(mainWindow)
  }

  // 3) Logout *parallel* (UI nicht blockieren)
  if (doLogout) postLogoutToNodeRed(1200).catch(() => {})

  // 4) Picker öffnen / fokussieren
  if (!pickerWin || pickerWin.isDestroyed()) pickerWin = createUserPickerWindow()
  else { pickerWin.show(); pickerWin.focus() }

  // 5) Userliste laden und an Picker senden
  const users = await getUsersFromNodeRed()
  const sendUsers = () => { try { pickerWin.webContents.send('users', users) } catch {} }
  pickerWin.webContents.isLoading()
    ? pickerWin.webContents.once('did-finish-load', sendUsers)
    : sendUsers()

  return { ok: true }
}

/* ───────────────────────────── IPC ──────────────────────────────────── */
// Picker bestätigt Auswahl → aktiven User an Renderer, Picker schließen, Main zeigen
ipcMain.on('user-picked', async (_evt, user) => {
  await postActiveUserToNodeRed(user)
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('active-user', user)
  if (pickerWin && !pickerWin.isDestroyed()) { pickerWin.close(); pickerWin = null }
  if (splashWindow && !splashWindow.isDestroyed()) { splashWindow.close(); splashWindow = null }
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.show()
})

// Picker „Beenden“ → ganze App schließen
ipcMain.on('app-quit', () => { app.quit() })

// Renderer will: Fenster verstecken + (optional) Logout + Picker öffnen
ipcMain.handle('renderer-hide-and-pick', async (_evt, args) => {
  try { return await openPickerFlow(args || { doLogout: true }) }
  catch (e) { return { ok: false, error: String(e) } }
})

/* ───────────────────────── Node‑RED Start ───────────────────────────── */
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
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, IMMO24_USERDATA: basePath, APP_VERSION: app.getVersion() }
  })

  let firstOut = true
  nodeRedProcess.stdout.on('data', d => { if (firstOut) { console.log(`[Node-RED] ${String(d)}`.trim()); firstOut = false } })
  nodeRedProcess.stderr.on('data', d => console.error(`[Node-RED ERROR] ${String(d)}`.trim()))
  nodeRedProcess.on('error', err => console.error('[Node-RED SPAWN ERROR]', err))
  nodeRedProcess.on('exit', (code, signal) => console.log(`[Node-RED EXIT] code: ${code}, signal: ${signal}`))
}

/* ─────────────── Sonstige IPC (Ordnerauswahl/Prefs) ──────────────── */
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

/* ───────────────────────────── Menü ────────────────────────────────── */
const isMac = process.platform === 'darwin'
const template = [
  ...(isMac ? [{
    label: app.name,
    submenu: [
      { role: 'about' }, { type: 'separator' },
      { label: 'Konfiguration', accelerator: 'CommandOrControl+,', click: createPreferencesWindow },
      { type: 'separator' },
      { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' },
      { type: 'separator' },
      { label: 'Abmelden', click: () => openPickerFlow({ doLogout: false }) },
      { type: 'separator' },
      { role: 'quit' }
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
Menu.setApplicationMenu(Menu.buildFromTemplate(template))

/* ───────────────────────── App Lifecycle ───────────────────────────── */
app.whenReady().then(async () => {
  ensureUserJsonFiles()

  // Splash nur zeigen, wenn Start > 250ms dauert (vermeidet „Blinken“)
  const splashTimer = setTimeout(() => createSplashWindow(), 250)

  startNodeRED()
  createWindow()
  registerIpc()

  const ready = await waitForNodeRedReady({
    path_: '/api/user', // <--- richtig!
    timeoutMs: 12000,
    perRequestTimeout: 1500,
    minDelay: 120,
    maxDelay: 600
  })

  clearTimeout(splashTimer)
  if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close()

  // App erst jetzt laden (verhindert Hintergrund-Requests vor Ready)
  const isDev = !app.isPackaged || process.env.NODE_ENV === 'development' || process.env.ELECTRON_START_URL
  if (isDev) await mainWindow.loadURL(process.env.ELECTRON_START_URL || 'http://localhost:3000')
  else await mainWindow.loadFile(path.join(__dirname, 'immo24-ui', 'dist', 'index.html'))

  // Direkt Picker öffnen, Users ggf. leer nachreichen
  const pw = createUserPickerWindow()
  const users = ready ? (await getUsersFromNodeRed()) : []
  pw.webContents.once('did-finish-load', () => pw.webContents.send('users', users))

  if (!ready) {
    ;(async () => {
      const ok = await waitForNodeRedReady({ timeoutMs: 15000 })
      if (!ok || !pickerWin || pickerWin.isDestroyed()) return
      try { pickerWin.webContents.send('users', await getUsersFromNodeRed()) } catch {}
    })()
  }
})

app.on('window-all-closed', () => {
  if (nodeRedProcess) nodeRedProcess.kill()
  app.quit()
})