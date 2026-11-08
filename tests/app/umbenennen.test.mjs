/**
 * App-Test: ein Projekt umbenennen, von der Eingabe über die Vorschau bis zum Ordner.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import { createEnv, launch, loginAsTester, sleep, waitFor } from './lib.mjs'

test('Projekt umbenennen mit Vorschau', async (t) => {
  const env = createEnv(t)
  const kaba = path.join(env.P.produktionen, 'KaBa & Entertainment')
  const app = await launch(t, env)
  const main = await loginAsTester(app)

  await main.clickButton('Vorhandenes Projekt')
  await main.choose('Kunde', 'KaBa')
  await main.ev(
    `[...document.querySelectorAll('tr.project-row')].find(r => r.innerText.includes('Noch eins')).querySelector('button').click(); 1`,
  )
  assert.ok(await main.waitForText('Projekt umbenennen'))
  await sleep(500) // Einblenden des Dialogs abwarten

  // Neuen Namen eintippen: hinten an den alten Namen anhängen
  await main.clickField('Neuer Projektname')
  await main.keys(' neu')
  await main.clickButton('Prüfen')
  assert.ok(await main.waitForText('wird zu'))
  const text = await main.text()
  assert.ok(text.includes('2025-12-24 Noch eins AB12'), 'alter Ordner in der Vorschau')
  assert.ok(text.includes('2025-12-24 Noch eins neu AB12'), 'neuer Ordner in der Vorschau')

  // Läuft auf diesem Rechner Pro Tools, sperrt die App das Umbenennen. Dann prüfen wir die Sperre.
  if (text.includes('Pro Tools läuft auf diesem Rechner')) {
    const disabled = await main.ev(
      `[...document.querySelectorAll('button')].find(e => e.innerText.trim() === 'Umbenennen')?.disabled`,
    )
    assert.equal(disabled, true, 'Umbenennen ist gesperrt, solange Pro Tools läuft')
    t.diagnostic('Pro Tools läuft: nur die Sperre geprüft, nicht das Umbenennen selbst')
    return
  }

  await main.clickText('Das Projekt ist auf keinem anderen Rechner geöffnet')
  await main.clickButton('Umbenennen')
  const renamed = path.join(kaba, '2025-12-24 Noch eins neu AB12')
  assert.ok(await waitFor(() => fs.existsSync(renamed)))
  assert.equal(fs.existsSync(path.join(kaba, '2025-12-24 Noch eins AB12')), false)
  const meta = JSON.parse(fs.readFileSync(path.join(renamed, 'immo24-proj.json'), 'utf8'))
  assert.equal(meta.projektname, 'Noch eins neu')
})
