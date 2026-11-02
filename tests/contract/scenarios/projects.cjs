/**
 * Szenario: Anmeldung, Stammdaten und Projektanlage.
 *
 * Läuft gegen Node-RED (tests/contract/projects.test.cjs) und gegen das neue
 * Backend (tests/core/projects.test.ts). Schritte mit "Hänger" im Namen sind
 * bekannte Fehler: Dort antwortet Node-RED nie, das neue Backend meldet sich.
 */
const fs = require('node:fs')
const path = require('node:path')
const { seedConfigured, write } = require('../harness.cjs')

/** Dummy-Daten: die Standard-Einrichtung plus Vorlagen und ein paar Sonderfälle. */
function seed(dirs) {
  seedConfigured(dirs)
  const templates = path.join(dirs.mitarbeiter, 'Tester', 'immo24', 'templates')
  write(path.join(templates, 'Einzeln.ptxt'), 'einzeln')
  write(path.join(templates, 'keine-vorlage.txt'), 'x')
  write(path.join(templates, 'Paket', 'Paket.ptxt'), 'paket')
  write(path.join(templates, 'Paket', 'Audio Files', 'clip.wav'), 'audio')
  fs.mkdirSync(path.join(templates, 'Leerer Ordner'))
  // Ordner ohne Metadatei und mit kaputter Metadatei tauchen nicht in der Liste auf
  fs.mkdirSync(path.join(dirs.produktionen, 'Kunde A', 'Fremder Ordner'))
  write(path.join(dirs.produktionen, 'Kunde A', 'Kaputt', 'immo24-proj.json'), 'kein json')
  write(path.join(dirs.produktionen, 'Kunde A', 'lose-datei.txt'), 'x')
}

/** Ein gültiges Projekt, von dem einzelne Tests nur abweichende Felder ändern. */
const project = (overrides = {}) => ({
  kunde: 'Kunde A',
  datum: '2026-01-15',
  moid: 'AB12',
  projektname: 'Testprojekt',
  stufe: '02_Dialogschnitt',
  stufeLabel: 'Dialog',
  template: 'Einzeln.ptxt',
  ...overrides,
})

async function runProjectsScenario({ call, dirs, snapshot }) {
  // Anmeldung
  await call('Start', 'GET', '/api/initialize')
  await call('Mitarbeiterliste', 'GET', '/api/user')
  await call('Nicht angemeldet', 'GET', '/api/activeUser')
  await call('Anmelden', 'POST', '/api/login', { user: 'Tester' })
  await call('Angemeldet', 'GET', '/api/activeUser')

  // Stammdaten
  const pb = await call('Stammdaten lesen', 'GET', '/api/pb/snapshot')
  await call('Stammdaten: kaputter Body', 'PUT', '/api/pb/snapshot', { customers: [] })
  await call('Stammdaten: Versionskonflikt', 'PUT', '/api/pb/snapshot', { version: 'alt', customers: [] })
  await call('Stammdaten speichern, neuer Kunde legt Ordner an', 'PUT', '/api/pb/snapshot', {
    version: pb.body.version,
    customers: [...pb.body.customers, { kunde: 'Neu: Kunde', ordner: [] }, { kunde: 'kunde a', ordner: [] }, { kunde: 'Älter', ordner: [] }],
  })
  await call('Stammdaten erneut lesen', 'GET', '/api/pb/snapshot')
  snapshot('Nach Stammdaten', dirs.stammdaten, dirs.produktionen)
  fs.writeFileSync(path.join(dirs.stammdaten, 'kunden_stammdaten.json'), JSON.stringify(pb.body.customers))
  // Nur dieser Ordner fehlt, wie bei einem Kunden, der von Hand in die Stammdaten kam
  fs.rmSync(path.join(dirs.produktionen, 'Ohne Ordner'), { recursive: true })

  // Auswahllisten
  await call('Kunden und Stufen', 'GET', '/api/projektanlage/kunden')
  await call('Vorlagen', 'GET', '/api/projektanlage/templates')

  // Neues Projekt
  await call('Neu: Felder fehlen', 'POST', '/api/projektanlage/projekte', { kunde: 'Kunde A' })
  await call('Neu: Windows-Namen ungültig', 'POST', '/api/projektanlage/projekte', project({ projektname: 'a:b.', moid: 'CON' }))
  await call('Neu: einzelne Vorlage', 'POST', '/api/projektanlage/projekte', project())
  await call('Neu: Duplikat', 'POST', '/api/projektanlage/projekte', project())
  await call('Neu: Paket mit Audio', 'POST', '/api/projektanlage/projekte', project({
    moid: 'CD34',
    projektname: 'Mit Clips',
    stufe: '10_Mischung',
    stufeLabel: 'Mischung',
    template: 'Paket',
  }))
  await call('Neu: Umlaute', 'POST', '/api/projektanlage/projekte', project({ moid: 'EF56', projektname: 'Größe äöü' }))

  // Bekannte Fehler: Node-RED antwortet nie, das neue Backend meldet einen Fehler
  await call('Hänger: Kundenordner fehlt', 'POST', '/api/projektanlage/projekte', project({ kunde: 'Ohne Ordner' }))
  await call('Hänger: Kunde ohne Unterordner', 'POST', '/api/projektanlage/projekte', project({ kunde: 'Ohne Unterordner', stufe: 'x' }))
  snapshot('Nach Neuanlage', dirs.produktionen)

  // Vorhandene Projekte
  await call('Liste: Kunde fehlt', 'GET', '/api/projektanlage/projekte')
  await call('Liste', 'GET', `/api/projektanlage/projekte?kunde=${encodeURIComponent('Kunde A')}`)
  await call('Liste: leerer Kunde', 'GET', `/api/projektanlage/projekte?kunde=${encodeURIComponent('Ohne Unterordner')}`)

  const existing = (overrides) => project({ ...overrides })
  await call('Vorhanden: Felder fehlen', 'POST', '/api/projektanlage/resolve-existing', { kunde: 'Kunde A' })
  await call('Vorhanden: ungültiger Name', 'POST', '/api/projektanlage/resolve-existing', existing({ moid: 'a?b' }))
  await call('Vorhanden: nicht gefunden', 'POST', '/api/projektanlage/resolve-existing', existing({ moid: 'ZZ99' }))
  await call('Vorhanden: nächste Version gleiche Stufe', 'POST', '/api/projektanlage/resolve-existing', existing())
  await call('Vorhanden: nächste Version erneut', 'POST', '/api/projektanlage/resolve-existing', existing())
  await call('Vorhanden: andere Stufe', 'POST', '/api/projektanlage/resolve-existing', existing({ stufe: '10_Mischung', stufeLabel: 'Mischung' }))
  await call('Vorhanden: Paket', 'POST', '/api/projektanlage/resolve-existing', existing({ template: 'Paket' }))
  snapshot('Nach Folgeversionen', dirs.produktionen)

  // Abmelden
  await call('Abmelden', 'POST', '/api/logout')
  await call('Abgemeldet', 'GET', '/api/activeUser')
}

module.exports = { runProjectsScenario, seed }
