const { app, BrowserWindow, Menu, ipcMain, dialog } = require('electron')
const path = require('path')
const { spawn } = require('child_process')
const http = require('http')
const fs = require('fs')

let nodeRedProcess
let mainWindow
let prefWin = null
let splashWindow
let pickerWin = null

function ensureUserJsonFiles() {
  const basePath = app.getPath('userData')
  const srcDir = path.join(__dirname, 'assets')
  const files = ['path.json', 'adminpw.json']

  for (const file of files) {
    const dest = path.join(basePath, file)
    if (!fs.existsSync(dest)) {
      const src = path.join(srcDir, file)
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest)
        console.log(`Kopiere ${file} nach ${dest}`)
      } else {
        fs.writeFileSync(dest, '{}')
        console.log(`Erstelle leere Datei: ${dest}`)
      }
    }
  }
}

// --- Node-RED Helpers ------------------------------------------------------
function getUsersFromNodeRed() {
  return new Promise((resolve) => {
    const req = http.request({ host: '127.0.0.1', port: 1880, path: '/api/user', method: 'GET' }, res => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try {
          const json = JSON.parse(data)
          resolve(Array.isArray(json) ? json : [])
        } catch { resolve([]) }
      })
    })
    req.on('error', () => resolve([]))
    req.end()
  })
}

function postActiveUserToNodeRed(user) {
  return new Promise((resolve) => {
    const payload = Buffer.from(JSON.stringify({ user }))
    const req = http.request({
      host: '127.0.0.1', port: 1880, path: '/api/user', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': payload.length }
    }, res => resolve(res.statusCode >= 200 && res.statusCode < 300))
    req.on('error', () => resolve(false))
    req.write(payload)
    req.end()
  })
}

function waitForNodeRedReady({ host = '127.0.0.1', port = 1880, path_ = '/api/user', timeoutMs = 15000, intervalMs = 300 } = {}) {
  const start = Date.now()
  return new Promise((resolve) => {
    const tryOnce = () => {
      const req = http.request({ host, port, path: path_, method: 'HEAD' }, (res) => {
        if (res.statusCode >= 200 && res.statusCode < 400) return resolve(true)
        next()
      })
      req.on('error', next)
      req.end()
      function next() {
        if (Date.now() - start >= timeoutMs) return resolve(false)
        setTimeout(tryOnce, intervalMs)
      }
    }
    tryOnce()
  })
}

// --- Windows ---------------------------------------------------------------
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
    width: 420,
    height: 300,
    resizable: false,
    frame: false,
    transparent: false,
    alwaysOnTop: true,
    center: true,
    show: true,
    movable: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true }
  })
  splashWindow.loadFile(path.join(__dirname, 'assets', 'loading.html'))
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 900,
    useContentSize: true,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    show: false, // wichtig: erst später zeigen
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true,
      preload: path.join(__dirname, 'preload.js'),
    }
  })
  // WICHTIG: Hier KEIN loadURL/loadFile – erst nach Node-RED-Ready
}

// --- IPC -------------------------------------------------------------------
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
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.show() // oder app.quit()
})

// --- Node-RED Start --------------------------------------------------------
function startNodeRED() {
  const nodeRedDir = path.join(__dirname, 'node-red-portable')
  const redJs = path.join(nodeRedDir, 'node_modules', 'node-red', 'red.js')
  let nodeBinary

  if (process.platform === 'win32') {
    nodeBinary = path.join(__dirname, 'bin', 'node.exe')
  } else if (process.platform === 'darwin') {
    if (process.arch === 'arm64') {
      nodeBinary = path.join(__dirname, 'bin', 'node-arm64')
    } else {
      nodeBinary = path.join(__dirname, 'bin', 'node-x64')
    }
  } else {
    nodeBinary = path.join(__dirname, 'bin', 'node')
  }

  console.log('Starte Node-RED!', { nodeBinary, redJs, nodeRedDir })

  if (!fs.existsSync(nodeBinary)) {
    console.error('Node-Binary NICHT gefunden!')
    app.quit()
    return
  }
  if (!fs.existsSync(redJs)) {
    console.error('red.js NICHT gefunden!')
    app.quit()
    return
  }

  const basePath = app.getPath('userData')
  const configPath = path.join(basePath, 'AppBasePath.json')
  fs.writeFileSync(configPath, JSON.stringify({ AppBasePath: basePath }, null, 2))
  console.log('App-Version an Node-RED:', app.getVersion())

  nodeRedProcess = spawn(
    nodeBinary,
    [redJs, '-u', nodeRedDir, '--port', '1880'],
    {
      cwd: nodeRedDir,
      stdio: 'pipe',
      env: {
        ...process.env,
        IMMO24_USERDATA: app.getPath('userData'),
        APP_VERSION: app.getVersion()
      }
    }
  )

  nodeRedProcess.stdout.on('data', (data) => console.log(`[Node-RED] ${data}`))
  nodeRedProcess.stderr.on('data', (data) => console.error(`[Node-RED ERROR] ${data}`))
  nodeRedProcess.on('error', (err) => console.error('[Node-RED SPAWN ERROR]', err))
  nodeRedProcess.on('exit', (code, signal) => console.log(`[Node-RED EXIT] code: ${code}, signal: ${signal}`))
}

// --- IPC: Verzeichnis wählen ----------------------------------------------
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
    return (!result.canceled && Array.isArray(result.filePaths) && result.filePaths[0])
      ? result.filePaths[0]
      : null
  })
}

// --- Preferences Window ----------------------------------------------------
function createPreferencesWindow() {
  if (prefWin && !prefWin.isDestroyed()) { prefWin.focus(); return }

  // Parent nur setzen, wenn ein sichtbares Fenster existiert:
  const parent =
    (pickerWin && !pickerWin.isDestroyed() && pickerWin.isVisible()) ? pickerWin :
    (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) ? mainWindow :
    null

  const opts = {
    width: 900, height: 650, resizable: true, title: 'Konfiguration',
    // Wenn der Picker offen ist: modal zum Picker, damit es oben bleibt
    parent: parent || undefined,
    modal: !!(pickerWin && !pickerWin.isDestroyed() && pickerWin.isVisible()),
    show: false, // erst zeigen, wenn geladen
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    }
  }

  // Wenn kein Parent ermittelt wurde, parent aus den Optionen entfernen
  if (!parent) delete opts.parent

  prefWin = new BrowserWindow(opts)
  prefWin.setMenu(null)

  const isDev = !!process.env.ELECTRON_START_URL
  if (isDev) {
    prefWin.loadURL(process.env.ELECTRON_START_URL + '/konfiguration')
  } else {
    const file = path.join(__dirname, 'immo24-ui', 'dist', 'index.html')
    prefWin.loadFile(file)
  }

  prefWin.once('ready-to-show', () => prefWin.show())
  prefWin.on('closed', () => { prefWin = null })
}

// --- Menu ------------------------------------------------------------------
const isMac = process.platform === 'darwin'
const template = [
  ...(isMac ? [{
    label: app.name,
    submenu: [
      { role: 'about' },
      { type: 'separator' },
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
      { type: 'separator' },
      { role: 'quit' }
    ]
  }]),
  {
    label: 'Ansicht',
    submenu: [
      { role: 'reload' },
      { role: 'forceReload' },
      { role: 'toggleDevTools' },
      { type: 'separator' },
      { role: 'resetZoom' },
      { role: 'zoomIn' },
      { role: 'zoomOut' },
      { type: 'separator' },
      { role: 'togglefullscreen' }
    ]
  }
]
const menu = Menu.buildFromTemplate(template)
Menu.setApplicationMenu(menu)

// --- App Lifecycle ---------------------------------------------------------
app.whenReady().then(async () => {
  ensureUserJsonFiles()
  createSplashWindow()
  startNodeRED()
  createWindow()
  registerIpc()

  // 1) Warten bis Node-RED erreichbar
  await waitForNodeRedReady({ path_: '/api/user', timeoutMs: 15000 })

  // 2) Erst jetzt die App in das Hauptfenster laden (damit nichts „im Hintergrund“ feuert)
  const isDev = !app.isPackaged || process.env.NODE_ENV === 'development' || process.env.ELECTRON_START_URL
  if (isDev) {
    await mainWindow.loadURL(process.env.ELECTRON_START_URL || 'http://localhost:3000')
  } else {
    await mainWindow.loadFile(path.join(__dirname, 'immo24-ui', 'dist', 'index.html'))
  }

  // 3) Picker öffnen und mit Userliste füttern
  const pw = createUserPickerWindow()
  const users = await getUsersFromNodeRed()
  pw.webContents.on('did-finish-load', () => {
    pw.webContents.send('users', users)
  })

  // 4) Splash schließen – Hauptfenster wird erst nach 'user-picked' gezeigt
  if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close()
})

app.on('window-all-closed', () => {
  if (nodeRedProcess) nodeRedProcess.kill()
  app.quit()
})
