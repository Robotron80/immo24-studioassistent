/**
 * immo24 Studioassistent - Electron Main Process
 * ------------------------------------------------
 * - Startet Node-RED als Backend (embedded)
 * - Verwaltet alle Fenster (Main, Picker, Setup, Splash, Preferences)
 * - IPC-Kommunikation mit Renderer
 * - User-Datenverwaltung
 * - Menü & App-Lifecycle
 */

const { app, BrowserWindow, Menu, ipcMain, dialog, session, shell } = require('electron')
const path = require('path')
const http = require('http')
const fs = require('fs')
const express = require('express')
const RED = require('node-red')

// ────────────────────────────── Fehler-Logging ──────────────────────────────
const LOG_DIR = path.join(app.getPath('userData'), 'logs')
const LOG_FILE = path.join(LOG_DIR, 'app.log')

function logLine(...args) {
  try {
    const ts = new Date().toISOString()
    const line = `[${ts}] ${args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')}\n`
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true })
    fs.appendFileSync(LOG_FILE, line)
    console.log(...args)
  } catch { /* ignore logging errors */ }
}

function showOnceErrorBox(title, message) {
  if (showOnceErrorBox._open) return
  showOnceErrorBox._open = true
  try { dialog.showErrorBox(title, message) } finally { showOnceErrorBox._open = false }
}

// ────────────────────────────── Globale Fehlerfänger ──────────────────────────────
process.on('uncaughtException', (err) => {
  logLine('[uncaughtException]', err?.stack || String(err))
  showOnceErrorBox('Unerwarteter Fehler', String(err?.message || err))
})

process.on('unhandledRejection', (reason, p) => {
  logLine('[unhandledRejection]', { reason: String(reason), promise: String(p) })
  showOnceErrorBox('Unerwarteter Fehler (Promise)', String(reason))
})

// ────────────────────────────── Konstanten & Globals ──────────────────────────────

const NODE_RED_HOST = '127.0.0.1'
const NODE_RED_PORT = 59593
const keepAliveAgent = new http.Agent({ keepAlive: true })

// ────────────────────────────── Dev-Backend / CLI ──────────────────────────────
// CLI-Schalter: --dev-backend  → IMMO24_DEV_BACKEND=1
const CLI_ARGS = new Set(process.argv.slice(1))
if (CLI_ARGS.has('--dev-backend')) {
  process.env.IMMO24_DEV_BACKEND = '1'
  logLine('[cli] Dev backend enabled')
}
// Developer-Backend-Modus: Flows im UserDir bearbeitbar, Admin-UI aktiv
const DEV_BACKEND = process.env.IMMO24_DEV_BACKEND === '1'

let mainWindow, prefWin, splashWindow, pickerWin, initWin
let initWindowClosedByApp = false // Flag: SetupWizard-Fenster per App geschlossen?
let redApp, redServer, redStarted = false

// ────────────────────────────── User-Daten ──────────────────────────────
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

// ────────────────────────────── Node-RED HTTP-API ──────────────────────────────
async function fetchReadyStatus(timeoutMs = 1500) {
  return new Promise((resolve) => {
    const req = http.request(
      { host: NODE_RED_HOST, port: NODE_RED_PORT, path: '/api/ping', method: 'GET', agent: keepAliveAgent },
      (res) => {
        // 2xx vom Flow-Endpoint gilt als bereit
        resolve({ ok: res.statusCode >= 200 && res.statusCode < 300 })
      }
    )
    req.setTimeout(timeoutMs, () => { try { req.destroy(new Error('timeout')) } catch {} })
    req.on('error', () => resolve({ ok: false }))
    req.end()
  })
}

async function fetchInitializeStatus(timeoutMs = 3000) {
  return new Promise((resolve) => {
    const req = http.request(
      { host: NODE_RED_HOST, port: NODE_RED_PORT, path: '/api/initialize', method: 'GET', agent: keepAliveAgent },
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

function getUsersFromNodeRed() {
  return new Promise((resolve) => {
    const req = http.request(
      { host: NODE_RED_HOST, port: NODE_RED_PORT, path: '/api/user', method: 'GET', agent: keepAliveAgent },
      (res) => {
        let data = ''
        res.on('data', c => (data += c))
        res.on('end', () => {
          try {
            const arr = JSON.parse(data)
            resolve(Array.isArray(arr) ? arr.map(u => u.name) : [])
          } catch { resolve([]) }
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
        host: NODE_RED_HOST, port: NODE_RED_PORT, path: '/api/login', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': payload.length },
        agent: keepAliveAgent
      },
      (res) => resolve(res.statusCode >= 200 && res.statusCode < 300)
    )
    req.on('error', () => resolve(false))
    req.write(payload); req.end()
  })
}

function postLogoutToNodeRed(timeoutMs = 1200) {
  return new Promise((resolve) => {
    const req = http.request(
      { host: NODE_RED_HOST, port: NODE_RED_PORT, path: '/api/logout', method: 'POST', agent: keepAliveAgent },
      (res) => { res.resume(); resolve(res.statusCode >= 200 && res.statusCode < 300) }
    )
    req.setTimeout(timeoutMs, () => { try { req.destroy(new Error('logout timeout')) } catch {} })
    req.on('error', () => resolve(false))
    req.end()
  })
}

// ────────────────────────────── Node-RED Seed & Defaults ──────────────────────────────
function copyRecursiveSync(src, dest) {
  if (!src || !fs.existsSync(src)) return;
  const st = fs.statSync(src);
  if (st.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const e of fs.readdirSync(src)) {
      copyRecursiveSync(path.join(src, e), path.join(dest, e));
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

function resolveNodeRedSeedDir() {
  if (process.env.IMMO24_NODERED_SEED && fs.existsSync(process.env.IMMO24_NODERED_SEED)) {
    return process.env.IMMO24_NODERED_SEED;
  }
  const dev = path.join(__dirname, 'assets', 'node-red');
  if (fs.existsSync(dev)) return dev;
  if (process.resourcesPath) {
    const prod = path.join(process.resourcesPath, 'assets', 'node-red');
    if (fs.existsSync(prod)) return prod;
  }
  return null;
}

function ensureNodeRedDefaults(userDir) {
  const flowsPath = path.join(userDir, 'flows.json');
  const credsPath = path.join(userDir, 'flows_cred.json');
  if (fs.existsSync(flowsPath)) return;
  const seedDir = resolveNodeRedSeedDir();
  try {
    if (seedDir && fs.existsSync(path.join(seedDir, 'flows.json'))) {
      copyRecursiveSync(seedDir, userDir);
      return;
    }
    fs.mkdirSync(userDir, { recursive: true });
    fs.writeFileSync(flowsPath, '[]', 'utf8');
    if (!fs.existsSync(credsPath)) fs.writeFileSync(credsPath, '{}', 'utf8');
  } catch (e) {
    try {
      if (!fs.existsSync(flowsPath)) fs.writeFileSync(flowsPath, '[]', 'utf8');
      if (!fs.existsSync(credsPath)) fs.writeFileSync(credsPath, '{}', 'utf8');
    } catch {}
  }
}

// ────────────────────────────── Netzwerk-Guard ──────────────────────────────
function installGlobalNetworkGuard() {
  if (installGlobalNetworkGuard._done) return
  installGlobalNetworkGuard._done = true
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details, cb) => {
    try {
      const u = new URL(details.url)
      const isLocalFile =
        (u.protocol === 'file:' &&
         (u.pathname.includes('app.asar') ||
          u.pathname.includes(`${path.sep}dist${path.sep}`) ||
          u.pathname.includes(`${path.sep}assets${path.sep}`)))
      const devUrl = process.env.ELECTRON_START_URL || ''
      const isDevServer = !!devUrl && (u.origin === devUrl.replace(/\/+$/,'') ||
                                       u.origin === 'http://localhost:3000' ||
                                       u.origin === 'ws://localhost:3000')
      const isNodeRed =
        (u.protocol === 'http:' &&
         (u.hostname === NODE_RED_HOST ||
          (NODE_RED_HOST === '127.0.0.1' && (u.hostname === 'localhost' || u.hostname === '::1'))) &&
         u.port === String(NODE_RED_PORT))
      const allowed = isLocalFile || isDevServer || isNodeRed
      cb({ cancel: !allowed })
    } catch {
      cb({ cancel: true })
    }
  })
}

// ────────────────────────────── Fenster-Crash-Guards ──────────────────────────────
function attachCrashGuards(win, name = 'window') {
  if (!win || win.isDestroyed()) return
  win.webContents.on('render-process-gone', (_e, details) => {
    logLine(`[${name}] render-process-gone`, details)
    showOnceErrorBox('Fenster abgestürzt', `${name} ist abgestürzt (${details.reason}). Starte neu…`)
    try { win.reload() } catch {}
  })
  win.webContents.on('unresponsive', () => {
    logLine(`[${name}] unresponsive`)
    const choice = dialog.showMessageBoxSync(win, {
      type: 'warning',
      buttons: ['Warten', 'Neu laden'],
      defaultId: 0,
      cancelId: 0,
      message: `${name} reagiert nicht mehr.`,
      detail: 'Du kannst warten oder das Fenster neu laden.'
    })
    if (choice === 1) { try { win.reload() } catch {} }
  })
  win.webContents.on('responsive', () => {
    logLine(`[${name}] responsive (wieder OK)`)
  })
  win.webContents.on('plugin-crashed', (_e, pname, version) => {
    logLine(`[${name}] plugin-crashed`, { name: pname, version })
  })
}

// ────────────────────────────── Fenster-Erstellung ──────────────────────────────
function createUserPickerWindow() {
  if (pickerWin && !pickerWin.isDestroyed()) return pickerWin
  pickerWin = new BrowserWindow({
    width: 420, height: 300, resizable: false, frame: false, show: false,
    alwaysOnTop: false, movable: true,
    webPreferences: {
      contextIsolation: true, sandbox: true, nodeIntegration: false,
      webSecurity: true, allowRunningInsecureContent: false,
      enableRemoteModule: false, preload: path.join(__dirname, 'preload.js'),
    }
  })
  attachCrashGuards(pickerWin, 'picker')
  pickerWin.webContents.on('will-navigate', (e, url) => {
    try {
      const u = new URL(url)
      const ok = (u.protocol === 'file:' && u.pathname.endsWith('/assets/login.html'))
      if (!ok) e.preventDefault()
    } catch { e.preventDefault() }
  })
  pickerWin.webContents.setWindowOpenHandler(({ url }) => {
    try { const u = new URL(url); if (u.protocol === 'https:') shell.openExternal(url) } catch {}
    return { action: 'deny' }
  })
  pickerWin.once('ready-to-show', () => pickerWin.show())
  pickerWin.loadURL('file://' + path.join(__dirname, 'assets', 'login.html'))
  pickerWin.on('closed', () => { pickerWin = null })
  return pickerWin
}

function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 420, height: 300, resizable: false, frame: false, transparent: false,
    alwaysOnTop: true, center: true, show: false, movable: false,
    webPreferences: {
      contextIsolation: true, sandbox: true, nodeIntegration: false,
      webSecurity: true, allowRunningInsecureContent: false,
      enableRemoteModule: false, preload: path.join(__dirname, 'preload.js'),
    }
  })
  attachCrashGuards(splashWindow, 'splash')
  splashWindow.webContents.on('will-navigate', (e, url) => {
    try {
      const u = new URL(url)
      const ok = (u.protocol === 'file:' && u.pathname.endsWith('/assets/loading.html'))
      if (!ok) e.preventDefault()
    } catch { e.preventDefault() }
  })
  splashWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  splashWindow.once('ready-to-show', () => splashWindow.show())
  splashWindow.loadURL('file://' + path.join(__dirname, 'assets', 'loading.html'))
  splashWindow.on('closed', () => { splashWindow = null })
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200, height: 900, useContentSize: true,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    show: false,
    webPreferences: {
      contextIsolation: true, sandbox: true, nodeIntegration: false,
      webSecurity: true, allowRunningInsecureContent: false,
      enableRemoteModule: false, preload: path.join(__dirname, 'preload.js')
    }
  })
  attachCrashGuards(mainWindow, 'main')
  mainWindow.webContents.on('will-navigate', (e, url) => {
    try {
      const u = new URL(url)
      const ok =
        (u.protocol === 'file:' && u.pathname.endsWith('/immo24-ui/dist/index.html')) ||
        (!!process.env.ELECTRON_START_URL && u.origin === (process.env.ELECTRON_START_URL || '').replace(/\/+$/,''))
      if (!ok) e.preventDefault()
    } catch { e.preventDefault() }
  })
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try { const u = new URL(url); if (u.protocol === 'https:') shell.openExternal(url) } catch {}
    return { action: 'deny' }
  })
}

function hideMainWindowRobust(win, maxWaitMs = 900) {
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
    require('deasync').sleep(40)
  }
  if (win.isVisible()) { try { win.minimize() } catch {} }
}

async function openPickerFlow({ doLogout = true } = {}) {
  if (prefWin && !prefWin.isDestroyed()) { prefWin.close(); prefWin = null }
  if (mainWindow && !mainWindow.isDestroyed()) {
    hideMainWindowRobust(mainWindow)
  }
  if (doLogout) {
    try { await postLogoutToNodeRed(1200) } catch (e) { logLine('Logout-Fehler:', e) }
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

function createPreferencesWindow() {
  if (prefWin && !prefWin.isDestroyed()) { prefWin.focus(); return }
  if (pickerWin && !pickerWin.isDestroyed()) { pickerWin.close(); pickerWin = null }
  const parent =
    (pickerWin && !pickerWin.isDestroyed() && pickerWin.isVisible()) ? pickerWin :
    (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) ? mainWindow :
    undefined
  const opts = {
    width: 900, height: 650, resizable: true, title: 'Konfiguration',
    parent, modal: !!parent, show: false,
    webPreferences: {
      contextIsolation: true, sandbox: true, nodeIntegration: false,
      webSecurity: true, allowRunningInsecureContent: false,
      enableRemoteModule: false, preload: path.join(__dirname, 'preload.js')
    }
  }
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
  const entryHtml = path.join(__dirname, 'immo24-ui', 'dist', 'index.html')
  const startUrl = 'file://' + entryHtml + '#/Setupwizard'
  initWin = new BrowserWindow({
    width: 900, height: 800, resizable: true, frame: true, show: false,
    webPreferences: {
      contextIsolation: true, sandbox: true, nodeIntegration: false,
      webSecurity: true, allowRunningInsecureContent: false,
      enableRemoteModule: false, preload: path.join(__dirname, 'preload.js'),
    },
  })
  attachCrashGuards(initWin, 'init')
  initWin.webContents.on('will-navigate', (e, url) => {
    try {
      const u = new URL(url)
      const ok = (u.protocol === 'file:' && u.pathname.endsWith('/immo24-ui/dist/index.html'))
      if (!ok) e.preventDefault()
    } catch { e.preventDefault() }
  })
  initWin.webContents.setWindowOpenHandler(({ url }) => {
    try { const u = new URL(url); if (u.protocol === 'https:') shell.openExternal(url) } catch {}
    return { action: 'deny' }
  })
  initWin.once('ready-to-show', () => initWin.show())
  initWin.loadURL(startUrl)
  initWin.on('closed', () => {
    if (!initWindowClosedByApp) app.quit()
    initWin = null
    initWindowClosedByApp = false
  })
  return initWin
}

// ────────────────────────────── IPC-Handler ──────────────────────────────
ipcMain.on('user-picked', async (_evt, user) => {
  await postActiveUserToNodeRed(user)
  if (mainWindow && !mainWindow.isDestroyed()) {
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

ipcMain.on('app-quit', () => { app.quit() })

ipcMain.handle('renderer-hide-and-pick', async (_evt, args) => {
  try { return await openPickerFlow(args || { doLogout: true }) }
  catch (e) { return { ok: false, error: String(e) } }
})

ipcMain.handle('close-init-window', () => {
  if (initWin && !initWin.isDestroyed()) {
    initWindowClosedByApp = true
    initWin.close()
    initWin = null
    return true
  }
  return false
})

ipcMain.handle('refresh-users', async () => {
  const users = await getUsersFromNodeRed()
  if (pickerWin && !pickerWin.isDestroyed()) {
    pickerWin.webContents.send('users', users)
  }
  return users
})

const rootPkg = require('./package.json')
ipcMain.handle('get-app-version', () => rootPkg.version)

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



// ────────────────────────────── Node-RED Start ──────────────────────────────
async function startNodeRED() {
  const userDir = path.join(app.getPath('userData'), 'node-red');
  fs.mkdirSync(userDir, { recursive: true });
  process.env.IMMO24_USERDATA ||= app.getPath('userData');
  if (DEV_BACKEND) {
    ensureNodeRedDefaults(userDir);
  }

  redApp = express()
  redServer = http.createServer(redApp)

  // (Liveness & Readiness Endpunkte entfernt)

  // Node-RED Home korrekt setzen (robust für Packaging / asar)
  const NODE_RED_HOME = path.dirname(require.resolve('node-red/package.json'))
  process.env.NODE_RED_HOME = NODE_RED_HOME
  logLine('[Node-RED] HOME = ' + NODE_RED_HOME)

  // Core-Nodes liegen ab Node-RED 3/4 im Paket "@node-red/nodes" (nicht in "node-red/nodes")
  const CORE_NODES_DIR = path.dirname(require.resolve('@node-red/nodes/package.json'))
  logLine('[Node-RED] CORE_NODES_DIR = ' + CORE_NODES_DIR)


  // Flows als App-Code (Assets) oder im Dev-Backend aus dem UserDir
  const seedDir = resolveNodeRedSeedDir()
  const assetFlowFile = seedDir ? path.join(seedDir, 'flows.json') : null

  const settings = {
    // Admin-UI nur im Dev-Backend aktiv, sonst komplett aus
    httpAdminRoot: DEV_BACKEND ? '/red' : false,
    userDir,
    // Dev-Backend: UserDir-Flows; Prod: Flows direkt aus Assets (read-only)
    flowFile: DEV_BACKEND ? 'flows.json' : (assetFlowFile || 'flows.json'),
    // Stelle sicher, dass Core-Nodes (und deren Ressourcen) gefunden werden
    coreNodesDir: CORE_NODES_DIR,
    logging: { console: { level: 'info' } },
    functionGlobalContext: {},
    contextStorage: { default: { module: 'memory' } },
    // Editor in Prod deaktivieren (kein Deploy/Write-Versuch auf Assets)
    editorTheme: { disableEditor: !DEV_BACKEND }
    // adminAuth: ... (optional)
  }

  await RED.init(redServer, settings)
  if (settings.httpAdminRoot) {
    redApp.use(settings.httpAdminRoot, RED.httpAdmin)
  }
  redApp.use(RED.httpNode)

  await new Promise((resolve, reject) => {
    redServer.listen(NODE_RED_PORT, NODE_RED_HOST, (err) => {
      if (err) reject(err); else resolve()
    })
  })

  await RED.start()
  redStarted = true
  logLine(`Node-RED läuft auf http://${NODE_RED_HOST}:${NODE_RED_PORT}` + (settings.httpAdminRoot ? settings.httpAdminRoot : ' (Admin-UI deaktiviert)'))
}

// ────────────────────────────── Menü ──────────────────────────────
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
  {
    label: 'Bearbeiten',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      ...(isMac ? [
        { role: 'pasteAndMatchStyle' },
        { role: 'delete' },
        { role: 'selectAll' },
        { type: 'separator' },
        { label: 'Sprachausgabe', submenu: [{ role: 'startSpeaking' }, { role: 'stopSpeaking' }] }
      ] : [
        { role: 'delete' },
        { type: 'separator' },
        { role: 'selectAll' }
      ])
    ]
  }
]
Menu.setApplicationMenu(Menu.buildFromTemplate(template))

// ────────────────────────────── App Lifecycle ──────────────────────────────
app.whenReady().then(async () => {
  try {
    logLine('[startup] begin')
    logLine('[startup] mode', DEV_BACKEND ? 'DEV_BACKEND' : 'PROD_READONLY')
    installGlobalNetworkGuard()
    ensureUserJsonFiles()
    const splashTimer = setTimeout(() => createSplashWindow(), 250)
    await startNodeRED()
    createWindow()
    registerIpc()

    // Phase 1: Poll /ready (Runtime bereit?) bis OK oder Timeout
    const readyTimeout = 6000
    const pollDelay = 400
    let ready = { ok: false }
    let t0 = Date.now()
    while (Date.now() - t0 < readyTimeout) {
      ready = await fetchReadyStatus()
      if (ready?.ok) break
      await new Promise(r => setTimeout(r, pollDelay))
    }
    logLine('[startup] runtime ready:', String(!!ready?.ok))

    // Phase 2: Poll /api/initialize (fachliche Bereitschaft) bis ready:true oder Timeout
    const initTimeout = 12000
    let init = null
    let t1 = Date.now()
    while (Date.now() - t1 < initTimeout) {
      init = await fetchInitializeStatus()
      if (init?.ready === true) break
      await new Promise(r => setTimeout(r, pollDelay))
    }

    clearTimeout(splashTimer)
    if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close()
    logLine('[startup] node-red ready (business):', String(!!init && init.ready === true))

    if (!ready?.ok || !init || init?.ready !== true) {
      logLine('Node-RED nicht bereit nach Timeout.')
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

    // SetupWizard oder Picker öffnen
    if (init?.initialize?.needsUserAction) {
      createInitWindow()
      return
    } else {
      const usersFromInit = Array.isArray(init?.user) ? init.user.map(u => u.name) : null
      const users = usersFromInit || (await getUsersFromNodeRed())
      const pw = createUserPickerWindow()
      pw.webContents.once('did-finish-load', () => pw.webContents.send('users', users))
    }
  } catch (err) {
    logLine('[startup] error', err?.stack || String(err))
    showOnceErrorBox('Startfehler', String(err?.message || err))
    app.quit()
  }
})

// Node-RED Prozess beenden beim App-Exit
app.on('before-quit', async () => {
  logLine('[shutdown] begin')
  try {
    if (redStarted) {
      await RED.stop()
      await new Promise(r => redServer?.close(() => r()))
      redStarted = false
    }
  } catch (e) {
    logLine('[shutdown] error', e?.stack || String(e))
  } finally {
    logLine('[shutdown] end')
  }
})
