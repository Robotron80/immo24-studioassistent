/**
 * Test-Harness: die gemeinsame Werkbank aller Vergleichstests.
 *
 * Worum geht es?
 * Das alte Node-RED-Backend wird durch das neue Backend in src/core ersetzt.
 * Damit dabei nichts unbemerkt anders wird, spielen wir dieselben Abläufe
 * ("Szenarien") auf beiden Backends ab und vergleichen die Ergebnisse:
 *
 *   1. Node-RED spielt ein Szenario ab. Antworten und angelegte Dateien
 *      werden als Referenz in tests/contract/reference/ gespeichert.
 *   2. src/core spielt dasselbe Szenario ab und muss die Referenz treffen.
 *      Ausnahmen sind nur bewusste Fehlerkorrekturen (siehe tests/core/).
 *
 * Diese Datei stellt dafür bereit:
 *   - createEnvironment: legt einen leeren Test-Ordner mit Dummy-Daten an
 *   - startBackend:      startet zusätzlich das echte Node-RED
 *   - seedConfigured:    Dummy-Daten wie nach dem Einrichtungsassistenten
 *   - expectReference:   vergleicht ein Ergebnis mit der gespeicherten Referenz
 *
 * Jede Testdatei läuft in einem eigenen Prozess, weil Node-RED globalen
 * Zustand im Speicher hält, der sich sonst gegenseitig beeinflussen würde.
 *
 * Referenz neu schreiben (nur wenn sich das Node-RED-Verhalten ändern soll):
 *   UPDATE_REFERENCE=1 npm run test:contract
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const http = require('node:http')
const os = require('node:os')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '../..')
const REFERENCE_DIR = path.join(__dirname, 'reference')
// Antwortet das Backend so lange nicht, gilt die Anfrage als "hängt".
const HANG_TIMEOUT_MS = 3000
const SESSION_SCHEMA = '{{datum}} {{projektname}} {{moid}} - {{produktionsstufe}} {{benutzer}} {{version}}'

/** Schreibt eine Testdatei und legt fehlende Ordner vorher an. */
function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content, null, 2))
}

/**
 * Baut eine Funktion, die wechselnde Werte durch feste Platzhalter ersetzt.
 * Der Test-Ordner, das heutige Datum und Zeitstempel sind bei jedem Lauf anders.
 * Ohne Platzhalter würde der Vergleich mit der Referenz immer fehlschlagen.
 */
function createNormalizer(base) {
  const today = new Date().toISOString().slice(0, 10)
  // macOS meldet temporäre Ordner je nach Aufruf mit oder ohne /private davor.
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

/** Wendet die Platzhalter auf eine ganze Antwort an, auch auf verschachtelte Werte. */
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

/**
 * Legt den Test-Ordner an und bereitet das Protokoll eines Testlaufs vor.
 * Beide Backends nutzen dieselbe Umgebung, damit nur das Backend sich unterscheidet.
 *
 * request: die Funktion, die eine Anfrage an das jeweilige Backend stellt.
 *          Sie wird von startBackend (Node-RED) oder vom core-Test gesetzt.
 */
function createEnvironment({ seed } = {}) {
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
  // Diese drei Dateien legt auch die echte App beim ersten Start leer an.
  for (const file of ['path.json', 'config.json', 'adminpw.json']) write(path.join(dirs.userData, file), {})
  seed?.(dirs)

  const normalizeText = createNormalizer(base)
  const steps = []
  const env = { dirs, steps, request: null }

  /** Stellt eine Anfrage und schreibt Anfrage und Antwort ins Protokoll. */
  env.call = async (label, method, url, body) => {
    const response = await env.request(method, url, body)
    steps.push({ step: label, request: `${method} ${url}`, response: normalizeValue(response, normalizeText) })
    return response
  }

  /** Liest einen Ordner samt Dateiinhalten ein, ohne die Laufzeitdateien von Node-RED. */
  function tree(dir) {
    const files = {}
    const walk = (current) => {
      for (const name of fs.readdirSync(current).sort()) {
        const full = path.join(current, name)
        const rel = normalizeText(path.relative(base, full).replaceAll('\\', '/'))
        if (rel.startsWith('userdata/node-red') || rel.startsWith('userdata/.') || rel.startsWith('userdata/flows')) continue
        if (fs.statSync(full).isDirectory()) {
          files[`${rel}/`] = null
          walk(full)
        } else {
          // Windows schreibt Zeilenenden als \r\n: Für den Vergleich zählt nur der Inhalt
          files[rel] = normalizeText(fs.readFileSync(full, 'utf8')).replaceAll('\r\n', '\n')
        }
      }
    }
    walk(dir)
    return files
  }

  /** Hält im Protokoll fest, welche Dateien es zu diesem Zeitpunkt gibt. */
  env.snapshot = (label, ...roots) => {
    steps.push({ step: label, files: Object.assign({}, ...roots.map(tree)) })
  }

  /** Räumt den Test-Ordner wieder weg. */
  env.cleanup = () => fs.rmSync(base, { recursive: true, force: true })

  return env
}

/**
 * Startet das echte Node-RED wie in der App und verbindet es mit einer Umgebung.
 * Node-RED wird erst hier geladen, damit die core-Tests auch ohne es laufen.
 */
async function startBackend({ seed } = {}) {
  const express = require('express')
  const RED = require('node-red')
  const env = createEnvironment({ seed })
  const { dirs } = env

  process.env.IMMO24_USERDATA = dirs.userData
  process.env.NODE_RED_HOME = path.dirname(require.resolve('node-red/package.json'))

  // Schritt 1: Webserver auf einem freien Port starten
  const app = express()
  const server = http.createServer(app)
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const { port } = server.address()

  // Schritt 2: Die Flows rufen sich teils selbst über den festen Port 59593 auf.
  // Wir ersetzen ihn, damit die Tests nicht mit einer laufenden App kollidieren.
  const flowFile = path.join(dirs.userData, 'flows.json')
  const flows = fs.readFileSync(path.join(ROOT, 'assets/node-red/flows.json'), 'utf8')
  fs.writeFileSync(flowFile, flows.replaceAll('59593', String(port)))

  // Schritt 3: Node-RED mit denselben Einstellungen wie in der App starten
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

  /** Echte HTTP-Anfrage. Kommt keine Antwort, wird { hang: true } festgehalten. */
  env.request = async (method, url, body) => {
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

  // Schritt 4: Warten, bis die Flows geladen sind und antworten
  for (let attempt = 0; ; attempt++) {
    if ((await env.request('GET', '/api/ping')).status === 200) break
    assert.ok(attempt < 100, 'Flows müssen starten')
    await new Promise((resolve) => setTimeout(resolve, 100))
  }

  env.stop = async () => {
    await RED.stop()
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
    env.cleanup()
  }
  return env
}

/** Dummy-Daten wie nach dem Einrichtungsassistenten. */
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

/** Lädt die gespeicherte Referenz eines Szenarios. */
function loadReference(name) {
  return JSON.parse(fs.readFileSync(path.join(REFERENCE_DIR, `${name}.json`), 'utf8'))
}

/** Vergleicht Node-RED mit der Referenz, oder schreibt sie bei UPDATE_REFERENCE neu. */
function expectReference(name, steps) {
  const actual = JSON.parse(JSON.stringify(steps))
  if (process.env.UPDATE_REFERENCE) {
    fs.mkdirSync(REFERENCE_DIR, { recursive: true })
    fs.writeFileSync(path.join(REFERENCE_DIR, `${name}.json`), `${JSON.stringify(actual, null, 2)}\n`)
    return
  }
  assert.deepEqual(actual, loadReference(name))
}

module.exports = { createEnvironment, expectReference, loadReference, seedConfigured, startBackend, write }
