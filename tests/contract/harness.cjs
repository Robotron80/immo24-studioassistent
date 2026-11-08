/**
 * Test-Harness: die gemeinsame Werkbank der Vergleichstests.
 *
 * Worum geht es?
 * Das alte Node-RED-Backend von Version 0.4 wurde durch das neue Backend in src/core
 * ersetzt. Damit dabei nichts unbemerkt anders wurde, hat Node-RED dieselben Abläufe
 * ("Szenarien") einmal abgespielt. Seine Antworten und die angelegten Dateien liegen als
 * Referenz in tests/contract/reference/. Node-RED selbst ist inzwischen entfernt, die
 * Referenz bleibt als fester Stand: Die Tests in tests/core spielen dieselben Szenarien
 * auf src/core ab und müssen sie treffen. Ausnahmen sind nur bewusste Fehlerkorrekturen.
 *
 * Diese Datei stellt dafür bereit:
 *   - createEnvironment: legt einen leeren Test-Ordner mit Dummy-Daten an
 *   - seedConfigured:    Dummy-Daten wie nach dem Einrichtungsassistenten
 *   - loadReference:     liest die gespeicherte Referenz eines Szenarios
 */
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const REFERENCE_DIR = path.join(__dirname, 'reference')
// Schritte mit "Hänger" im Namen antworten bekanntlich nie, dort warten wir nur kurz.
// Alle anderen dürfen länger dauern: Windows braucht z. B. für die PowerShell-Abfrage
// des Soundminer-Status mehrere Sekunden.
const KNOWN_HANG_TIMEOUT_MS = 3000
const REQUEST_TIMEOUT_MS = 30000
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
  const forms = [...new Set([base, realBase])].flatMap((b) => [
    b,
    b.replaceAll('\\', '/'),
    JSON.stringify(b).slice(1, -1),
  ])
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
  if (typeof value === 'string') {
    // Ein ganzer Wert, der ein Pfad ist: Windows-Trenner vereinheitlichen, auch nach Leerzeichen
    const text = normalizeText(value)
    return text.startsWith('<BASE>') ? text.replaceAll('\\', '/') : text
  }
  if (Array.isArray(value)) return value.map((item) => normalizeValue(item, normalizeText))
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        key === 'jobId' || key === 'id' ? '<ID>' : normalizeValue(item, normalizeText),
      ]),
    )
  }
  return value
}

/**
 * Legt den Test-Ordner an und bereitet das Protokoll eines Testlaufs vor.
 * Beide Backends nutzen dieselbe Umgebung, damit nur das Backend sich unterscheidet.
 *
 * request: die Funktion, die eine Anfrage an das jeweilige Backend stellt.
 *          Sie wird vom core-Test gesetzt (tests/core/adapter.ts).
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
    const timeout = label.startsWith('Hänger') ? KNOWN_HANG_TIMEOUT_MS : REQUEST_TIMEOUT_MS
    const response = await env.request(method, url, body, timeout)
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
        if (rel.startsWith('userdata/.')) continue
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
/**
 * Liest die Antworten von Version 0.4. Eine bewusste Vereinfachung gilt für alle Tests:
 * Die Einrichtungsprüfung antwortet nur noch mit needsSetup (ja/nein) statt mit acht
 * Feldern, und "Schema fehlt" nennt keinen Einrichtungsstatus mehr.
 */
function loadReference(name) {
  const steps = JSON.parse(fs.readFileSync(path.join(REFERENCE_DIR, `${name}.json`), 'utf8'))
  for (const step of steps) {
    const info = step.response?.body?.initialize
    if (!info) continue
    if (step.request === 'GET /api/initialize') {
      step.response = { status: 200, body: { needsSetup: info.needsUserAction } }
    } else {
      delete step.response.body.initialize
    }
  }
  return steps
}

module.exports = { createEnvironment, loadReference, seedConfigured, write }
