/**
 * Der Zugang der Oberfläche zum Backend.
 *
 * Statt einer Web-Adresse ruft die Oberfläche hier normale Funktionen auf. Der Aufruf
 * geht über die Brücke in preload.ts zum Hauptprozess (src/main/backend.ts) und von
 * dort in die Fachlogik (src/core). Meldet das Backend einen Fehler, wird er hier als
 * BackendError mit deutschem Text geworfen.
 */

/** Verständliche Texte zu den festen Fehlercodes aus src/core/errors.ts */
const MESSAGES = {
  bad_payload: 'Die Daten waren unvollständig.',
  version_conflict: 'Die Daten wurden zwischenzeitlich geändert.',
  version_required: 'Die Daten wurden zwischenzeitlich geändert.',
  no_stammdaten_path: 'Kein Stammdaten-Pfad gesetzt. Bitte zuerst unter „Pfade“ speichern.',
  missing_password: 'Bitte ein Passwort eingeben.',
  missing_fields: 'Bitte beide Passwortfelder ausfüllen.',
  password_mismatch: 'Passwörter stimmen nicht überein.',
  mitarbeiter_required: 'Es muss mindestens ein Mitarbeiter angelegt sein.',
  mitarbeiter_path_missing: 'Der Mitarbeiter-Ordner ist nicht erreichbar. Ist das Laufwerk eingehängt?',
  produktionen_path_missing: 'Der Produktionen-Ordner ist nicht erreichbar. Ist das Laufwerk eingehängt?',
  not_logged_in: 'Bitte zuerst anmelden.',
  kunde_required: 'Bitte einen Kunden wählen.',
  kunde_ohne_unterordner: 'Für diesen Kunden sind keine Unterordner hinterlegt. Bitte in der Konfiguration ergänzen.',
  stufe_unbekannt: 'Diese Produktionsstufe gibt es bei diesem Kunden nicht.',
  template_missing: 'Die gewählte Vorlage wurde nicht gefunden.',
  project_exists: 'Das Projekt existiert bereits.',
  not_found: 'Kein passender Projektordner gefunden.',
  validation_failed: 'Bitte Eingaben korrigieren.',
  project_fields_missing: 'Bitte alle Felder ausfüllen.',
  invalid_action: 'Ungültige Aktion.',
  nothing_selected: 'Bitte mindestens einen Eintrag auswählen.',
}

export class BackendError extends Error {
  constructor ({ code, details, message }) {
    super(MESSAGES[code] || message || code)
    this.name = 'BackendError'
    this.code = code
    this.details = details || {}
  }
}

/** Führt einen Aufruf aus und gibt das Ergebnis zurück oder wirft einen BackendError. */
async function call (method, arg) {
  // Vue-Daten lassen sich nicht direkt verschicken, deshalb als reine Kopie
  const plainArg = arg === undefined ? undefined : JSON.parse(JSON.stringify(arg))
  const result = await window.electronAPI.backend(method, plainArg)
  if (result.ok) return result.data
  throw new BackendError(result.error)
}

export const backend = {
  getInitializeStatus: () => call('getInitializeStatus'),
  getPaths: () => call('getPaths'),
  savePaths: input => call('savePaths', input),
  getSchema: () => call('getSchema'),
  saveSchema: input => call('saveSchema', input),
  getModules: () => call('getModules'),
  saveModules: input => call('saveModules', input),

  isPasswordSet: () => call('isPasswordSet'),
  checkPassword: password => call('checkPassword', password),
  setPassword: input => call('setPassword', input),

  listUsers: () => call('listUsers'),
  saveUsers: input => call('saveUsers', input),
  getActiveUser: () => call('getActiveUser'),

  getSnapshot: () => call('getSnapshot'),
  saveSnapshot: input => call('saveSnapshot', input),
  listCustomers: () => call('listCustomers'),

  listTemplates: () => call('listTemplates'),
  listProjects: kunde => call('listProjects', kunde),
  createProject: input => call('createProject', input),
  addSession: input => call('addSession', input),

  proToolsStatus: () => call('proToolsStatus'),
  runProToolsPresets: input => call('runProToolsPresets', input),
  soundminerStatus: () => call('soundminerStatus'),
  runSoundminerPresets: input => call('runSoundminerPresets', input),
}
