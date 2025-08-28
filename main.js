// main.js
const { app, BrowserWindow, Menu, ipcMain, dialog } = require('electron')
const path = require('path')
const { spawn } = require('child_process')
const http = require('http')
const fs = require('fs')
const { init } = require('node-red')

/* ────────────────────────────── Globals ────────────────────────────── */
let nodeRedProcess
let mainWindow
let prefWin = null
let splashWindow
let pickerWin = null

// Reuse TCP-Verbindungen für alle HTTP-Calls zu Node-RED
const keepAliveAgent = new http.Agent({ keepAlive: true })

async function fetchInitializeStatus(timeoutMs = 3000) {
  return new Promise((resolve) => {
    const req = http.request(
      { host: '127.0.0.1', port: 1880, path: '/api/initialize', method: 'GET', agent: keepAliveAgent },
      (res) => {
        let body = ''
        res.setEncoding('utf8')
        res.on('data', c => (body += c))
        res.on('end', () => {
          try { resolve(JSON.parse(body)) } catch { resolve({ ok: res.statusCode >= 200 && res.statusCode < 400 }) }
        })
      }
    )
    req.setTimeout(timeoutMs, () => { try { req.destroy(new Error('timeout')) } catch {} })
    req.on('error', () => resolve({ ok: false }))
    req.end()
  })
}

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
  path_ = '/api/initialize',
  method = 'GET',           // vorher: HEAD
  timeoutMs = 12000,
  perRequestTimeout = 1500,
  minDelay = 120,
  maxDelay = 600,
  useAgent = false
} = {}) {
  const start = Date.now()
  let delay = minDelay
  const tryOnce = () => new Promise((resolve) => {
    const req = http.request(
      { host, port, path: path_, method, agent: useAgent ? keepAliveAgent : undefined },
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
    width: 420, height: 300, resizable: false, frame: false, show: true, alwaysOnTop: false, movable: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  })
  pickerWin.loadFile(path.join(__dirname, 'assets', 'login.html'))
  return pickerWin
}

function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 420, height: 300, resizable: false, frame: false, transparent: false,
    alwaysOnTop: true, center: true, show: true, movable: false,
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
      preload: path.join(__dirname, 'preload.js')
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
  if (prefWin && !prefWin.isDestroyed()) { prefWin.close(); prefWin = null }
  if (mainWindow && !mainWindow.isDestroyed()) {
    await hideMainWindowRobust(mainWindow)
  }
  if (doLogout) {
    try { await postLogoutToNodeRed(1200) } catch (e) { console.error('Logout-Fehler:', e) }
  }
  if (!pickerWin || pickerWin.isDestroyed()) pickerWin = createUserPickerWindow()
  else { pickerWin.show(); pickerWin.focus() }
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
  if (mainWindow && !mainWindow.isDestroyed()) {
    // Event NACH dem Reload feuern
    mainWindow.webContents.once('did-finish-load', () => {
      try { mainWindow.webContents.send('active-user', user) } catch {}
    })
    mainWindow.show()
    mainWindow.focus()
    mainWindow.webContents.reload()
  }
  if (pickerWin && !pickerWin.isDestroyed()) { pickerWin.close(); pickerWin = null }
  if (splashWindow && !splashWindow.isDestroyed()) { splashWindow.close(); splashWindow = null }
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

  console.log('Starte Node-RED mit:', nodeBinary, redJs)

  nodeRedProcess = spawn(nodeBinary, [redJs, '-u', nodeRedDir, '--port', '1880'], {
    cwd: nodeRedDir,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', IMMO24_USERDATA: basePath, APP_VERSION: app.getVersion() }
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
  if (isDev) {
    prefWin.loadURL(process.env.ELECTRON_START_URL + '/konfiguration')
  } else {
    prefWin.loadFile(path.join(__dirname, 'immo24-ui', 'dist', 'index.html'))
    prefWin.webContents.once('did-finish-load', () => {
      prefWin.webContents.executeJavaScript("window.location.hash = '#/konfiguration'")
    })
  }

  prefWin.once('ready-to-show', () => prefWin.show())
  prefWin.on('closed', () => { prefWin = null })
}

function createInitWindow() {
  const initWin = new BrowserWindow({
    width: 900,
    height: 800,
    resizable: true,
    frame: true,
    show: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js')
    }
  })

  initWin.loadFile(path.join(__dirname, 'immo24-ui', 'dist', 'index.html'))
  initWin.webContents.once('did-finish-load', () => {
    initWin.webContents.executeJavaScript("window.location.hash = '#/Setupwizard'")
  })
  initWin.once('ready-to-show', () => initWin.show())
  initWin.on('closed', () => app.quit())

  return initWin
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
      { role: 'quit' }
    ]
  }] : [{
    label: 'Datei',
    submenu: [
      { label: 'Konfiguration', accelerator: 'CommandOrControl+,', click: createPreferencesWindow },
      { type: 'separator' }, { role: 'quit' }
    ]
  }]),
/*  {
    label: 'Ansicht',
    submenu: [
      { role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' },
      { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
      { type: 'separator' }, { role: 'togglefullscreen' }
    ]
  } */
] 
Menu.setApplicationMenu(Menu.buildFromTemplate(template))

/* ───────────────────────── App Lifecycle ───────────────────────────── */
app.whenReady().then(async () => {
  try {
    ensureUserJsonFiles()
    const splashTimer = setTimeout(() => createSplashWindow(), 250)
    startNodeRED()
    createWindow()
    registerIpc()

    // Poll /api/initialize bis ready:true oder Timeout
    const timeoutMs = 12000
    const pollDelay = 400
    let init = null
    let start = Date.now()
    while (Date.now() - start < timeoutMs) {
      init = await fetchInitializeStatus()
      if (init?.ready === true) break
      await new Promise(r => setTimeout(r, pollDelay))
    }
    clearTimeout(splashTimer)
    if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close()

    if (!init || init?.ready !== true) {
      // Node-RED ist nicht bereit, App beenden oder Fehler anzeigen
      console.error('Node-RED nicht bereit nach Timeout.')
      app.quit()
      return
    }

    // UI laden
    const isDev = process.env.NODE_ENV === 'development' || process.env.ELECTRON_START_URL
    if (isDev) {
      await mainWindow.loadURL(process.env.ELECTRON_START_URL || 'http://localhost:3000')
    } else {
      await mainWindow.loadFile(path.join(__dirname, 'immo24-ui', 'dist', 'index.html'))
    }

    // Jetzt auswerten: needsUserAction
    if (init?.initialize?.needsUserAction) {
      createInitWindow()
      return
    } else {
      // User-Picker öffnen
      const usersFromInit = Array.isArray(init?.user) ? init.user.map(u => u.name) : null
      const users = usersFromInit || (await getUsersFromNodeRed())
      const pw = createUserPickerWindow()
      pw.webContents.once('did-finish-load', () => pw.webContents.send('users', users))
    }
  } catch (err) {
    console.error('Fehler beim App-Start:', err)
    app.quit()
  }
})

app.on('before-quit', () => {
  if (nodeRedProcess) {
    try { nodeRedProcess.kill() } catch {}
  }
})

app.on('window-all-closed', () => {
  if (nodeRedProcess) nodeRedProcess.kill()
  app.quit()
})