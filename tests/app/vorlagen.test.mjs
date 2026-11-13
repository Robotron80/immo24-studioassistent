/**
 * App-Test: Standardvorlagen. Ist in den Pfaden ein Ordner dafür gesetzt, stehen seine
 * Vorlagen mit dem Zusatz "Standard" in der Auswahl und lassen sich wie eigene benutzen.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import { createEnv, launch, loginAsTester, waitFor } from './lib.mjs'

test('neues Projekt aus einer Standardvorlage', async (t) => {
  const env = createEnv(t)
  // Ordner für Standardvorlagen anlegen und in die Pfade eintragen
  const standard = path.join(env.dir, 'Standardvorlagen')
  fs.mkdirSync(standard)
  fs.writeFileSync(path.join(standard, 'Dialog Vorlage.ptxt'), 'standard')
  const pathsFile = path.join(env.P.userData, 'path.json')
  const paths = JSON.parse(fs.readFileSync(pathsFile, 'utf8'))
  fs.writeFileSync(pathsFile, JSON.stringify({ ...paths, PathStandardvorlagen: standard }))

  const app = await launch(t, env)
  const main = await loginAsTester(app)
  const today = new Date().toLocaleDateString('sv')

  await main.choose('Kunde', 'KaBa')
  await main.clickField('Mo-ID')
  await main.keys('zv01')
  await main.clickField('Projektname')
  await main.keys('Standard')
  await main.choose('Produktionsstufe', 'Dialog')
  // Gleicher Name wie die eigene Vorlage: Der Zusatz unterscheidet sie
  await main.choose('Template', 'Dialog Vorlage (Standard)')
  await main.clickButton('Projekt anlegen')

  const session = path.join(
    env.P.produktionen,
    `KaBa & Entertainment/${today} Standard ZV01/02_Dialog/Standard ZV01 - Dialog TE v1.ptx`,
  )
  assert.ok(await waitFor(() => fs.existsSync(session)))
  assert.equal(fs.readFileSync(session, 'utf8'), 'standard', 'Kopie der Standardvorlage, nicht der eigenen Vorlage')
})
