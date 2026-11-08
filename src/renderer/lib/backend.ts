/**
 * Der Zugang der Oberfläche zum Backend.
 *
 * Statt einer Web-Adresse ruft die Oberfläche hier normale Funktionen auf. Der Aufruf
 * geht über die Brücke in preload.ts zum Hauptprozess (src/main/backend.ts) und von
 * dort in die Fachlogik (src/core). Meldet das Backend einen Fehler, wird er hier als
 * BackendError mit deutschem Text geworfen.
 *
 * Die Typen kommen direkt aus den Funktionen des Backends. Ändert sich dort etwas,
 * meldet die Typprüfung (npm run typecheck) jede betroffene Stelle in der Oberfläche.
 */
import type { BackendMethods } from '../../main/backend'

/** Verständliche Texte zu den festen Fehlercodes aus src/core/errors.ts */
const MESSAGES: Record<string, string> = {
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
  nichts_geaendert: 'Name und Mo-ID sind unverändert.',
  schema_passt_nicht: 'Der Projektordner passt nicht zum aktuellen Namensschema und wird deshalb nicht angefasst.',
  protools_laeuft: 'Pro Tools läuft auf diesem Rechner. Bitte zuerst schließen.',
  session_offen: 'Im Projekt liegt eine Sperrdatei, vermutlich ist eine Session geöffnet.',
  moid_vergeben: 'Diese Mo-ID ist schon vergeben.',
  umbenennen_blockiert: 'Der Ordner ließ sich nicht umbenennen, vermutlich ist darin eine Datei geöffnet.',
  projekt_unvollstaendig: 'Das Projekt wurde nur teilweise angelegt. Bitte den Ordner prüfen und von Hand aufräumen.',
}

interface BackendFailure {
  code: string
  details?: Record<string, any>
  message?: string
}

export class BackendError extends Error {
  code: string
  details: Record<string, any>

  constructor({ code, details, message }: BackendFailure) {
    super(MESSAGES[code] || message || code)
    this.name = 'BackendError'
    this.code = code
    this.details = details || {}
  }
}

type Argument<M extends keyof BackendMethods> = Parameters<BackendMethods[M]>[0]
type Result<M extends keyof BackendMethods> = Awaited<ReturnType<BackendMethods[M]>>

/** Führt einen Aufruf aus und gibt das Ergebnis zurück oder wirft einen BackendError. */
async function call<M extends keyof BackendMethods>(method: M, arg?: Argument<M>): Promise<Result<M>> {
  // Vue-Daten lassen sich nicht direkt verschicken, deshalb als reine Kopie
  const plainArg = arg === undefined ? undefined : JSON.parse(JSON.stringify(arg))
  const result = await window.electronAPI.backend(method, plainArg)
  if (result.ok) return result.data as Result<M>
  throw new BackendError(result.error)
}

export const backend = {
  getSetupStatus: () => call('getSetupStatus'),
  getPaths: () => call('getPaths'),
  savePaths: (input: Argument<'savePaths'>) => call('savePaths', input),
  getSchema: () => call('getSchema'),
  saveSchema: (input: Argument<'saveSchema'>) => call('saveSchema', input),
  getModules: () => call('getModules'),
  saveModules: (input: Argument<'saveModules'>) => call('saveModules', input),

  isPasswordSet: () => call('isPasswordSet'),
  checkPassword: (password: Argument<'checkPassword'>) => call('checkPassword', password),
  setPassword: (input: Argument<'setPassword'>) => call('setPassword', input),

  listUsers: () => call('listUsers'),
  saveUsers: (input: Argument<'saveUsers'>) => call('saveUsers', input),
  getActiveUser: () => call('getActiveUser'),

  getSnapshot: () => call('getSnapshot'),
  saveSnapshot: (input: Argument<'saveSnapshot'>) => call('saveSnapshot', input),
  listCustomers: () => call('listCustomers'),

  listTemplates: () => call('listTemplates'),
  listProjects: (kunde: Argument<'listProjects'>) => call('listProjects', kunde),
  createProject: (input: Argument<'createProject'>) => call('createProject', input),
  addSession: (input: Argument<'addSession'>) => call('addSession', input),

  isRenameEnabled: () => call('isRenameEnabled'),
  previewRename: (input: Argument<'previewRename'>) => call('previewRename', input),
  renameProject: (input: Argument<'renameProject'>) => call('renameProject', input),

  proToolsStatus: () => call('proToolsStatus'),
  runProToolsPresets: (input: Argument<'runProToolsPresets'>) => call('runProToolsPresets', input),
  soundminerStatus: () => call('soundminerStatus'),
  runSoundminerPresets: (input: Argument<'runSoundminerPresets'>) => call('runSoundminerPresets', input),
}
