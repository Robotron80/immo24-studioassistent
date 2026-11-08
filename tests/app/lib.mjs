/**
 * Hilfen für die App-Tests: Sie starten die echte App (ungepackt, aus dist/) mit
 * Beispieldaten und bedienen sie wie ein Mensch, mit Klicks und Tastendrücken.
 *
 * Die Steuerung läuft über das Chrome-DevTools-Protokoll (CDP): Electron öffnet mit
 * --remote-debugging-port einen Anschluss, über den wir jedes Fenster fernsteuern.
 * Aufgerufen von den Dateien tests/app/*.test.mjs, Start mit "npm run test:app".
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import electronPath from 'electron'

const REPO = path.resolve(import.meta.dirname, '../..')
const PORT = 9344

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Schreibt eine Datei und legt fehlende Ordner an. Objekte werden zu JSON. */
function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content, null, 2))
}

/** Das Session-Schema der Beispieldaten, passend zu Version 0.4 */
export const SESSION_SCHEMA = '{{projektname}} {{moid}} - {{produktionsstufe}} {{benutzer}} {{version}}{{anmerkung}}'

/**
 * Legt in einem leeren Ordner Beispieldaten an: Mitarbeiter Tester (TE) und Zweite (ZW),
 * zwei Kunden, drei Projekte und eine Vorlage. Admin-Passwort: "geheim".
 * Mit setup: false fehlen die Einstellungen, dann startet der Einrichtungsassistent.
 * Der Ordner wird nach dem Test wieder entfernt.
 */
export function createEnv(t, { setup = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'immo24-app-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const P = {
    mitarbeiter: path.join(dir, 'Mitarbeiter'),
    produktionen: path.join(dir, 'Produktionen'),
    stammdaten: path.join(dir, 'Stammdaten'),
    ptUser: path.join(dir, 'PT'),
    userData: path.join(dir, 'userdata'),
  }
  if (setup) {
    write(path.join(P.userData, 'path.json'), {
      PathMitarbeiter: P.mitarbeiter,
      PathProduktionen: P.produktionen,
      PathStammdaten: P.stammdaten,
      PathPTUser: P.ptUser,
    })
    write(path.join(P.userData, 'adminpw.json'), { password: 'geheim' })
    write(path.join(P.userData, 'config.json'), {
      modules: {
        umbenennen: { enabled: true },
        soundminer: { enabled: true, version: 'V6 Pro', supportPath: path.join(dir, 'SM') },
      },
    })
  }
  write(path.join(P.stammdaten, 'schemes.json'), {
    projektordnerSchema: '{{datum}} {{projektname}} {{moid}}',
    sessionSchema: SESSION_SCHEMA,
  })
  const ordner = [
    { name: '01_Material', label: 'Material', ist_Produktionsstufe: false },
    { name: '02_Dialog', label: 'Dialog', ist_Produktionsstufe: true },
  ]
  write(path.join(P.stammdaten, 'kunden_stammdaten.json'), [
    { kunde: 'KaBa & Entertainment', ordner },
    { kunde: 'Kundenzufriedenheit', ordner },
  ])
  write(path.join(P.mitarbeiter, 'Tester/immo24/immo24-user.json'), 'TE')
  write(path.join(P.mitarbeiter, 'Zweite/immo24/immo24-user.json'), 'ZW')
  write(path.join(P.mitarbeiter, 'Tester/immo24/templates/Dialog Vorlage.ptxt'), 'x')
  for (const [name, moid, date] of [
    ['Kakao-Produktion', 'GB2A', '2026-11-02'],
    ['Altes Projekt', 'NOID', '2026-03-14'],
    ['Noch eins', 'AB12', '2025-12-24'],
  ]) {
    write(path.join(P.produktionen, `KaBa & Entertainment/${date} ${name} ${moid}/immo24-proj.json`), {
      erstellt_am: date,
      kunde: 'KaBa & Entertainment',
      projektname: name,
      mo_id: moid,
      user: 'Tester',
    })
  }
  return { dir, P }
}

/**
 * Startet die App mit den Beispieldaten (vorher "npm run build") und beendet sie nach dem Test.
 * Liefert open(), um ein Fenster anhand seiner Adresse zu greifen, z. B. open('anmeldung').
 */
export async function launch(t, env) {
  const child = spawn(electronPath, ['.', `--remote-debugging-port=${PORT}`], {
    cwd: REPO,
    stdio: 'ignore',
    env: { ...process.env, IMMO24_USER_DATA: env.P.userData },
  })
  const exited = new Promise((resolve) => child.once('exit', resolve))
  t.after(async () => {
    child.kill()
    await exited
  })

  /** Alle offenen Fenster laut DevTools-Anschluss */
  const list = async () => {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
      return targets.filter((target) => target.type === 'page')
    } catch {
      return []
    }
  }

  /** Wartet auf ein Fenster, dessen Adresse den Text enthält, und verbindet sich damit. */
  async function open(match) {
    for (let i = 0; i < 150; i++) {
      const target = (await list()).find((entry) => entry.url.toLowerCase().includes(match))
      if (target) return connect(target.webSocketDebuggerUrl)
      await sleep(200)
    }
    throw new Error(`Fenster nicht gefunden: ${match}`)
  }

  return { open, list }
}

/** Verbindet sich mit einem Fenster und liefert Befehle zum Auslesen und Bedienen. */
async function connect(url) {
  const ws = new WebSocket(url)
  await new Promise((resolve) => (ws.onopen = resolve))
  let id = 0
  const pending = new Map()
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data)
    if (message.id) pending.get(message.id)?.(message)
  }
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const n = ++id
      pending.set(n, resolve)
      ws.send(JSON.stringify({ id: n, method, params }))
    })
  // Ohne das reagieren Felder in Fenstern im Hintergrund nicht auf Fokus
  await send('Emulation.setFocusEmulationEnabled', { enabled: true })

  const page = {
    send,
    /** Führt JavaScript im Fenster aus und liefert das Ergebnis zurück. */
    ev: async (expression) => {
      const message = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
      const failure = message.result?.exceptionDetails
      if (failure) throw new Error(`${expression.slice(0, 80)}: ${failure.exception?.description ?? 'Fehler'}`)
      return message.result?.result?.value
    },
    /** Speichert ein Bildschirmfoto, wenn IMMO24_SHOTS auf einen Ordner zeigt. */
    shot: async (name) => {
      const dir = process.env.IMMO24_SHOTS
      if (!dir) return
      fs.mkdirSync(dir, { recursive: true })
      const result = await send('Page.captureScreenshot', { format: 'png' })
      fs.writeFileSync(path.join(dir, `${name}.png`), Buffer.from(result.result.data, 'base64'))
    },
  }
  return Object.assign(page, uiHelpers(page))
}

/** Bedienhilfen: Felder über ihre Beschriftung finden, echte Klicks und Tastendrücke. */
function uiHelpers(page) {
  // Ein sichtbares Vuetify-Feld mit genau dieser Beschriftung (als JavaScript-Ausdruck)
  const box = (label) =>
    `[...document.querySelectorAll('.v-input')].filter(e => e.offsetParent !== null).find(e => [...e.querySelectorAll('label')].some(l => l.innerText.trim() === ${JSON.stringify(label)}))`
  const center = async (selector) =>
    JSON.parse(
      await page.ev(
        `(() => { const e = ${selector}; if (!e) return 'null'; const r = e.getBoundingClientRect(); return JSON.stringify({ x: r.left + r.width / 2, y: r.top + r.height / 2 }) })()`,
      ),
    )
  const clickAt = async (position) => {
    if (!position) throw new Error('Element nicht gefunden')
    for (const type of ['mousePressed', 'mouseReleased']) {
      await page.send('Input.dispatchMouseEvent', { type, ...position, button: 'left', clickCount: 1 })
    }
    await sleep(250)
  }
  // Während eine Seite neu lädt, gibt es kurz keinen body, dann zählt das als leer
  const text = () => page.ev("document.body?.innerText ?? ''")

  return {
    box,
    text,
    /** Wartet, bis der Text im Fenster steht (höchstens timeout ms). */
    waitForText: async (wanted, timeout = 8000) => {
      const end = Date.now() + timeout
      while (Date.now() < end) {
        if ((await text()).includes(wanted)) return true
        await sleep(150)
      }
      return false
    },
    clickField: async (label) => clickAt(await center(`${box(label)}?.querySelector('input')`)),
    keys: async (input) => {
      for (const ch of input) {
        await page.send('Input.dispatchKeyEvent', { type: 'keyDown', text: ch, key: ch })
        await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch })
        await sleep(25)
      }
      await sleep(150)
    },
    clickButton: async (label) =>
      clickAt(
        await center(
          `[...document.querySelectorAll('button')].filter(e => e.offsetParent !== null).find(e => e.innerText.trim() === ${JSON.stringify(label)})`,
        ),
      ),
    clickText: async (label) =>
      clickAt(
        await center(
          `[...document.querySelectorAll('label, .v-list-item, td, .v-tab')].filter(e => e.offsetParent !== null).find(e => e.innerText.trim() === ${JSON.stringify(label)})`,
        ),
      ),
    /** Öffnet eine Auswahlliste und wählt den Eintrag, der den Text enthält. */
    choose: async (label, option) => {
      await clickAt(await center(`${box(label)}?.querySelector('.v-field')`))
      await sleep(300)
      await clickAt(
        await center(
          `[...document.querySelectorAll('.v-overlay--active .v-list-item')].find(e => e.innerText.includes(${JSON.stringify(option)}))`,
        ),
      )
      await sleep(300)
    },
    value: (label) => page.ev(`${box(label)}?.querySelector('input')?.value`),
    dialog: () =>
      page.ev(
        `[...document.querySelectorAll('.v-dialog .v-card')].filter(e => e.offsetParent !== null).map(e => e.innerText).join(' ').replaceAll('\\n', ' | ')`,
      ),
  }
}

/** Meldet Tester an und liefert das Hauptfenster. */
export async function loginAsTester(app) {
  const login = await app.open('anmeldung')
  await sleep(900)
  await login.ev(`window.picker.choose('Tester'); 1`)
  const main = await app.open('projektanlage')
  await main.waitForText('Neues Projekt')
  await sleep(400)
  return main
}

/** Entsperrt im Hauptfenster die Konfiguration (Passwort der Beispieldaten). */
export async function unlockConfig(main) {
  await main.ev(`location.hash = '#/konfiguration'; 1`)
  await sleep(900)
  await main.clickField('Passwort')
  await main.keys('geheim')
  await main.clickButton('Entsperren')
  await sleep(700)
}
