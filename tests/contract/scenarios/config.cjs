/**
 * Szenario: Ersteinrichtung und Konfiguration.
 *
 * Spielt der Reihe nach ab, was der Einrichtungsassistent und das
 * Konfigurationsmenü tun: Pfade, Namensschema, Passwort, Module, Mitarbeiter.
 * Dasselbe Szenario läuft gegen Node-RED (tests/contract/config.test.cjs)
 * und gegen das neue Backend (tests/core/config.test.ts).
 */
const path = require('node:path')

module.exports = async function runConfigScenario({ call, dirs, snapshot }) {
  await call('Bereit', 'GET', '/api/ping')
  await call('Noch nicht eingerichtet', 'GET', '/api/initialize')

  // Pfade: Jede Änderung muss die aktuelle Version mitschicken. So fällt auf,
  // wenn ein anderes Fenster die Daten zwischenzeitlich geändert hat.
  const paths = await call('Pfade leer', 'GET', '/api/paths')
  const data = {
    PathMitarbeiter: dirs.mitarbeiter,
    PathProduktionen: dirs.produktionen,
    PathStammdaten: dirs.stammdaten,
    PathPTUser: dirs.ptUser,
    Unbekannt: 'wird verworfen',
  }
  await call('Pfade: kaputter Body', 'PUT', '/api/paths', { data })
  await call('Pfade: Versionskonflikt', 'PUT', '/api/paths', { version: 'alt', data })
  const saved = await call('Pfade speichern', 'PUT', '/api/paths', { version: paths.body.version, data })
  await call('Pfade: alte Version erneut', 'PUT', '/api/paths', { version: paths.body.version, data })
  await call('Pfade lesen', 'GET', '/api/paths')
  await call('Pfade: neue Version gilt', 'PUT', '/api/paths', { version: saved.body.version, data })
  await call('Pfade da, Schema fehlt', 'GET', '/api/initialize')

  // Namensschema
  const schema = await call('Schema fehlt', 'GET', '/api/schema')
  await call('Schema: kaputter Body', 'PUT', '/api/schema', { projektordnerSchema: 'x' })
  await call('Schema speichern', 'PUT', '/api/schema', {
    version: schema.body.version ?? '',
    data: {
      projektordnerSchema: '{{datum}} {{projektname}} {{moid}}',
      sessionSchema: '{{projektname}} {{moid}} {{version}}',
    },
  })
  await call('Schema lesen', 'GET', '/api/schema')

  // Passwort des Konfigurationsmenüs
  await call('Passwort: nichts gesetzt', 'POST', '/api/check-password', { password: 'geheim' })
  await call('Passwort: fehlt', 'POST', '/api/check-password', {})
  await call('Passwort setzen: Felder fehlen', 'POST', '/api/adminpw', { newPassword: 'geheim' })
  await call('Passwort setzen: ungleich', 'POST', '/api/adminpw', { newPassword: 'geheim', repeatPassword: 'anders' })
  await call('Passwort setzen', 'POST', '/api/adminpw', { newPassword: 'geheim', repeatPassword: 'geheim' })
  await call('Passwort: richtig', 'POST', '/api/check-password', { password: 'geheim' })
  await call('Passwort: falsch', 'POST', '/api/check-password', { password: 'falsch' })

  // Module
  const modules = await call('Module leer', 'GET', '/api/modules')
  const soundminer = { enabled: 1, version: 'V6 Pro', supportPath: path.join(dirs.soundminer), extra: 'weg' }
  await call('Module: kaputter Body', 'PUT', '/api/modules', { data: {} })
  await call('Module: Version fehlt', 'PUT', '/api/modules', { version: '', data: {} })
  await call('Module: Versionskonflikt', 'PUT', '/api/modules', { version: 'alt', data: {} })
  await call('Module speichern', 'PUT', '/api/modules', {
    version: modules.body.version,
    data: { soundminer, anderes: { a: 1, liste: [1] } },
  })
  await call('Module lesen', 'GET', '/api/modules')

  // Mitarbeiter
  await call('Mitarbeiter leer', 'GET', '/api/user')
  await call('Hänger: Mitarbeiterliste fehlt', 'POST', '/api/user', {})
  await call('Mitarbeiter anlegen', 'POST', '/api/user', {
    mitarbeiter: [
      { name: 'Zweite', kuerzel: 'ZW' },
      { name: 'Ärger', kuerzel: ' AE ' },
    ],
  })
  await call('Hänger: Mitarbeiter ohne Namen', 'POST', '/api/user', { mitarbeiter: [{ name: '', kuerzel: 'NN' }] })
  await call('Mitarbeiter: Kürzel ändern, andere Schreibweise', 'POST', '/api/user', {
    mitarbeiter: [{ name: 'zweite', kuerzel: 'Z2' }],
  })
  await call('Mitarbeiter lesen', 'GET', '/api/user')

  await call('Eingerichtet', 'GET', '/api/initialize')
  snapshot('Dateien', dirs.userData, dirs.mitarbeiter, dirs.stammdaten)
}
