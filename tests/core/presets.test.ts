/**
 * Prüft Store und Recall im neuen Backend.
 *
 * Teil 1 vergleicht mit der Referenz von Node-RED, die dort bekannten Fehler sind
 * hier bewusst korrigiert. Teil 2 prüft, was die Referenz nicht zeigen kann.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import test from 'node:test'

import { createConfigService } from '../../src/core/config.ts'
import { CoreError } from '../../src/core/errors.ts'
import { createPresetService, type IsProcessRunning } from '../../src/core/presets.ts'
import { createSessionService } from '../../src/core/session.ts'
import { createCoreRequest } from './adapter.ts'

const require = createRequire(import.meta.url)
const { createEnvironment, loadReference, seedConfigured, write } = require('../contract/harness.cjs')
const { runPresetsScenario } = require('../contract/scenarios/presets.cjs')

const USER = 'Tester'

test('verhält sich wie die Referenz, bis auf die bewussten Korrekturen', async (t) => {
  const env = createEnvironment({ seed: seedConfigured })
  t.after(() => env.cleanup())
  env.request = createCoreRequest(env.dirs.userData)

  await runPresetsScenario(env)

  const expected = loadReference('presets')
  const stepNamed = (name: string) => expected.find((step: { step: string }) => step.step === name)

  // Korrektur: Ohne Auswahl gibt es jetzt eine Antwort
  stepNamed('Hänger: nichts ausgewählt').response = { status: 400, body: { error: 'nothing_selected' } }
  stepNamed('Hänger: Soundminer ohne Auswahl').response = { status: 400, body: { error: 'nothing_selected' } }

  // Korrektur: Fade Presets ohne Quick meldeten einen Fehler, obwohl alles kopiert wurde
  const fades = stepNamed('Store alles, ohne Quick').response
  fades.status = 200
  Object.assign(fades.body, { overall: 'ok', details: [{ category: 'fadePresets', status: 'ok' }], message: 'Store erfolgreich' })

  // Korrektur: Der Recall der Keyboard Shortcuts las wegen eines Tippfehlers aus dem falschen Ordner
  const shortcuts = stepNamed('Recall keyboardShortcuts').response
  shortcuts.status = 200
  Object.assign(shortcuts.body, { overall: 'ok', details: [{ category: 'keyboardshortcuts', status: 'ok' }], message: 'Recall erfolgreich' })

  assert.deepEqual(JSON.parse(JSON.stringify(env.steps)), expected)
})

/** Baut den Dienst mit fertig eingerichteten Dummy-Daten und Anmeldung. */
async function setup(t: { after: (fn: () => void) => void }, isRunning: IsProcessRunning = async () => false) {
  const env = createEnvironment({ seed: seedConfigured })
  t.after(() => env.cleanup())
  const config = createConfigService(env.dirs.userData)
  const session = createSessionService(config)
  await session.login(USER)
  const presets = createPresetService(config, session, isRunning)
  return { dirs: env.dirs, presets, session, archive: path.join(env.dirs.mitarbeiter, USER, 'immo24') }
}

const recall = (key: string, quick = false) => ({ action: 'recall', categories: { cat: [{ key, quick }] } })
const hasCode = (code: string) => (error: unknown) => error instanceof CoreError && error.code === code

test('Keyboard Shortcuts kommen beim Recall wirklich an', async (t) => {
  const { dirs, presets, archive } = await setup(t)
  write(path.join(archive, 'keyboardshortcuts', 'Tasten.ptpreset'), 'tasten')

  const result = await presets.runProTools(recall('keyboardShortcuts'))

  assert.equal(result.overall, 'ok')
  const target = path.join(dirs.ptUser, 'Pro Tools Presets', 'Keyboard Shortcuts', USER, 'Tasten.ptpreset')
  assert.equal(fs.readFileSync(target, 'utf8'), 'tasten')
})

test('eine fehlende Quelle ist ein Hinweis, die anderen Kategorien laufen weiter', async (t) => {
  const { dirs, presets, archive } = await setup(t)
  write(path.join(archive, 'templates', 'Vorlage.ptxt'), 'vorlage')

  const result = await presets.runProTools({
    action: 'recall',
    categories: { cat1: [{ key: 'trackPresets' }, { key: 'templates' }] },
  })

  assert.deepEqual(result.details.map((detail) => [detail.category, detail.status]), [
    ['templates', 'ok'],
    ['trackpresets', 'partial'],
  ])
  assert.equal(result.overall, 'ok')
  assert.equal(result.message, 'Vorgang abgeschlossen – mit Hinweisen')
  // Der Hinweis nennt, was gefehlt hat, damit man damit etwas anfangen kann
  assert.match(result.details[1].note ?? '', /Nichts zu kopieren.*trackpresets/)
  assert.ok(fs.existsSync(path.join(dirs.ptUser, 'Session Templates', USER, 'Vorlage.ptxt')))
})

test('ein fehlender Fade-Ordner blockiert die anderen Ordner nicht', async (t) => {
  const { dirs, presets, archive } = await setup(t)
  write(path.join(archive, 'fadepresets', 'Fade In', 'Weich.fdpreset'), 'weich')

  const result = await presets.runProTools(recall('fadePresets'))

  assert.equal(result.details[0].status, 'partial')
  assert.ok(fs.existsSync(path.join(dirs.ptUser, 'Fade Presets', 'Fade In', 'Weich.fdpreset')))
})

test('ein echter Kopierfehler wird als Fehler mit Ursache gemeldet', async (t) => {
  const { dirs, presets, archive } = await setup(t)
  write(path.join(archive, 'templates', 'Vorlage.ptxt'), 'vorlage')
  // Eine Datei liegt dort, wo der Zielordner entstehen müsste
  write(path.join(dirs.ptUser, 'Session Templates'), 'keine Ablage')

  const result = await presets.runProTools(recall('templates'))

  assert.equal(result.overall, 'error')
  assert.equal(result.details[0].status, 'error')
  assert.ok(result.details[0].note)
})

test('Soundminer: bricht ab, solange das Programm läuft', async (t) => {
  const { dirs, presets, archive } = await setup(t, async (app) => app === 'soundminer')
  write(path.join(dirs.soundminer, 'Standard.tabstate'), 'layout')

  const result = await presets.runSoundminer({ action: 'store', categories: { cat1: [{ key: 'tablayouts' }] } })

  assert.equal(result.overall, 'error')
  assert.equal(result.details[0].category, 'preflight')
  assert.equal(fs.existsSync(path.join(archive, 'soundminer')), false)
})

test('Eingaben werden geprüft', async (t) => {
  const { presets, session } = await setup(t)
  await assert.rejects(presets.runProTools({ action: 'loeschen', categories: {} }), hasCode('invalid_action'))
  await assert.rejects(presets.runProTools({ action: 'store', categories: { cat: [{ key: 'pluginMaps' }] } }), hasCode('nothing_selected'))

  session.logout()
  await assert.rejects(presets.runProTools(recall('templates')), hasCode('not_logged_in'))
})
