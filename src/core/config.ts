/**
 * Die Grundeinstellungen des Programms: Pfade, Namensschema und Module.
 *
 * Wo liegen die Daten?
 *   - path.json und config.json: lokal im Einstellungsordner jedes Rechners
 *   - schemes.json: im Stammdaten-Ordner, damit alle Rechner dasselbe Schema nutzen
 *
 * Dateien werden bei jedem Zugriff frisch gelesen statt im Speicher gehalten.
 * So gibt es keinen veralteten Stand, und die Reihenfolge von Aufrufen spielt
 * keine Rolle. Das alte Backend war hier anfällig.
 */
import path from 'node:path'

import { CoreError } from './errors.ts'
import { isPlainObject, readJsonOrNull, writeJsonAtomic } from './files.ts'
import { createVersionTracker } from './versions.ts'

/** Die vier konfigurierbaren Ordner. */
export interface Paths {
  PathMitarbeiter: string
  PathProduktionen: string
  PathStammdaten: string
  PathPTUser: string
}

/** Die beiden Vorlagen für Ordner- und Sessionnamen. */
export interface Schema {
  projektordnerSchema: string
  sessionSchema: string
}

/** Das Ergebnis der Prüfung, ob die Einrichtung vollständig ist. */
export interface InitializeInfo {
  paths_json_present: boolean
  required_keys_ok: boolean
  schema_ok: boolean
  dirs_exist: null
  missingKeys: string[]
  emptyKeys: string[]
  notFoundDirs: null
  needsUserAction: boolean
}

export interface InitializeStatus {
  ready: true
  initialize: InitializeInfo
  // Die folgenden Felder fehlen, solange die Pfade nicht eingerichtet sind
  paths?: Record<string, unknown>
  schema?: Schema
  modules?: Record<string, unknown>
}

/** Mindestens diese Pfade müssen gesetzt sein, sonst startet der Einrichtungsassistent. */
const REQUIRED_PATH_KEYS = ['PathProduktionen', 'PathMitarbeiter']

/** Liest eine Eingabe als String, alles andere wird zu einem leeren Text. */
function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/**
 * Bereinigt die Einstellungen eines Moduls.
 * Beim Soundminer-Modul sind die Felder genau festgelegt. Andere Module dürfen
 * eigene Felder haben, Listen werden dabei verworfen.
 */
function normalizeModule(name: string, value: unknown): Record<string, unknown> {
  const source = isPlainObject(value) ? value : {}
  if (name.toLowerCase() === 'soundminer') {
    return {
      enabled: !!source.enabled,
      version: asString(source.version),
      supportPath: asString(source.supportPath),
    }
  }
  return Object.fromEntries(Object.entries(source).filter(([, item]) => (
    ['string', 'number', 'boolean'].includes(typeof item) || isPlainObject(item)
  )))
}

export type ConfigService = ReturnType<typeof createConfigService>

/** Erstellt den Einstellungs-Dienst. userDataDir ist der Einstellungsordner der App. */
export function createConfigService(userDataDir: string) {
  const pathsFile = path.join(userDataDir, 'path.json')
  const configFile = path.join(userDataDir, 'config.json')

  // Für jede Datenart ein eigener Versionszähler, siehe versions.ts
  const pathsVersion = createVersionTracker()
  const schemaVersion = createVersionTracker()
  const modulesVersion = createVersionTracker()

  /** Liest die Pfade. Ältere Dateien können sie in einem Feld "data" verpacken. */
  async function readPaths(): Promise<Record<string, unknown>> {
    const parsed = await readJsonOrNull(pathsFile)
    if (isPlainObject(parsed) && isPlainObject(parsed.data)) return parsed.data
    return isPlainObject(parsed) ? parsed : {}
  }

  /** Liest die Module aus config.json. */
  async function readModules(): Promise<Record<string, unknown>> {
    const parsed = await readJsonOrNull(configFile)
    return isPlainObject(parsed) && isPlainObject(parsed.modules) ? parsed.modules : {}
  }

  /** Bestimmt den Pfad zu schemes.json oder meldet, dass kein Stammdaten-Ordner gesetzt ist. */
  async function schemaFile(): Promise<string> {
    const base = asString((await readPaths()).PathStammdaten)
    if (!base) throw new CoreError('no_stammdaten_path')
    return path.join(base, 'schemes.json')
  }

  /** Liest das Namensschema. Gibt null zurück, wenn es noch keines gibt. */
  async function readSchema(): Promise<Record<string, unknown> | null> {
    const parsed = await readJsonOrNull(await schemaFile())
    return isPlainObject(parsed) ? parsed : null
  }

  return {
    /** Für den Einstellungsdialog: aktuelle Pfade samt Version. */
    async getPaths() {
      return { data: await readPaths(), version: pathsVersion.current() }
    },

    /** Speichert die Pfade. Unbekannte Felder werden dabei verworfen. */
    async savePaths(input: { version?: unknown; data?: unknown }) {
      if (typeof input?.version !== 'string' || !isPlainObject(input.data)) {
        throw new CoreError('bad_payload')
      }
      pathsVersion.assertCurrent(input.version)
      const { data } = input
      await writeJsonAtomic(pathsFile, {
        PathMitarbeiter: asString(data.PathMitarbeiter),
        PathProduktionen: asString(data.PathProduktionen),
        PathStammdaten: asString(data.PathStammdaten),
        PathPTUser: asString(data.PathPTUser),
      } satisfies Paths)
      return { ok: true, version: pathsVersion.bump() }
    },

    /** Für den Einstellungsdialog: Namensschema samt Version. */
    async getSchema() {
      const data = await readSchema()
      if (data) return { data, version: schemaVersion.current() }
      // Noch kein Schema vorhanden: Der Einrichtungsassistent muss es abfragen
      return {
        data: {},
        version: null,
        initialize: {
          paths_json_present: true,
          required_keys_ok: true,
          schema_ok: false,
          dirs_exist: null,
          missingKeys: [],
          emptyKeys: [],
          notFoundDirs: null,
          needsUserAction: true,
        } satisfies InitializeInfo,
      }
    },

    /**
     * Speichert das Namensschema.
     * Es wird absichtlich keine Version geprüft: Der Einrichtungsassistent
     * speichert es, wenn es noch gar keine Version gibt.
     */
    async saveSchema(input: Record<string, unknown>) {
      // Die Daten dürfen in "schema" oder "data" verpackt sein oder direkt vorliegen
      const container = isPlainObject(input?.schema) ? input.schema : isPlainObject(input?.data) ? input.data : input
      const projektordnerSchema = container?.projektordnerSchema
      const sessionSchema = container?.sessionSchema
      if (typeof input?.version !== 'string' || typeof projektordnerSchema !== 'string' || typeof sessionSchema !== 'string') {
        throw new CoreError('bad_payload')
      }
      const schema: Schema = { projektordnerSchema, sessionSchema }
      await writeJsonAtomic(await schemaFile(), schema)
      return schema
    },

    /** Für den Einstellungsdialog: Module samt Version. */
    async getModules() {
      return { data: await readModules(), version: modulesVersion.current() }
    },

    /** Speichert Module. Bestehende Felder bleiben erhalten, neue überschreiben sie. */
    async saveModules(input: { version?: unknown; data?: unknown }) {
      if (typeof input?.version !== 'string' || !isPlainObject(input.data)) {
        throw new CoreError('bad_payload')
      }
      if (!input.version) {
        throw new CoreError('version_required', { currentVersion: modulesVersion.current() })
      }
      modulesVersion.assertCurrent(input.version)

      // Die gesamte config.json lesen, damit andere Einstellungen darin erhalten bleiben
      const parsed = await readJsonOrNull(configFile)
      const config = isPlainObject(parsed) ? parsed : {}
      const modules = isPlainObject(config.modules) ? config.modules : {}
      for (const [name, value] of Object.entries(input.data)) {
        const before = isPlainObject(modules[name]) ? modules[name] : {}
        modules[name] = { ...before, ...normalizeModule(name, value) }
      }
      await writeJsonAtomic(configFile, { ...config, modules })
      return { ok: true, version: modulesVersion.bump() }
    },

    /**
     * Beim Programmstart: Ist alles eingerichtet?
     * Ein fehlender Pfad führt zum Einrichtungsassistenten.
     */
    async getInitializeStatus(): Promise<InitializeStatus> {
      const parsed = await readJsonOrNull(pathsFile)
      const paths = await readPaths()
      const isEmpty = !isPlainObject(parsed) || Object.keys(paths).length === 0
      const missingKeys = isEmpty ? REQUIRED_PATH_KEYS : REQUIRED_PATH_KEYS.filter((key) => !(key in paths))
      const emptyKeys = isEmpty
        ? REQUIRED_PATH_KEYS
        : REQUIRED_PATH_KEYS.filter((key) => asString(paths[key]).trim() === '')
      const requiredKeysOk = !isEmpty && missingKeys.length === 0 && emptyKeys.length === 0

      // Schritt 1: Pfade unvollständig, dann brauchen wir den Rest gar nicht zu lesen
      if (!requiredKeysOk) {
        return {
          ready: true,
          initialize: {
            paths_json_present: !isEmpty,
            required_keys_ok: requiredKeysOk,
            schema_ok: false,
            dirs_exist: null,
            missingKeys,
            emptyKeys,
            notFoundDirs: null,
            needsUserAction: true,
          },
        }
      }

      // Schritt 2: Schema lesen. Ohne Stammdaten-Pfad gilt es als nicht vorhanden,
      // der Assistent startet dann aber nicht, wie bisher auch.
      let schemaData: Record<string, unknown> | null = null
      let schemaMissing = false
      try {
        schemaData = await readSchema()
        schemaMissing = schemaData === null
      } catch (error) {
        if (!(error instanceof CoreError && error.code === 'no_stammdaten_path')) throw error
      }
      const schema: Schema = {
        sessionSchema: asString(schemaData?.sessionSchema),
        projektordnerSchema: asString(schemaData?.projektordnerSchema),
      }

      // Schritt 3: Gesamtergebnis zusammensetzen
      return {
        ready: true,
        initialize: {
          paths_json_present: true,
          required_keys_ok: true,
          schema_ok: !schemaMissing && !!(schema.sessionSchema || schema.projektordnerSchema),
          dirs_exist: null,
          missingKeys: [],
          emptyKeys: [],
          notFoundDirs: null,
          needsUserAction: schemaMissing,
        },
        paths,
        schema,
        modules: await readModules(),
      }
    },
  }
}
