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
import { fileVersion, isPlainObject, readJsonOrNull, writeJsonAtomic } from './files.ts'
import { createVersionTracker } from './versions.ts'

/** Die konfigurierbaren Ordner. */
interface Paths {
  PathMitarbeiter: string
  PathProduktionen: string
  PathStammdaten: string
  PathPTUser: string
  /** Optional: Vorlagen, die alle Mitarbeiter nutzen. Fehlt der Eintrag, gibt es nur die eigenen. */
  PathStandardvorlagen?: string
}

/** Die beiden Vorlagen für Ordner- und Sessionnamen. */
export interface Schema {
  projektordnerSchema: string
  sessionSchema: string
}

/** Mindestens diese Pfade müssen gesetzt sein, sonst startet der Einrichtungsassistent. */
const REQUIRED_PATH_KEYS = ['PathProduktionen', 'PathMitarbeiter', 'PathStammdaten', 'PathPTUser']

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
  return Object.fromEntries(
    Object.entries(source).filter(
      ([, item]) => ['string', 'number', 'boolean'].includes(typeof item) || isPlainObject(item),
    ),
  )
}

export type ConfigService = ReturnType<typeof createConfigService>

/** Erstellt den Einstellungs-Dienst. userDataDir ist der Einstellungsordner der App. */
export function createConfigService(userDataDir: string) {
  const pathsFile = path.join(userDataDir, 'path.json')
  const configFile = path.join(userDataDir, 'config.json')

  // Pfade und Module liegen lokal, dafür reicht ein Versionszähler, siehe versions.ts
  const pathsVersion = createVersionTracker()
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

    /**
     * Speichert die Pfade. Unbekannte Felder werden dabei verworfen.
     * Die Standardvorlagen stehen nur in der Datei, wenn sie gesetzt sind. So bleibt
     * path.json ohne diese Funktion genau so, wie Version 0.4 sie kennt.
     */
    async savePaths(input: { version?: unknown; data?: unknown }) {
      if (typeof input?.version !== 'string' || !isPlainObject(input.data)) {
        throw new CoreError('bad_payload')
      }
      pathsVersion.assertCurrent(input.version)
      const { data } = input
      const standardvorlagen = asString(data.PathStandardvorlagen).trim()
      await writeJsonAtomic(pathsFile, {
        PathMitarbeiter: asString(data.PathMitarbeiter),
        PathProduktionen: asString(data.PathProduktionen),
        PathStammdaten: asString(data.PathStammdaten),
        PathPTUser: asString(data.PathPTUser),
        ...(standardvorlagen ? { PathStandardvorlagen: standardvorlagen } : {}),
      } satisfies Paths)
      return { ok: true, version: pathsVersion.bump() }
    },

    /** Für den Einstellungsdialog: Namensschema samt Version. */
    async getSchema() {
      const data = await readSchema()
      if (data) return { data, version: await fileVersion(await schemaFile()) }
      // Noch kein Schema vorhanden: Der Einrichtungsassistent muss es abfragen
      return { data: {}, version: null }
    },

    /**
     * Speichert das Namensschema. Die Datei teilen sich alle Rechner: Hat ein anderer
     * sie seit dem Laden geändert, wird nicht überschrieben.
     */
    async saveSchema(input: Record<string, unknown>) {
      // Die Daten dürfen in "schema" oder "data" verpackt sein oder direkt vorliegen
      const container = isPlainObject(input?.schema) ? input.schema : isPlainObject(input?.data) ? input.data : input
      const projektordnerSchema = container?.projektordnerSchema
      const sessionSchema = container?.sessionSchema
      if (
        typeof input?.version !== 'string' ||
        typeof projektordnerSchema !== 'string' ||
        typeof sessionSchema !== 'string'
      ) {
        throw new CoreError('bad_payload')
      }
      const schema: Schema = { projektordnerSchema, sessionSchema }
      const file = await schemaFile()
      const currentVersion = await fileVersion(file)
      if (currentVersion !== '0' && input.version !== currentVersion) {
        throw new CoreError('version_conflict', { currentVersion })
      }
      await writeJsonAtomic(file, schema)
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
     * Beim Programmstart und am Ende des Einrichtungsassistenten: Fehlt noch etwas?
     * Nötig sind die alle Pfade und ein Namensschema.
     */
    async getSetupStatus(): Promise<{ needsSetup: boolean }> {
      const paths = await readPaths()
      if (REQUIRED_PATH_KEYS.some((key) => asString(paths[key]).trim() === '')) return { needsSetup: true }

      // Ohne Namensschema fehlt noch die Einrichtung
      const schema = await readSchema()
      return { needsSetup: !schema || !(asString(schema.sessionSchema) || asString(schema.projektordnerSchema)) }
    },
  }
}
