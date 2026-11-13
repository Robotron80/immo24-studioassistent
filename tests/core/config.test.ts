/**
 * Prüft das neue Backend für Konfiguration und Mitarbeiter.
 *
 * Teil 1 spielt dasselbe Szenario wie beim alten Backend ab und vergleicht mit der
 * Referenz. Teil 2 prüft, was die Referenz nicht zeigen kann, etwa fehlende Ordner.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { createConfigService } from '../../src/core/config.ts'
import { CoreError } from '../../src/core/errors.ts'
import { createPasswordService } from '../../src/core/password.ts'
import { createSessionService } from '../../src/core/session.ts'
import { createUserService } from '../../src/core/users.ts'
import { createCoreRequest } from './adapter.ts'

const require = createRequire(import.meta.url)
const { createEnvironment, loadReference } = require('../contract/harness.cjs')
const runConfigScenario = require('../contract/scenarios/config.cjs')

/** Legt für einen Test einen leeren Ordner an und räumt ihn danach wieder weg. */
function tempDir(t: { after: (fn: () => void) => void }): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'immo24-core-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  return dir
}

test('verhält sich wie die Referenz, bis auf die bewussten Korrekturen', async (t) => {
  const env = createEnvironment()
  t.after(() => env.cleanup())
  env.request = createCoreRequest(env.dirs.userData)

  await runConfigScenario(env)

  const expected = loadReference('config')

  // Korrektur: Node-RED antwortete hier gar nicht, jetzt gibt es eine klare Antwort
  const fixes: Record<string, unknown> = {
    // Korrektur: Ohne gesetztes Passwort ist die Konfiguration offen
    'Passwort: nichts gesetzt': { status: 200, body: { ok: true } },
    'Hänger: Mitarbeiterliste fehlt': { status: 400, body: { error: 'mitarbeiter array required' } },
    'Hänger: Mitarbeiter ohne Namen': {
      status: 200,
      body: { ok: true, results: [{ name: '', action: 'skipped:name-missing' }], count: 1 },
    },
  }
  for (const step of expected) {
    if (step.step in fixes) step.response = fixes[step.step]
  }

  const actual = JSON.parse(JSON.stringify(env.steps))
  assert.deepEqual(actual, expected)
})

test('das Passwort bleibt lesbar und lässt sich durch Löschen der Datei zurücksetzen', async (t) => {
  const dir = tempDir(t)
  const file = path.join(dir, 'adminpw.json')
  const passwords = createPasswordService(dir)

  await passwords.set({ newPassword: 'geheim', repeatPassword: 'geheim' })
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { password: 'geheim' })
  assert.equal(await passwords.isSet(), true)
  assert.equal(await passwords.check('falsch'), false)
  assert.equal(await passwords.check('geheim'), true)

  fs.rmSync(file)
  assert.equal(await passwords.isSet(), false)
  assert.equal(await passwords.check('egal'), true)
})

test('liest die Dateiformate früherer Versionen', async (t) => {
  for (const [content, isSet] of [
    ['{"password":"geheim"}', true],
    ['geheim', true],
    ['{}', false],
    ['', false],
  ] as const) {
    const dir = tempDir(t)
    fs.writeFileSync(path.join(dir, 'adminpw.json'), content)
    const passwords = createPasswordService(dir)
    assert.equal(await passwords.isSet(), isSet, content)
    if (isSet) assert.equal(await passwords.check('geheim'), true, content)
  }
})

test('überschreibt kein Namensschema, das ein anderer Rechner geändert hat', async (t) => {
  const dir = tempDir(t)
  fs.writeFileSync(path.join(dir, 'path.json'), JSON.stringify({ PathStammdaten: dir }))
  const file = path.join(dir, 'schemes.json')
  fs.writeFileSync(file, JSON.stringify({ projektordnerSchema: 'a', sessionSchema: 'b {{version}}' }))
  const config = createConfigService(dir)
  const data = { projektordnerSchema: 'neu', sessionSchema: 'neu {{version}}' }

  const { version } = await config.getSchema()
  const later = new Date(Date.now() + 60000)
  fs.utimesSync(file, later, later)

  await assert.rejects(
    config.saveSchema({ version: version as string, data }),
    (error: unknown) => error instanceof CoreError && error.code === 'version_conflict',
  )
  const fresh = await config.getSchema()
  await config.saveSchema({ version: fresh.version as string, data })
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).projektordnerSchema, 'neu')
})

test('hinterlässt beim Speichern keine temporären Dateien', async (t) => {
  const dir = tempDir(t)
  const config = createConfigService(dir)
  const { version } = await config.getPaths()
  await config.savePaths({ version, data: { PathMitarbeiter: 'a' } })
  assert.deepEqual(fs.readdirSync(dir), ['path.json'])
})

test('der Pfad für Standardvorlagen steht nur in path.json, wenn er gesetzt ist', async (t) => {
  // Ohne Standardvorlagen bleibt die Datei so, wie Version 0.4 sie kennt
  const dir = tempDir(t)
  const config = createConfigService(dir)
  const file = path.join(dir, 'path.json')
  const data = { PathMitarbeiter: 'a', PathProduktionen: 'b', PathStammdaten: 'c', PathPTUser: 'd' }

  const first = await config.savePaths({
    version: (await config.getPaths()).version,
    data: { ...data, PathStandardvorlagen: ' ' },
  })
  assert.equal('PathStandardvorlagen' in JSON.parse(fs.readFileSync(file, 'utf8')), false)

  await config.savePaths({ version: first.version, data: { ...data, PathStandardvorlagen: '/Vorlagen' } })
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).PathStandardvorlagen, '/Vorlagen')
  assert.equal((await config.getSetupStatus()).needsSetup, true, 'Schema fehlt noch, der Pfad ist aber kein Hindernis')
})

test('meldet einen fehlenden Mitarbeiter-Ordner, statt ihn anzulegen', async (t) => {
  // Ist der Share nicht eingehängt, dürfen keine Ordner an falscher Stelle entstehen
  const dir = tempDir(t)
  const missing = path.join(dir, 'nicht-eingehaengt')
  fs.writeFileSync(path.join(dir, 'path.json'), JSON.stringify({ PathMitarbeiter: missing }))
  const users = createUserService(createConfigService(dir))

  await assert.rejects(
    users.saveUsers({ mitarbeiter: [{ name: 'Max', kuerzel: 'MM' }] }),
    (error: unknown) => error instanceof CoreError && error.code === 'mitarbeiter_path_missing',
  )
  assert.equal(fs.existsSync(missing), false)
})

test('erkennt Umlaute unabhängig von der Schreibweise des Betriebssystems', async (t) => {
  // macOS liefert Umlaute oft als "a + Punkte" (NFD), Windows als ein Zeichen (NFC)
  const dir = tempDir(t)
  const staff = path.join(dir, 'Mitarbeiter')
  fs.mkdirSync(path.join(staff, 'Ärger'.normalize('NFD'), 'immo24'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'path.json'), JSON.stringify({ PathMitarbeiter: staff }))
  const users = createUserService(createConfigService(dir))

  await users.saveUsers({ mitarbeiter: [{ name: 'ärger'.normalize('NFC'), kuerzel: 'AE' }] })

  assert.equal(fs.readdirSync(staff).length, 1)
})

test('legt ohne aktives Soundminer-Modul keinen Soundminer-Ordner an', async (t) => {
  const dir = tempDir(t)
  const staff = path.join(dir, 'Mitarbeiter')
  fs.mkdirSync(staff)
  fs.writeFileSync(path.join(dir, 'path.json'), JSON.stringify({ PathMitarbeiter: staff }))
  const users = createUserService(createConfigService(dir))

  await users.saveUsers({ mitarbeiter: [{ name: 'Max', kuerzel: 'MM' }] })

  const folders = fs.readdirSync(path.join(staff, 'Max', 'immo24'))
  assert.ok(folders.includes('templates'))
  assert.ok(!folders.includes('soundminer'))
})

test('ergänzt bei der Anmeldung fehlende Ablageordner, ohne Vorhandenes anzufassen', async (t) => {
  const dir = tempDir(t)
  const staff = path.join(dir, 'Mitarbeiter')
  const meta = path.join(staff, 'Max', 'immo24')
  fs.mkdirSync(path.join(meta, 'templates'), { recursive: true })
  fs.writeFileSync(path.join(meta, 'templates', 'Vorlage.ptxt'), 'x')
  fs.writeFileSync(path.join(meta, 'immo24-user.json'), 'MM')
  fs.writeFileSync(path.join(dir, 'path.json'), JSON.stringify({ PathMitarbeiter: staff }))
  const users = createUserService(createConfigService(dir))

  await users.addMissingFolders('Max')
  const folders = fs.readdirSync(meta)
  assert.ok(folders.includes('trackpresets') && folders.includes('fadepresets'))
  assert.equal(fs.readFileSync(path.join(meta, 'templates', 'Vorlage.ptxt'), 'utf8'), 'x')

  // Ohne immo24-Ordner (etwa Share nicht eingehängt) entsteht nichts
  await users.addMissingFolders('Niemand')
  assert.equal(fs.existsSync(path.join(staff, 'Niemand')), false)
})

test('Mitarbeiternamen mit Pfadzeichen werden abgewiesen, ohne dass Ordner entstehen', async (t) => {
  const dir = tempDir(t)
  const staff = path.join(dir, 'Mitarbeiter')
  fs.mkdirSync(staff)
  fs.writeFileSync(path.join(dir, 'path.json'), JSON.stringify({ PathMitarbeiter: staff }))
  const users = createUserService(createConfigService(dir))

  for (const name of ['../Draußen', 'Max/Test', 'Max\\Test', 'Max:Test']) {
    await assert.rejects(
      users.saveUsers({
        mitarbeiter: [
          { name: 'Gut', kuerzel: 'GU' },
          { name, kuerzel: 'XX' },
        ],
      }),
      (error: unknown) => error instanceof CoreError && error.code === 'validation_failed',
    )
  }
  assert.deepEqual(fs.readdirSync(dir).sort(), ['Mitarbeiter', 'path.json'])
  assert.deepEqual(fs.readdirSync(staff), [], 'auch der gültige Name wird nicht angelegt')
})

test('anmelden kann sich nur, wer als Mitarbeiter ein Kürzel hat', async (t) => {
  const dir = tempDir(t)
  const staff = path.join(dir, 'Mitarbeiter')
  fs.mkdirSync(path.join(staff, 'Max', 'immo24'), { recursive: true })
  fs.writeFileSync(path.join(staff, 'Max', 'immo24', 'immo24-user.json'), 'MM')
  fs.mkdirSync(path.join(staff, 'Leer'))
  fs.writeFileSync(path.join(dir, 'path.json'), JSON.stringify({ PathMitarbeiter: staff }))
  const session = createSessionService(createConfigService(dir))

  assert.equal(await session.login('Max'), 'MM')
  for (const name of ['Leer', 'Gibtsnicht', '../Mitarbeiter/Max', '..']) {
    await assert.rejects(
      session.login(name),
      (error: unknown) => error instanceof CoreError && error.code === 'not_found',
    )
  }
})
