/**
 * App-Test: das Feld Anmerkung. Es erscheint nur mit {{anmerkung}} im Session-Schema,
 * zählt Sessions mit Anmerkung mit und meldet unzulässige Zeichen.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import { SESSION_SCHEMA, createEnv, launch, loginAsTester, sleep, unlockConfig } from './lib.mjs'

test('Anmerkung beim Anlegen einer weiteren Session', async (t) => {
  const env = createEnv(t)
  // In Pro Tools per "Speichern unter" entstanden: Version 3 mit Anmerkung
  const stage = path.join(env.P.produktionen, 'KaBa & Entertainment/2026-11-02 Kakao-Produktion GB2A/02_Dialog')
  fs.mkdirSync(stage, { recursive: true })
  fs.writeFileSync(path.join(stage, 'Kakao-Produktion GB2A - Dialog TE v3 nach Absturz.ptx'), 'x')

  const app = await launch(t, env)
  const main = await loginAsTester(app)

  await main.clickButton('Vorhandenes Projekt')
  await main.choose('Kunde', 'KaBa')
  await sleep(400)
  await main.ev(`[...document.querySelectorAll('tr.project-row')].find(r => r.innerText.includes('Kakao')).click(); 1`)
  await sleep(300)
  await main.choose('Produktionsstufe', 'Dialog')
  await main.choose('Template', 'Dialog Vorlage')
  await main.clickField('Anmerkung (optional)')
  await main.keys('Kurzversion')
  await main.clickButton('Projekt anlegen')
  await sleep(1000)

  const files = fs.readdirSync(stage)
  assert.ok(files.includes('Kakao-Produktion GB2A - Dialog TE v4 Kurzversion.ptx'), files.join(' | '))
  await main.clickButton('Schließen')
  await sleep(300)
  assert.equal(await main.value('Anmerkung (optional)'), '', 'gilt nur für eine Session')

  await main.clickField('Anmerkung (optional)')
  await main.keys('a/b')
  await sleep(200)
  assert.match(await main.ev(`${main.box('Anmerkung (optional)')}.innerText`), /Unzulässige/)

  await unlockConfig(main)
  await main.clickText('Namensschema')
  await sleep(500)
  const text = await main.text()
  assert.ok(text.includes('{{anmerkung}}'), 'Platzhalter wird angeboten')
  assert.ok(text.includes('v3 Kurzversion'), 'Vorschau mit Leerzeichen vor der Anmerkung')
})

test('Feld Anmerkung nur mit Platzhalter im Schema', async (t) => {
  const env = createEnv(t)
  const schemaFile = path.join(env.P.stammdaten, 'schemes.json')
  const withoutNote = SESSION_SCHEMA.replace('{{anmerkung}}', '')
  const writeSchema = (sessionSchema) =>
    fs.writeFileSync(
      schemaFile,
      JSON.stringify({ projektordnerSchema: '{{datum}} {{projektname}} {{moid}}', sessionSchema }),
    )
  writeSchema(withoutNote)

  const app = await launch(t, env)
  const main = await loginAsTester(app)
  const hasField = async () => (await main.text()).includes('Anmerkung (optional)')
  assert.equal(await hasField(), false)

  // Wie beim Schließen der Konfiguration: Das Hauptfenster lädt die Einstellungen neu
  writeSchema(SESSION_SCHEMA)
  await main.ev(
    `document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('Projektanlage').refreshAfterConfig().then(() => 1)`,
  )
  await sleep(600)
  assert.equal(await hasField(), true)

  writeSchema(withoutNote)
  await main.ev(`location.reload(); 1`)
  await sleep(1800)
  assert.equal(await hasField(), false)
})
