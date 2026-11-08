/**
 * App-Test: die wichtigsten Abläufe im Produktionsbuch, auf den Seiten Pro Tools und
 * Soundminer und in der Konfiguration. Läuft gegen die echte App mit Beispieldaten.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import { createEnv, launch, loginAsTester, sleep, unlockConfig } from './lib.mjs'

test('Produktionsbuch, Presets und Konfiguration', async (t) => {
  const env = createEnv(t)
  const app = await launch(t, env)
  const main = await loginAsTester(app)
  const today = new Date().toLocaleDateString('sv')
  const kaba = path.join(env.P.produktionen, 'KaBa & Entertainment')
  await main.shot('01-produktionsbuch')

  await t.test('neues Projekt mit zwei Mo-IDs', async () => {
    await main.choose('Kunde', 'KaBa')
    await main.clickField('Mo-ID')
    await main.keys('ef56 gh78')
    await main.clickField('Projektname')
    await main.keys('Fassungen')
    await main.choose('Produktionsstufe', 'Dialog')
    await main.choose('Template', 'Dialog Vorlage')
    await main.clickButton('Projekt anlegen')
    await sleep(1000)
    const session = path.join(kaba, `${today} Fassungen EF56+GH78/02_Dialog/Fassungen EF56+GH78 - Dialog TE v1.ptx`)
    assert.ok(fs.existsSync(session))
    await main.clickButton('Schließen')
    await sleep(400)
  })

  await t.test('doppelte Mo-ID führt zum vorhandenen Projekt', async () => {
    await main.clickField('Mo-ID')
    await main.keys('gb2a')
    await main.clickField('Projektname')
    await main.keys('Versuch')
    await main.clickButton('Projekt anlegen')
    await sleep(800)
    const conflict = await main.dialog()
    assert.match(conflict, /GB2A/)
    assert.match(conflict, /Kakao-Produktion/)
    await main.clickButton('Zum Projekt')
    await sleep(900)
    const selected = await main.ev(`document.querySelector('.project-row--selected')?.innerText ?? ''`)
    assert.match(selected, /Kakao-Produktion/)
  })

  await t.test('Projekt ohne Mo-ID', async () => {
    await main.clickButton('Neues Projekt')
    await sleep(300)
    await main.clickButton('Zurücksetzen')
    await sleep(300)
    await main.choose('Kunde', 'KaBa')
    await main.clickText('keine Mo-ID')
    await main.clickField('Projektname')
    await main.keys('Ohne Datenbank')
    await main.choose('Produktionsstufe', 'Dialog')
    await main.choose('Template', 'Dialog Vorlage')
    await main.clickButton('Projekt anlegen')
    await sleep(1000)
    assert.ok(fs.existsSync(path.join(kaba, `${today} Ohne Datenbank`)))
    await main.clickButton('Schließen')
    await sleep(300)
  })

  await t.test('Kalender beginnt mit Montag und schreibt JJJJ-MM-TT', async () => {
    await main.clickButton('Zurücksetzen')
    await sleep(300)
    await main.ev(`document.querySelector('[aria-label="Kalender öffnen"]').click(); 1`)
    await sleep(500)
    const weekdays = await main.ev(
      `[...document.querySelectorAll('.v-date-picker-month__weekday')].map(e => e.innerText.trim()).join(',')`,
    )
    assert.match(weekdays, /^M/)
    await main.ev(
      `[...document.querySelectorAll('.v-date-picker-month__day button')].find(e => e.innerText.trim() === '15').click(); 1`,
    )
    await sleep(400)
    assert.match((await main.value('Datum')) ?? '', /^\d{4}-\d{2}-15$/)
  })

  await t.test('Pro Tools und Soundminer zeigen ihre Seiten', async () => {
    await main.ev(`location.hash = '#/protools'; 1`)
    assert.ok(await main.waitForText('Pro Tools'))
    assert.match(await main.text(), /Pro Tools (läuft|nicht geöffnet)/)
    await main.shot('02-protools')
    await main.ev(`location.hash = '#/soundminer'; 1`)
    assert.ok(await main.waitForText('Tab Layouts'))
  })

  await t.test('Konfiguration lässt sich entsperren und zeigt alle Bereiche', async () => {
    await unlockConfig(main)
    assert.ok(!(await main.text()).includes('Konfiguration entsperren'))
    for (const tab of ['Produktionsbuch', 'Mitarbeiter', 'Namensschema', 'Pfade', 'Module', 'Passwort']) {
      await main.clickText(tab)
      await sleep(400)
      await main.shot(`03-konfig-${tab.toLowerCase()}`)
    }
  })
})
