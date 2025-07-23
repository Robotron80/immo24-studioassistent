const { app, BrowserWindow } = require('electron')
const path = require('path')
const { spawn } = require('child_process')
const http = require('http')
const fs = require('fs')

let nodeRedProcess
let mainWindow

function ensureUserJsonFiles() {
	const basePath = app.getPath('userData') // Plattformübergreifender User-Ordner
	const srcDir = path.join(__dirname, 'assets') // Pfad mit Default-Files
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

// Hilfsfunktion: Warte, bis Node-RED-Port erreichbar ist
function waitForPort(port, host = 'localhost', path_ = '/', timeout = 15000) {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const check = () => {
      const req = http.request({ host, port, path: path_, method: 'HEAD' }, res => {
        resolve()
      })
      req.on('error', () => {
        if (Date.now() - start > timeout) {
          reject(new Error('Timeout waiting for port'))
        } else {
          setTimeout(check, 250)
        }
      })
      req.end()
    }
    check()
  })
}

function startNodeRED() {
  const nodeRedDir = path.join(__dirname, 'node-red-portable')
  const redJs = path.join(nodeRedDir, 'node_modules', 'node-red', 'red.js')
  const isWin = process.platform === 'win32'
  const nodeBinary = isWin
    ? path.join(__dirname, 'bin', 'node.exe')
    : path.join(__dirname, 'bin', 'node')

  console.log("Starte Node-RED!")
  console.log("Node-Binary:", nodeBinary)
  console.log("redJs:", redJs)
  console.log("nodeRedDir:", nodeRedDir)
//  console.log("CWD:", nodeRedDir);
//  console.log("ENV:", {
//    ...process.env,
//    APP_VERSION: app.getVersion()
//};

  if (!fs.existsSync(nodeBinary)) {
    console.error("Node-Binary NICHT gefunden!")
    app.quit()
    return
  }
  if (!fs.existsSync(redJs)) {
    console.error("red.js NICHT gefunden!")
    app.quit()
    return
  }

  // UserData-BasePath speichern (wie bisher)
  const basePath = app.getPath('userData')
  const configPath = path.join(basePath, 'AppBasePath.json')
  fs.writeFileSync(configPath, JSON.stringify({ AppBasePath: basePath }, null, 2))

  console.log('App-Version, die an Node-RED übergeben wird:', app.getVersion());

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

  nodeRedProcess.stdout.on('data', (data) => {
    console.log(`[Node-RED] ${data}`)
  })
  nodeRedProcess.stderr.on('data', (data) => {
    console.error(`[Node-RED ERROR] ${data}`)
  })
  nodeRedProcess.on('error', (err) => {
    console.error('[Node-RED SPAWN ERROR]', err)
  })
  nodeRedProcess.on('exit', (code, signal) => {
    console.log(`[Node-RED EXIT] code: ${code}, signal: ${signal}`)
  })
}


function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 900,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      nodeIntegration: true, // Für preload.js!
      contextIsolation: false
    }
  });
  // Lade erst mal eine Lade-HTML (local)
  mainWindow.loadFile(path.join(__dirname, 'assets', 'loading.html'));
}

//function createWindow() {
//  mainWindow = new BrowserWindow({
//    width: 1200,
//    height: 900,
//    icon: path.join(__dirname, 'assets', 'icon.png'),
//    webPreferences: {
//      nodeIntegration: false,
//      contextIsolation: true,
//    }
//  })
//  mainWindow.loadURL('http://localhost:1880/dashboard')
//}

//app.whenReady().then(() => {
//  ensureUserJsonFiles()
//  startNodeRED()
//  waitForPort(1880)
//    .then(createWindow)
//    .catch(err => {
//      console.error('Node-RED-Port ist nicht erreichbar:', err)
//      app.quit()
//    })
//})

function waitForDashboard() {
  const url = 'http://127.0.0.1:1880/dashboard';
  const maxTries = 80; // 20 Sekunden (bei 250ms)
  let tries = 0;

  function check() {
    const http = require('http');
    const req = http.request({host: "127.0.0.1", port: 1880, path: "/dashboard", method: 'HEAD'}, res => {
	  console.log('Dashboard ist jetzt erreichbar!');
      mainWindow.loadURL(url); // Dashboard ist erreichbar!
    });
    req.on('error', () => {
      tries++;
      if (tries < maxTries) setTimeout(check, 250);
      else {
        // Nach 20s Fehlermeldung anzeigen
        mainWindow.webContents.executeJavaScript('document.body.innerHTML="<div style=\'color:red;font-size:1.2em;\'>Dashboard nicht erreichbar!</div>"');
      }
    });
    req.end();
  }
  check();
}

// …in app.whenReady():
app.whenReady().then(() => {
  ensureUserJsonFiles();
  startNodeRED();
  createWindow();
  waitForDashboard();
});

//app.whenReady().then(() => {
//  ensureUserJsonFiles()
//  startNodeRED()
//  setTimeout(() => {
//  console.log('Erzeuge jetzt das BrowserWindow...');
//  createWindow();
//  console.log('BrowserWindow wurde erzeugt (Befehl ausgeführt)');
//}, 10000); // 10 Sekunden warten, dann Fenster öffnen
//})
//

app.on('window-all-closed', () => {
  if (nodeRedProcess) nodeRedProcess.kill()
  app.quit()
})
