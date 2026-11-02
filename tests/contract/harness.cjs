/**
 * Hält das Verhalten des Node-RED-Backends als Referenz fest.
 * Jede Testdatei läuft in einem eigenen Prozess, weil Node-RED globalen Zustand hält.
 * Referenz neu schreiben: UPDATE_REFERENCE=1 npm run test:contract
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const http = require('node:http')
const os = require('node:os')
const path = require('node:path')
const express = require('express')
const RED = require('node-red')

const ROOT = path.resolve(__dirname, '../..')
const REFERENCE_DIR = path.join(__dirname, 'reference')
const HANG_TIMEOUT_MS = 3000
const SESSION_SCHEMA = '{{datum}} {{projektname}} {{moid}} - {{produktionsstufe}} {{benutzer}} {{version}}'

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content, null, 2))
}

/** Pfade, Zeitstempel und Job-IDs ersetzen, damit die Referenz auf jedem System gleich ist. */
function createNormalizer(base) {
  const today = new Date().toISOString().slice(0, 10)
  const realBase = fs.realpathSync(base)
  const forms = [...new Set([base, realBase])].flatMap((b) => [b, b.replaceAll('\\', '/'), JSON.stringify(b).slice(1, -1)])
  return function normalizeText(text) {
    let out = String(text)
    for (const form of forms) out = out.replaceAll(form, '<BASE>')
    return out
      .replace(/<BASE>[^\s"]*/g, (match) => match.replaceAll('\\\\', '/').replaceAll('\\', '/'))
      .replace(/\b\d{13}\b/g, '<VERSION>')
      .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z/g, '<TIME>')
      .replaceAll(today, '<TODAY>')
  }
}

function normalizeValue(value, normalizeText) {
  if (typeof value === 'string') return normalizeText(value)
  if (Array.isArray(value)) return value.map((item) => normalizeValue(item, normalizeText))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      key,
      key === 'jobId' || key === 'id' ? '<ID>' : normalizeValue(item, normalizeText),
    ]))
  }
  return value
}

async function startBackend({ seed } = {}) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'immo24-contract-'))
  const dirs = {
    base,
    userData: path.join(base, 'userdata'),
    produktionen: path.join(base, 'Produktionen'),
    mitarbeiter: path.join(base, 'Mitarbeiter'),
    stammdaten: path.join(base, 'Stammdaten'),
    ptUser: path.join(base, 'ProToolsUser'),
    soundminer: path.join(base, 'SoundminerSupport'),
  }
  for (const dir of Object.values(dirs)) fs.mkdirSync(dir, { recursive: true })
  for (const file of ['path.json', 'config.json', 'adminpw.json']) write(path.join(dirs.userData, file), {})
  seed?.(dirs)

  const normalizeText = createNormalizer(base)
  process.env.IMMO24_USERDATA = dirs.userData
  process.env.NODE_RED_HOME = path.dirname(require.resolve('node-red/package.json'))

  const app = express()
  const server = http.createServer(app)
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const { port } = server.address()

  const flowFile = path.join(dirs.userData, 'flows.json')
  const flows = fs.readFileSync(path.join(ROOT, 'assets/node-red/flows.json'), 'utf8')
  fs.writeFileSync(flowFile, flows.replaceAll('59593', String(port)))

  await RED.init(server, {
    httpAdminRoot: false,
    userDir: path.join(dirs.userData, 'node-red'),
    flowFile,
    coreNodesDir: path.dirname(require.resolve('@node-red/nodes/package.json')),
    logging: { console: { level: 'off' } },
    functionGlobalContext: {},
    contextStorage: { default: { module: 'memory' } },
    editorTheme: { disableEditor: true },
    externalModules: { palette: { allowInstall: false } },
  })
  app.use(RED.httpNode)
  await RED.start()

  const steps = []

  /** Echte Antwort; ein Hänger wird als { hang: true } festgehalten. */
  async function request(method, url, body) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}${url}`, {
        method,
        headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(HANG_TIMEOUT_MS),
      })
      const text = await res.text()
      let parsed = text
      try {
        parsed = JSON.parse(text)
      } catch {
        // kein JSON: Rohtext behalten
      }
      return { status: res.status, body: parsed }
    } catch (error) {
      if (error.name === 'TimeoutError') return { hang: true }
      throw error
    }
  }

  // Warten, bis die Flows geladen sind
  for (let attempt = 0; ; attempt++) {
    if ((await request('GET', '/api/ping')).status === 200) break
    assert.ok(attempt < 100, 'Flows müssen starten')
    await new Promise((resolve) => setTimeout(resolve, 100))
  }

  async function call(label, method, url, body) {
    const response = await request(method, url, body)
    steps.push({ step: label, request: `${method} ${url}`, response: normalizeValue(response, normalizeText) })
    return response
  }

  function tree(dir) {
    const files = {}
    const walk = (current) => {
      for (const name of fs.readdirSync(current).sort()) {
        const full = path.join(current, name)
        const rel = normalizeText(path.relative(base, full).replaceAll('\\', '/'))
        if (fs.statSync(full).isDirectory()) {
          files[`${rel}/`] = null
          walk(full)
        } else {
          files[rel] = normalizeText(fs.readFileSync(full, 'utf8'))
        }
      }
    }
    walk(dir)
    return files
  }

  function snapshot(label, ...roots) {
    steps.push({ step: label, files: Object.assign({}, ...roots.map(tree)) })
  }

  async function stop() {
    await RED.stop()
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
    fs.rmSync(base, { recursive: true, force: true })
  }

  return { dirs, call, snapshot, steps, stop }
}

/** Standard-Einrichtung wie nach dem Einrichtungsassistenten. */
function seedConfigured(dirs) {
  write(path.join(dirs.userData, 'path.json'), {
    PathMitarbeiter: dirs.mitarbeiter,
    PathProduktionen: dirs.produktionen,
    PathStammdaten: dirs.stammdaten,
    PathPTUser: dirs.ptUser,
  })
  write(path.join(dirs.userData, 'adminpw.json'), { password: 'geheim' })
  write(path.join(dirs.userData, 'config.json'), {
    modules: { soundminer: { enabled: true, version: 'V6 Pro', supportPath: dirs.soundminer } },
  })
  write(path.join(dirs.stammdaten, 'schemes.json'), {
    projektordnerSchema: '{{datum}} {{projektname}} {{moid}}',
    sessionSchema: SESSION_SCHEMA,
  })
  const ordner = [
    { name: '01_Material', label: 'Material', ist_Produktionsstufe: false },
    { name: '02_Dialogschnitt', label: 'Dialog', ist_Produktionsstufe: true },
    { name: '10_Mischung', label: 'Mischung', ist_Produktionsstufe: true },
  ]
  write(path.join(dirs.stammdaten, 'kunden_stammdaten.json'), [
    { kunde: 'Kunde A', ordner },
    { kunde: 'Ohne Ordner', ordner },
    { kunde: 'Ohne Unterordner', ordner: [] },
  ])
  fs.mkdirSync(path.join(dirs.produktionen, 'Kunde A'))
  fs.mkdirSync(path.join(dirs.produktionen, 'Ohne Unterordner'))
  // immo24-user.json enthält das Kürzel als reinen Text, nicht als JSON
  write(path.join(dirs.mitarbeiter, 'Tester', 'immo24', 'immo24-user.json'), 'TE')
  write(path.join(dirs.mitarbeiter, 'Zweite', 'immo24', 'immo24-user.json'), 'ZW')
  write(path.join(dirs.mitarbeiter, 'Ohne Kuerzel', 'immo24', 'immo24-user.json'), '')
  write(path.join(dirs.mitarbeiter, '.versteckt', 'immo24', 'immo24-user.json'), 'XX')
}

function expectReference(name, steps) {
  const file = path.join(REFERENCE_DIR, `${name}.json`)
  const actual = JSON.parse(JSON.stringify(steps))
  if (process.env.UPDATE_REFERENCE) {
    fs.mkdirSync(REFERENCE_DIR, { recursive: true })
    fs.writeFileSync(file, `${JSON.stringify(actual, null, 2)}\n`)
    return
  }
  assert.deepEqual(actual, JSON.parse(fs.readFileSync(file, 'utf8')))
}

module.exports = { expectReference, seedConfigured, startBackend, write }
