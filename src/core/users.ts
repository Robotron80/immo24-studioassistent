/**
 * Die Mitarbeiter.
 *
 * Ein Mitarbeiter ist ein Ordner unter dem Mitarbeiter-Pfad. Es gibt keine
 * zentrale Liste, der Ordner selbst ist der Eintrag:
 *
 *   Mitarbeiter/
 *     Max/
 *       immo24/
 *         immo24-user.json     Das Kürzel, z. B. "MM". Trotz der Endung reiner
 *                              Text und kein JSON, das muss so bleiben, weil
 *                              Version 0.4 dieselben Dateien liest.
 *         templates/ ...       Die Ablage für Vorlagen und Presets
 *
 * Als Mitarbeiter zählt nur, wer ein nicht leeres Kürzel hat.
 */
import fs from 'node:fs/promises'
import path from 'node:path'

import type { ConfigService } from './config.ts'
import { CoreError } from './errors.ts'
import { exists, isPlainObject, readTextOrNull, writeFileAtomic } from './files.ts'

export interface User {
  name: string
  kuerzel: string
}

export interface SaveUserResult {
  name: string
  action: 'written' | 'skipped:name-missing'
}

/** Diese Ablageordner bekommt jeder neue Mitarbeiter. */
const PRESET_FOLDERS = [
  'clipeffectspresets',
  'fadepresets',
  'keyboardshortcuts',
  'memorylocationpresets',
  'pluginsettings',
  'templates',
  'trackdatapresets',
  'trackdatarecallpresets',
  'trackpresets',
]
/** Dieser Ordner kommt nur dazu, wenn das Soundminer-Modul aktiv ist. */
const SOUNDMINER_FOLDER = 'soundminer'

/**
 * Vereinheitlicht einen Namen für den Vergleich.
 * macOS und Windows speichern Umlaute intern unterschiedlich. Ohne normalize()
 * würde "Ärger" vom Mac nicht als "Ärger" von Windows erkannt.
 */
function comparableName(name: string): string {
  return name.normalize('NFC').toLowerCase()
}

/** Liest einen Ordner aus. Gibt eine leere Liste zurück, wenn es ihn nicht gibt. */
async function listDirectory(dir: string) {
  try {
    return await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
}

/** Erstellt den Mitarbeiter-Dienst. Die Pfade kommen aus den Einstellungen. */
export function createUserService(config: ConfigService) {
  /** Liefert den Mitarbeiter-Pfad aus den Einstellungen. */
  async function mitarbeiterPath(): Promise<string> {
    const { data } = await config.getPaths()
    return typeof data.PathMitarbeiter === 'string' ? data.PathMitarbeiter : ''
  }

  /** Ist das Soundminer-Modul eingeschaltet? */
  async function isSoundminerEnabled(): Promise<boolean> {
    const { data } = await config.getModules()
    return isPlainObject(data.soundminer) && !!data.soundminer.enabled
  }

  /**
   * Legt den immo24-Ordner samt Ablageordnern an.
   * Passiert nur beim ersten Mal, bestehende Mitarbeiter bleiben unverändert.
   */
  async function createMetaFolders(metaDir: string): Promise<void> {
    await fs.mkdir(metaDir)
    const folders = (await isSoundminerEnabled()) ? [...PRESET_FOLDERS, SOUNDMINER_FOLDER] : PRESET_FOLDERS
    await Promise.all(folders.map((folder) => fs.mkdir(path.join(metaDir, folder), { recursive: true })))
  }

  /** Legt einen Mitarbeiter an oder aktualisiert dessen Kürzel. */
  async function saveUser(base: string, input: { name?: unknown; kuerzel?: unknown }): Promise<SaveUserResult> {
    const name = String(input?.name ?? '').trim()
    const kuerzel = String(input?.kuerzel ?? '').trim()
    if (!name) return { name, action: 'skipped:name-missing' }

    // Schritt 1: Gibt es den Ordner schon in anderer Schreibweise, nehmen wir diesen.
    // So entsteht aus "zweite" kein zweiter Ordner neben "Zweite".
    const entries = await listDirectory(base)
    const existing = entries.find((entry) => comparableName(entry.name) === comparableName(name))
    const userDir = path.join(base, existing?.name ?? name)
    const metaDir = path.join(userDir, 'immo24')

    // Schritt 2: Fehlende Ordner anlegen
    await fs.mkdir(userDir, { recursive: true })
    if (!(await exists(metaDir))) await createMetaFolders(metaDir)

    // Schritt 3: Kürzel speichern
    await writeFileAtomic(path.join(metaDir, 'immo24-user.json'), kuerzel)
    return { name, action: 'written' }
  }

  return {
    /** Für Anmeldefenster und Konfiguration: alle Mitarbeiter, sortiert nach Namen. */
    async listUsers(): Promise<User[]> {
      const base = await mitarbeiterPath()
      if (!base) return []
      const entries = await listDirectory(base)

      // Für jeden sichtbaren Ordner das Kürzel lesen, gleichzeitig statt nacheinander
      const users = await Promise.all(entries
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
        .map(async (entry): Promise<User | null> => {
          const text = await readTextOrNull(path.join(base, entry.name, 'immo24', 'immo24-user.json'))
          const kuerzel = text?.trim()
          return kuerzel ? { name: entry.name, kuerzel } : null
        }))

      return users
        .filter((user) => user !== null)
        .sort((a, b) => a.name.localeCompare(b.name, 'de'))
    },

    /**
     * Für Einrichtungsassistent und Konfiguration: legt Mitarbeiter an oder ändert sie.
     * Einer nach dem anderen, damit sich zwei Einträge desselben Namens nicht stören.
     */
    async saveUsers(input: { mitarbeiter?: unknown }) {
      const list = input?.mitarbeiter
      if (!Array.isArray(list) || list.length === 0) throw new CoreError('mitarbeiter_required')

      const base = await mitarbeiterPath()
      if (!base || !(await exists(base))) throw new CoreError('mitarbeiter_path_missing')

      const results: SaveUserResult[] = []
      for (const entry of list) results.push(await saveUser(base, entry))
      return { ok: true, results, count: results.length }
    },
  }
}
