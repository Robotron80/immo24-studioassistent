/**
 * App-Test: Änderungen in der Konfiguration erkennen und speichern. Die Bereiche
 * nutzen dafür den gemeinsamen Ablauf aus src/renderer/composables/useKonfigBereich.ts.
 * Nach dem Speichern schließt sich das Fenster, deshalb prüfen wir danach die Dateien.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import { SESSION_SCHEMA, createEnv, launch, loginAsTester, sleep, unlockConfig, waitFor } from './lib.mjs'

test('Mitarbeiter und Namensschema ändern und speichern', async (t) => {
  const env = createEnv(t)
  const app = await launch(t, env)
  const main = await loginAsTester(app)
  await unlockConfig(main)

  // Neuer Mitarbeiter: erst ein unzulässiger Name, dann ein gültiger
  await main.clickText('Mitarbeiter')
  await sleep(400)
  await main.clickButton('Neuer Mitarbeiter')
  await sleep(400)
  await main.clickField('Name')
  await main.keys('Max/Test')
  await main.clickField('Kürzel')
  await main.keys('MT')
  await main.clickButton('Anlegen')
  await sleep(300)
  assert.match(await main.dialog(), /Unzulässige Zeichen: \//)
  await main.ev(
    `(() => { const i = ${main.box('Name')}.querySelector('input'); i.value = ''; i.dispatchEvent(new Event('input')); return 1 })()`,
  )
  await main.clickField('Name')
  await main.keys('Neu')
  await main.clickButton('Anlegen')
  await sleep(400)
  assert.ok((await main.text()).includes('Neu'))

  // Namensschema: Text anhängen
  await main.clickText('Namensschema')
  await sleep(400)
  await main.ev(
    `(() => { const i = ${main.box('Session‑Schema')}.querySelector('input'); i.value = i.value + ' Test'; i.dispatchEvent(new Event('input')); return 1 })()`,
  )
  await sleep(200)

  await main.clickButton('Speichern')

  const meta = path.join(env.P.mitarbeiter, 'Neu/immo24')
  const schemaFile = path.join(env.P.stammdaten, 'schemes.json')
  const readSchema = () => JSON.parse(fs.readFileSync(schemaFile, 'utf8')).sessionSchema
  assert.ok(await waitFor(() => fs.existsSync(path.join(meta, 'trackpresets')) && readSchema() !== SESSION_SCHEMA))
  assert.equal(fs.readFileSync(path.join(meta, 'immo24-user.json'), 'utf8'), 'MT')
  assert.ok(fs.existsSync(path.join(meta, 'trackpresets')), 'Ablageordner angelegt')
  assert.equal(fs.existsSync(path.join(env.P.mitarbeiter, 'Max')), false, 'kein Ordner aus dem unzulässigen Namen')
  assert.equal(readSchema(), `${SESSION_SCHEMA} Test`)
})

test('ohne Änderung schreibt Speichern nichts', async (t) => {
  const env = createEnv(t)
  const schemaFile = path.join(env.P.stammdaten, 'schemes.json')
  const before = fs.statSync(schemaFile).mtimeMs
  const app = await launch(t, env)
  const main = await loginAsTester(app)
  await unlockConfig(main)
  // Alle Bereiche einmal öffnen, damit sie ihren Stand laden
  for (const tab of ['Produktionsbuch', 'Mitarbeiter', 'Namensschema', 'Pfade', 'Module']) {
    await main.clickText(tab)
    await sleep(300)
  }
  await main.clickButton('Speichern')
  // Ohne Änderung schließt das Fenster sofort, danach darf sich nichts getan haben
  await waitFor(async () => !(await app.list()).some((page) => page.url.includes('projektanlage')), 5000)
  await sleep(500)
  assert.equal(fs.statSync(schemaFile).mtimeMs, before)
  assert.deepEqual(fs.readdirSync(env.P.mitarbeiter).sort(), ['Tester', 'Zweite'])
})
