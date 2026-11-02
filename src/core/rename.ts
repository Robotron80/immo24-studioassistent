/**
 * Projekte umbenennen: Projektname und MoID ändern, also den Projektordner und die
 * Metadaten in immo24-proj.json.
 *
 * Vorhandene Sessions bleiben bewusst unverändert, sie sind ein nachvollziehbarer
 * Stand und öffnen sich weiterhin. Neue Sessions tragen den neuen Namen, ihre
 * Version zählt weiter (siehe addSession in projects.ts).
 *
 * Weil das im Produktivbetrieb heikel ist, gilt:
 *   - Die Funktion ist standardmäßig aus (Konfiguration, Bereich Module).
 *   - Vorher wird geprüft, ob Pro Tools hier läuft und ob Sperrdateien im Projekt liegen.
 *   - Das Umbenennen des Ordners passiert in einem Schritt. Klappt danach das Schreiben
 *     der Metadaten nicht, wird der alte Name wiederhergestellt.
 *   - immo24-proj.json merkt sich frühere Namen im Feld "umbenannt".
 */
import fs from 'node:fs/promises'
import path from 'node:path'

import type { ConfigService } from './config.ts'
import { CoreError } from './errors.ts'
import { exists, isPlainObject, readJsonOrNull, writeFileAtomic } from './files.ts'
import { checkWindowsName, comparableName, escapeRegExp, fillTemplate } from './names.ts'
import type { IsProcessRunning } from './presets.ts'
import type { SessionService } from './session.ts'

export interface RenameInput {
  kunde?: string
  /** Der bisherige Stand, so wie ihn die Projektliste zeigt */
  date?: string
  projektname?: string
  moid?: string
  /** Die gewünschten neuen Werte */
  neuerName?: string
  neueMoid?: string
  /** true: Sperrdateien wurden geprüft und sind verwaist */
  trotzSperre?: boolean
}

interface ProjectMeta {
  erstellt_am: string
  projektname: string
  mo_id: string
  umbenannt?: unknown[]
  [key: string]: unknown
}

// Ordner, in denen Pro Tools keine Sperrdatei einer offenen Session anlegt
const NOT_SCANNED = new Set(['Audio Files', 'Session File Backups', 'Fade Files', 'Video Files', 'Rendered Files'])

/**
 * Sucht Sperrdateien einer offenen Session. Pro Tools legt laut Studio-Erfahrung eine
 * .tmp-Datei im Sessionordner an, solange die Session offen ist. Der genaue Name ist
 * noch unbestätigt, deshalb zählt jede .tmp-Datei. Im Zweifel lieber einmal mehr warnen.
 */
async function findLockFiles(projectDir: string): Promise<string[]> {
  const found: string[] = []
  const scan = async (dir: string, relative: string, deeper: boolean) => {
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      const rel = relative ? `${relative}/${entry.name}` : entry.name
      if (entry.isFile() && /\.tmp$/i.test(entry.name)) found.push(rel)
      else if (entry.isDirectory() && deeper && !NOT_SCANNED.has(entry.name)) await scan(path.join(dir, entry.name), rel, false)
    }
  }
  await scan(projectDir, '', true)
  return found
}

export function createRenameService(config: ConfigService, session: SessionService, isRunning: IsProcessRunning) {
  /** Findet den Projektordner über die Metadaten, das ist unabhängig vom Namensschema. */
  async function findProject(input: RenameInput) {
    const { data: paths } = await config.getPaths()
    const root = path.join(String(paths.PathProduktionen ?? ''), String(input.kunde ?? ''))
    const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const meta = await readJsonOrNull(path.join(root, entry.name, 'immo24-proj.json'))
      if (isPlainObject(meta)
        && meta.projektname === input.projektname
        && meta.mo_id === input.moid
        && meta.erstellt_am === input.date) {
        return { root, folder: entry.name, meta: meta as ProjectMeta }
      }
    }
    throw new CoreError('not_found')
  }

  /**
   * Berechnet den neuen Ordnernamen aus dem Namensschema.
   * Das Kürzel im Ordnernamen gehört dem, der das Projekt angelegt hat, und bleibt erhalten.
   */
  async function newFolderName(input: RenameInput, folder: string, meta: ProjectMeta, neuerName: string, neueMoid: string) {
    const { data } = await config.getSchema()
    const schema = String((data as Record<string, unknown>).projektordnerSchema ?? '').normalize('NFC')
    const oldValues: Record<string, string> = {
      datum: meta.erstellt_am,
      projektname: meta.projektname.normalize('NFC'),
      moid: meta.mo_id.normalize('NFC'),
      kunde: String(input.kunde).normalize('NFC'),
    }
    const pattern = escapeRegExp(schema)
      .replace(/\\{\\{benutzer\\}\\}/g, '(?<benutzer>.+)')
      .replace(/\\{\\{(\w+)\\}\\}/g, (_match, key: string) => (oldValues[key] ? escapeRegExp(oldValues[key]) : '.*'))
    const match = new RegExp(`^${pattern}$`).exec(folder.normalize('NFC'))
    // Passt der Ordner nicht zum Schema, wurde es geändert. Dann lieber nichts anfassen.
    if (!match) throw new CoreError('schema_passt_nicht', { folder })
    return fillTemplate(schema, {
      ...oldValues,
      projektname: neuerName,
      moid: neueMoid,
      benutzer: match.groups?.benutzer ?? '',
    })
  }

  /** Alles, was Vorschau und Umbenennen gemeinsam brauchen. */
  async function plan(input: RenameInput) {
    session.requireUser()
    const neuerName = String(input?.neuerName ?? '').trim()
    const neueMoid = String(input?.neueMoid ?? '').trim().toUpperCase()
    const missing = [!neuerName && 'projektname', !neueMoid && 'moid'].filter(Boolean)
    if (missing.length) throw new CoreError('project_fields_missing', { fields: missing })

    const details = [
      { field: 'projektname', errors: checkWindowsName(neuerName) },
      { field: 'moid', errors: checkWindowsName(neueMoid) },
    ].filter((report) => report.errors.length > 0)
    if (details.length) throw new CoreError('validation_failed', { details })

    const { root, folder, meta } = await findProject(input)
    const target = await newFolderName(input, folder, meta, neuerName, neueMoid)
    if (target === folder) throw new CoreError('nichts_geaendert')

    // Nur Groß-/Kleinschreibung geändert: Das Ziel ist dann derselbe Ordner
    const sameFolder = comparableName(target) === comparableName(folder)
    if (!sameFolder && (await exists(path.join(root, target)))) {
      throw new CoreError('project_exists', { zielPfad: path.join(root, target) })
    }

    return {
      root,
      folder,
      meta,
      target,
      neuerName,
      neueMoid,
      gesperrt: await findLockFiles(path.join(root, folder)),
      proToolsLaeuft: await isRunning('protools'),
    }
  }

  return {
    /** Ist die Funktion in der Konfiguration eingeschaltet? */
    async isEnabled(): Promise<boolean> {
      const { data } = await config.getModules()
      return isPlainObject(data.umbenennen) && !!data.umbenennen.enabled
    },

    /** Zeigt vorab, was passieren würde, und ändert nichts. */
    async preview(input: RenameInput) {
      const { folder, target, gesperrt, proToolsLaeuft } = await plan(input)
      return { von: folder, nach: target, gesperrt, proToolsLaeuft }
    },

    /** Benennt das Projekt um. */
    async rename(input: RenameInput) {
      const { root, folder, meta, target, neuerName, neueMoid, gesperrt, proToolsLaeuft } = await plan(input)

      // Schritt 1: Sperren prüfen
      if (proToolsLaeuft) throw new CoreError('protools_laeuft')
      if (gesperrt.length && !input.trotzSperre) throw new CoreError('session_offen', { dateien: gesperrt })

      // Schritt 2: Ordner umbenennen. Ist eine Datei darin geöffnet, schlägt das meist fehl.
      const from = path.join(root, folder)
      const to = path.join(root, target)
      try {
        await fs.rename(from, to)
      } catch (error) {
        throw new CoreError('umbenennen_blockiert', { ursache: error instanceof Error ? error.message : String(error) })
      }

      // Schritt 3: Metadaten aktualisieren, bei einem Fehler den Ordner zurückbenennen
      const verlauf = {
        von: { projektname: meta.projektname, mo_id: meta.mo_id },
        am: new Date().toISOString(),
        user: session.requireUser().name,
      }
      const nextMeta = {
        ...meta,
        projektname: neuerName,
        mo_id: neueMoid,
        umbenannt: [...(Array.isArray(meta.umbenannt) ? meta.umbenannt : []), verlauf],
      }
      try {
        await writeFileAtomic(path.join(to, 'immo24-proj.json'), `${JSON.stringify(nextMeta, null, 2)}\n`)
      } catch (error) {
        await fs.rename(to, from).catch(() => {})
        throw error
      }

      return { ok: true, von: folder, nach: target, zielPfad: to }
    },
  }
}
