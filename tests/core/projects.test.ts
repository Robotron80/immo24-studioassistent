/**
 * Prüft Anmeldung, Stammdaten und Projektanlage im neuen Backend.
 *
 * Teil 1 vergleicht mit der Referenz von Node-RED. Die dort bekannten Fehler sind
 * hier bewusst korrigiert. Teil 2 prüft Fälle, die die Referenz nicht zeigen kann.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import test from 'node:test'

import { createConfigService } from '../../src/core/config.ts'
import { CoreError } from '../../src/core/errors.ts'
import { createProjectService } from '../../src/core/projects.ts'
import { createSessionService } from '../../src/core/session.ts'
import { createStammdatenService } from '../../src/core/stammdaten.ts'
import { createCoreRequest } from './adapter.ts'

const require = createRequire(import.meta.url)
const { createEnvironment, loadReference, seedConfigured } = require('../contract/harness.cjs')
const { runProjectsScenario, seed } = require('../contract/scenarios/projects.cjs')

const PROJECT_FOLDER = '2026-01-15 Testprojekt AB12'

test('verhält sich wie die Referenz, bis auf die bewussten Korrekturen', async (t) => {
  const env = createEnvironment({ seed })
  t.after(() => env.cleanup())
  env.request = createCoreRequest(env.dirs.userData)

  await runProjectsScenario(env)

  const expected = loadReference('projects')
  const stepNamed = (name: string) => expected.find((step: { step: string }) => step.step === name)
  const base = '<BASE>/Produktionen/Ohne Ordner'

  // Korrektur: Ein fehlender Kundenordner wird angelegt, das Projekt entsteht
  stepNamed('Hänger: Kundenordner fehlt').response = {
    status: 200,
    body: {
      ok: true,
      zielPfad: `${base}/${PROJECT_FOLDER}`,
      templateDest: `${base}/${PROJECT_FOLDER}/02_Dialogschnitt`,
      filename: '2026-01-15 Testprojekt AB12 - Dialog TE v1.ptx',
      kundenordnerAngelegt: true,
    },
  }

  // Korrektur: Kunde ohne Unterordner meldet einen Fehler, kein halbes Projekt bleibt zurück
  stepNamed('Hänger: Kunde ohne Unterordner').response = {
    status: 400,
    body: { error: 'kunde_ohne_unterordner' },
  }
  stepNamed('Liste: leerer Kunde').response = { status: 200, body: [] }

  // Vereinheitlicht: "nicht angemeldet" ist immer null, Node-RED lieferte teils einen leeren Text
  stepNamed('Nicht angemeldet').response = { status: 200, body: null }

  // Vereinheitlicht: Neue und vorhandene Projekte nennen fehlende Felder in derselben Reihenfolge
  stepNamed('Vorhanden: Felder fehlen').response.body.fields = ['datum', 'moid', 'projektname', 'stufe', 'template']

  // In den Datei-Listen dasselbe nachziehen: Das halbe Projekt fehlt, das neue kommt dazu
  for (const name of ['Nach Neuanlage', 'Nach Folgeversionen']) {
    const { files } = stepNamed(name)
    delete files[`Produktionen/Ohne Unterordner/${PROJECT_FOLDER}/`]
    delete files[`Produktionen/Ohne Unterordner/${PROJECT_FOLDER}/immo24-proj.json`]
    Object.assign(files, {
      [`Produktionen/Ohne Ordner/`]: null,
      [`Produktionen/Ohne Ordner/${PROJECT_FOLDER}/`]: null,
      [`Produktionen/Ohne Ordner/${PROJECT_FOLDER}/01_Material/`]: null,
      [`Produktionen/Ohne Ordner/${PROJECT_FOLDER}/02_Dialogschnitt/`]: null,
      [`Produktionen/Ohne Ordner/${PROJECT_FOLDER}/02_Dialogschnitt/${PROJECT_FOLDER} - Dialog TE v1.ptx`]: 'einzeln',
      [`Produktionen/Ohne Ordner/${PROJECT_FOLDER}/10_Mischung/`]: null,
      [`Produktionen/Ohne Ordner/${PROJECT_FOLDER}/immo24-proj.json`]:
        files[`Produktionen/Kunde A/${PROJECT_FOLDER}/immo24-proj.json`].replace('Kunde A', 'Ohne Ordner'),
    })
  }

  const actual = JSON.parse(JSON.stringify(env.steps))
  assert.deepEqual(actual, expected)
})

/** Baut alle Dienste für einen Test mit fertig eingerichteten Dummy-Daten und Anmeldung. */
async function setup(t: { after: (fn: () => void) => void }) {
  const env = createEnvironment({ seed })
  t.after(() => env.cleanup())
  const config = createConfigService(env.dirs.userData)
  const stammdaten = createStammdatenService(config)
  const session = createSessionService(config)
  const projects = createProjectService(config, stammdaten, session)
  await session.login('Tester')
  return { env, dirs: env.dirs, projects, session, stammdaten }
}

const project = {
  kunde: 'Kunde A',
  datum: '2026-01-15',
  moid: 'AB12',
  projektname: 'Testprojekt',
  stufe: '02_Dialogschnitt',
  stufeLabel: 'Dialog',
  template: 'Einzeln.ptxt',
}

const hasCode = (code: string) => (error: unknown) => error instanceof CoreError && error.code === code

test('Punkte im Projektnamen kürzen den Sessionnamen nicht ab', async (t) => {
  // Node-RED schnitt alles ab dem letzten Punkt ab: Aus "Spot v1.2" wurde "...Spot v1.ptx"
  const { projects } = await setup(t)
  const created = await projects.createProject({ ...project, projektname: 'Spot v1.2' })
  assert.equal(created.filename, '2026-01-15 Spot v1.2 AB12 - Dialog TE v1.ptx')

  const next = await projects.addSession({ ...project, projektname: 'Spot v1.2' })
  assert.match(next.filename, /Spot v1\.2 AB12 - Dialog TE v2\.ptx$/)
})

test('legt nichts an, wenn der Produktionen-Ordner fehlt', async (t) => {
  // So sieht es aus, wenn der Share nicht eingehängt ist
  const { dirs, projects, stammdaten } = await setup(t)
  fs.rmSync(dirs.produktionen, { recursive: true })

  await assert.rejects(projects.createProject({ ...project, kunde: 'Ohne Ordner' }), hasCode('produktionen_path_missing'))
  assert.equal(fs.existsSync(dirs.produktionen), false)

  const { version, customers } = await stammdaten.getSnapshot()
  await assert.rejects(stammdaten.saveSnapshot({ version, customers }), hasCode('produktionen_path_missing'))
  assert.equal(fs.existsSync(dirs.produktionen), false)
})

test('räumt auf, wenn beim Anlegen etwas schiefgeht', async (t) => {
  const { dirs, projects } = await setup(t)
  // Ein Ordner mit .ptxt-Endung besteht die Prüfung, das Kopieren schlägt aber fehl
  fs.mkdirSync(path.join(dirs.mitarbeiter, 'Tester', 'immo24', 'templates', 'Kaputt.ptxt'))

  await assert.rejects(projects.createProject({ ...project, template: 'Kaputt.ptxt' }))
  assert.equal(fs.existsSync(path.join(dirs.produktionen, 'Kunde A', PROJECT_FOLDER)), false)
  assert.equal(fs.existsSync(path.join(dirs.produktionen, 'Kunde A')), true, 'der Kundenordner bestand vorher schon')

  // Ein extra dafür angelegter Kundenordner verschwindet wieder
  await assert.rejects(projects.createProject({ ...project, kunde: 'Ohne Ordner', template: 'Kaputt.ptxt' }))
  assert.equal(fs.existsSync(path.join(dirs.produktionen, 'Ohne Ordner')), false)

  // Danach klappt derselbe Versuch: Kein Rest blockiert die Wiederholung
  const retry = await projects.createProject(project)
  assert.equal(retry.ok, true)
})

test('meldet fehlende Vorlage und unbekannte Stufe, ohne etwas anzulegen', async (t) => {
  const { dirs, projects } = await setup(t)
  await assert.rejects(projects.createProject({ ...project, template: 'Gibtsnicht.ptxt' }), hasCode('template_missing'))
  await assert.rejects(projects.createProject({ ...project, stufe: 'Gibtsnicht' }), hasCode('stufe_unbekannt'))
  assert.equal(fs.existsSync(path.join(dirs.produktionen, 'Kunde A', PROJECT_FOLDER)), false)
})

test('liest Stammdaten frisch, ohne dass vorher die Kundenliste geladen wurde', async (t) => {
  // Node-RED kannte die Unterordner erst nach einem Aufruf der Kundenliste
  const { dirs, projects } = await setup(t)
  await projects.createProject(project)
  assert.equal(fs.existsSync(path.join(dirs.produktionen, 'Kunde A', PROJECT_FOLDER, '01_Material')), true)
})

test('Projektanlage und Vorlagen erfordern eine Anmeldung', async (t) => {
  const { projects, session } = await setup(t)
  session.logout()
  await assert.rejects(projects.createProject(project), hasCode('not_logged_in'))
  await assert.rejects(projects.listTemplates(), hasCode('not_logged_in'))
})

test('eine fehlende Stammdaten-Datei ergibt eine leere Kundenliste', async (t) => {
  const env = createEnvironment({ seed: seedConfigured })
  t.after(() => env.cleanup())
  fs.rmSync(path.join(env.dirs.stammdaten, 'kunden_stammdaten.json'))
  const stammdaten = createStammdatenService(createConfigService(env.dirs.userData))
  assert.deepEqual(await stammdaten.listForSelection(), [])
})
