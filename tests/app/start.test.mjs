/**
 * App-Test: Programmstart. Ohne Einstellungen erscheint der Einrichtungsassistent,
 * bei der Anmeldung entstehen fehlende Ablageordner.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import { createEnv, launch, loginAsTester, waitFor } from './lib.mjs'

test('ohne Einstellungen startet der Einrichtungsassistent', async (t) => {
  const env = createEnv(t, { setup: false })
  const app = await launch(t, env)
  const wizard = await app.open('setupwizard')
  assert.ok((await wizard.text()) !== undefined)
  const pages = (await app.list()).map((page) => page.url)
  assert.ok(!pages.some((url) => url.includes('anmeldung')), 'keine Anmeldung')
})

test('bei der Anmeldung entstehen fehlende Ablageordner', async (t) => {
  const env = createEnv(t)
  const meta = path.join(env.P.mitarbeiter, 'Tester/immo24')
  assert.equal(fs.existsSync(path.join(meta, 'trackpresets')), false)

  const app = await launch(t, env)
  await loginAsTester(app)

  await waitFor(() => fs.existsSync(path.join(meta, 'trackpresets')))
  const folders = fs.readdirSync(meta)
  for (const folder of [
    'clipeffectspresets',
    'fadepresets',
    'pluginsettings',
    'soundminer',
    'templates',
    'trackpresets',
  ]) {
    assert.ok(folders.includes(folder), folder)
  }
  assert.equal(fs.readFileSync(path.join(meta, 'templates/Dialog Vorlage.ptxt'), 'utf8'), 'x', 'Vorlage unverändert')
  assert.deepEqual(fs.readdirSync(path.join(env.P.mitarbeiter, 'Zweite/immo24')), ['immo24-user.json'])
})
