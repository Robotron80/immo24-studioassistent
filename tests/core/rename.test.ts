/**
 * Prüft das Umbenennen von Projekten. Node-RED konnte das nicht, es gibt also keine
 * Referenz. Dafür sind die heiklen Fälle hier einzeln geprüft.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import test from 'node:test'

import { createConfigService } from '../../src/core/config.ts'
import { CoreError } from '../../src/core/errors.ts'
import { createProjectService } from '../../src/core/projects.ts'
import { createRenameService } from '../../src/core/rename.ts'
import { createSessionService } from '../../src/core/session.ts'
import { createStammdatenService } from '../../src/core/stammdaten.ts'

const require = createRequire(import.meta.url)
const { createEnvironment } = require('../contract/harness.cjs')
const { seed } = require('../contract/scenarios/projects.cjs')

const project = {
  kunde: 'Kunde A',
  datum: '2026-01-15',
  moid: 'AB12',
  projektname: 'Alt',
  stufe: '02_Dialogschnitt',
  stufeLabel: 'Dialog',
  template: 'Einzeln.ptxt',
}
const OLD = '2026-01-15 Alt AB12'
const NEW = '2026-01-15 Neu CD34'
const rename = {
  kunde: 'Kunde A',
  ordner: OLD,
  neuerName: 'Neu',
  neueMoid: 'CD34',
}

const hasCode = (code: string) => (error: unknown) => error instanceof CoreError && error.code === code

/** Fertige Umgebung mit angemeldetem Nutzer und einem vorhandenen Projekt. */
async function setup(t: { after: (fn: () => void) => void }, running = false) {
  const env = createEnvironment({ seed })
  t.after(() => env.cleanup())
  const config = createConfigService(env.dirs.userData)
  const session = createSessionService(config)
  await session.login('Tester')
  const projects = createProjectService(config, createStammdatenService(config), session)
  const service = createRenameService(config, session, async () => running)
  await projects.createProject(project)
  const customerDir = path.join(env.dirs.produktionen, 'Kunde A')
  return { config, projects, service, customerDir, meta: () => JSON.parse(fs.readFileSync(path.join(customerDir, NEW, 'immo24-proj.json'), 'utf8')) }
}

test('benennt Ordner und Metadaten um, Sessions bleiben unverändert', async (t) => {
  const { service, customerDir, meta } = await setup(t)

  const result = await service.rename(rename)

  assert.equal(result.nach, NEW)
  assert.equal(fs.existsSync(path.join(customerDir, OLD)), false)
  assert.equal(meta().projektname, 'Neu')
  assert.equal(meta().mo_id, 'CD34')
  assert.equal(meta().erstellt_am, '2026-01-15')
  assert.deepEqual(meta().umbenannt[0].von, { projektname: 'Alt', mo_id: 'AB12' })
  assert.ok(fs.existsSync(path.join(customerDir, NEW, '02_Dialogschnitt', `${OLD} - Dialog TE v1.ptx`)))
})

test('die nächste Session trägt den neuen Namen und zählt die Version weiter', async (t) => {
  const { projects, service } = await setup(t)
  await service.rename(rename)

  const next = await projects.addSession({ ...project, projektname: 'Neu', moid: 'CD34', ordner: NEW })

  assert.match(next.filename, /Neu CD34 - Dialog TE v2\.ptx$/)
})

test('die Vorschau ändert nichts', async (t) => {
  const { service, customerDir } = await setup(t)

  const preview = await service.preview(rename)

  assert.deepEqual(preview, { von: OLD, nach: NEW, gesperrt: [], proToolsLaeuft: false })
  assert.ok(fs.existsSync(path.join(customerDir, OLD)))
  assert.equal(fs.existsSync(path.join(customerDir, NEW)), false)
})

test('blockiert, solange Pro Tools hier läuft', async (t) => {
  const { service, customerDir } = await setup(t, true)
  await assert.rejects(service.rename(rename), hasCode('protools_laeuft'))
  assert.ok(fs.existsSync(path.join(customerDir, OLD)))
})

test('blockiert bei einer Sperrdatei, außer sie wurde als verwaist bestätigt', async (t) => {
  const { service, customerDir } = await setup(t)
  fs.writeFileSync(path.join(customerDir, OLD, '02_Dialogschnitt', 'session.tmp'), '')

  await assert.rejects(service.rename(rename), hasCode('session_offen'))
  assert.ok(fs.existsSync(path.join(customerDir, OLD)))
  assert.deepEqual((await service.preview(rename)).gesperrt, ['02_Dialogschnitt/session.tmp'])

  const result = await service.rename({ ...rename, trotzSperre: true })
  assert.equal(result.ok, true)
})

test('.tmp-Dateien in Audio Files gelten nicht als Sperre', async (t) => {
  const { service, customerDir } = await setup(t)
  const audio = path.join(customerDir, OLD, '02_Dialogschnitt', 'Audio Files')
  fs.mkdirSync(audio)
  fs.writeFileSync(path.join(audio, 'clip.tmp'), '')
  assert.deepEqual((await service.preview(rename)).gesperrt, [])
})

test('überschreibt kein vorhandenes Projekt', async (t) => {
  const { projects, service, customerDir } = await setup(t)
  await projects.createProject({ ...project, moid: 'CD34', projektname: 'Neu' })

  await assert.rejects(service.rename(rename), hasCode('project_exists'))
  assert.ok(fs.existsSync(path.join(customerDir, OLD)))
})

test('prüft die neuen Namen', async (t) => {
  const { service } = await setup(t)
  await assert.rejects(service.rename({ ...rename, neuerName: 'a:b' }), hasCode('validation_failed'))
  await assert.rejects(service.rename({ ...rename, neueMoid: '  ' }), hasCode('project_fields_missing'))
  await assert.rejects(service.rename({ ...rename, neuerName: 'Alt', neueMoid: 'AB12' }), hasCode('nichts_geaendert'))
  await assert.rejects(service.rename({ ...rename, ordner: 'Gibt es nicht' }), hasCode('not_found'))
  await assert.rejects(service.rename({ ...rename, ordner: '../Fremd' }), hasCode('not_found'))
})

test('MoID wird großgeschrieben, reine Änderung der Schreibweise funktioniert', async (t) => {
  const { projects, service, customerDir } = await setup(t)
  await projects.createProject({ ...project, moid: 'XY01', projektname: 'Klein' })

  const result = await service.rename({ ...rename, ordner: '2026-01-15 Klein XY01', neuerName: 'klein', neueMoid: 'xy01' })

  assert.equal(result.nach, '2026-01-15 klein XY01')
  assert.ok(fs.readdirSync(customerDir).includes('2026-01-15 klein XY01'))
  assert.ok(!fs.readdirSync(customerDir).includes('2026-01-15 Klein XY01'))
})

test('stellt den alten Namen wieder her, wenn die Metadaten nicht geschrieben werden können', { skip: process.platform === 'win32' }, async (t) => {
  // Eine schreibgeschützte Metadatei hindert das atomare Schreiben nicht, ein
  // schreibgeschützter Ordner schon. Unter Windows greift dieser Schutz so nicht.
  const { service, customerDir } = await setup(t)
  const projectDir = path.join(customerDir, OLD)
  fs.chmodSync(projectDir, 0o555)

  await assert.rejects(service.rename(rename))

  // Zuerst die Rechte zurückgeben, sonst kann der Test den Ordner nicht aufräumen
  const stillOld = fs.existsSync(projectDir)
  const movedToNew = fs.existsSync(path.join(customerDir, NEW))
  fs.chmodSync(stillOld ? projectDir : path.join(customerDir, NEW), 0o755)
  assert.ok(stillOld)
  assert.equal(movedToNew, false)
})

test('die neue MoID darf nicht vergeben sein, das Projekt selbst zählt nicht', async (t) => {
  const { projects, service } = await setup(t)
  await projects.createProject({ ...project, moid: 'ZZ01', projektname: 'Fremd' })

  await assert.rejects(service.rename({ ...rename, neueMoid: 'ZZ01' }), hasCode('moid_vergeben'))
  assert.equal((await service.rename({ ...rename, neueMoid: 'AB12', neuerName: 'Nur Name' })).nach, '2026-01-15 Nur Name AB12')
})

test('ein Projekt lässt sich auf "keine MoID" umstellen und zurück', async (t) => {
  const { service, customerDir } = await setup(t)

  const first = await service.rename({ ...rename, neuerName: 'Alt', neueMoid: '', ohneMoid: true })
  assert.equal(first.nach, '2026-01-15 Alt')
  assert.ok(fs.existsSync(path.join(customerDir, '2026-01-15 Alt')))

  const back = await service.rename({ ...rename, ordner: first.nach, neuerName: 'Alt', neueMoid: 'AB99' })
  assert.equal(back.nach, '2026-01-15 Alt AB99')
})

test('trifft bei gleichen Angaben genau das gewählte Projekt', async (t) => {
  const { config, service, customerDir } = await setup(t)
  const { version } = await config.getSchema()
  await config.saveSchema({
    version: version as string,
    data: { projektordnerSchema: '{{datum}} {{projektname}} {{moid}} {{benutzer}}', sessionSchema: '{{projektname}} {{version}}' },
  })
  // Zwei Kollegen, gleicher Name, gleiches Datum, beide mit dem alten Platzhalter NOID
  const meta = { erstellt_am: '2026-01-15', kunde: 'Kunde A', projektname: 'Zwilling', mo_id: 'NOID', user: 'Tester' }
  for (const kuerzel of ['AA', 'ZZ']) {
    fs.mkdirSync(path.join(customerDir, `2026-01-15 Zwilling NOID ${kuerzel}`))
    fs.writeFileSync(path.join(customerDir, `2026-01-15 Zwilling NOID ${kuerzel}`, 'immo24-proj.json'), JSON.stringify(meta))
  }

  const result = await service.rename({ ...rename, ordner: '2026-01-15 Zwilling NOID ZZ', neuerName: 'Neu', neueMoid: 'EF56' })

  assert.equal(result.nach, '2026-01-15 Neu EF56 ZZ')
  assert.ok(fs.existsSync(path.join(customerDir, '2026-01-15 Zwilling NOID AA')), 'das andere Projekt bleibt unberührt')
})

test('eine weitere MoID lässt sich nachträglich ergänzen', async (t) => {
  const { projects, service, customerDir } = await setup(t)

  const result = await service.rename({ ...rename, neuerName: 'Alt', neueMoid: 'ab12 cd34' })

  assert.equal(result.nach, '2026-01-15 Alt AB12+CD34')
  const meta = JSON.parse(fs.readFileSync(path.join(customerDir, result.nach, 'immo24-proj.json'), 'utf8'))
  assert.equal(meta.mo_id, 'AB12+CD34')
  // Auch nach dem Ergänzen zählt jede einzeln als vergeben
  await assert.rejects(projects.createProject({ ...project, moid: 'CD34', projektname: 'Neu2' }), hasCode('moid_vergeben'))
  // Und mit mehreren MoIDs lässt sich weiter umbenennen
  assert.equal((await service.rename({ ...rename, ordner: result.nach, neuerName: 'Fassungen', neueMoid: 'AB12+CD34' })).nach, '2026-01-15 Fassungen AB12+CD34')
})

test('ist standardmäßig aus und lässt sich einschalten', async (t) => {
  const { config, service } = await setup(t)
  assert.equal(await service.isEnabled(), false)
  const { version } = await config.getModules()
  await config.saveModules({ version, data: { umbenennen: { enabled: true } } })
  assert.equal(await service.isEnabled(), true)
})
