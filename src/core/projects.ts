/**
 * Die Projektanlage: das Herzstück des Programms.
 *
 * Ein Projekt auf dem Speicher sieht so aus:
 *
 *   Produktionen/<Kunde>/<Projektordner>/
 *     immo24-proj.json          Metadaten, daran erkennen wir unsere Projekte
 *     02_Dialogschnitt/         Unterordner laut Stammdaten
 *       <Session> v1.ptx        Kopie der gewählten Vorlage
 *       Audio Files/            nur bei Vorlagen "mit Clips"
 *
 * Vorlagen liegen im Ordner des Mitarbeiters und sind entweder eine einzelne
 * .ptxt-Datei oder ein Paket: ein Ordner mit .ptxt-Datei und "Audio Files".
 */
import fs from 'node:fs/promises'
import path from 'node:path'

import type { ConfigService } from './config.ts'
import { CoreError } from './errors.ts'
import { exists, readJsonOrNull, writeFileAtomic } from './files.ts'
import { checkWindowsName, escapeRegExp, fillTemplate } from './names.ts'
import type { SessionService } from './session.ts'
import type { Kunde, StammdatenService } from './stammdaten.ts'

export interface ProjectInput {
  kunde?: string
  datum?: string
  moid?: string
  projektname?: string
  stufe?: string
  stufeLabel?: string
  template?: string
}

const DEFAULT_SESSION_SCHEMA = '{{projektname}} {{moid}} - {{produktionsstufe}} {{benutzer}} {{version}}'
const REQUIRED_FIELDS = ['kunde', 'datum', 'moid', 'projektname', 'stufe', 'template'] as const

/** Entfernt versehentliche Leerzeichen am Rand der Eingaben, die zu Ordnernamen werden. */
function trimNames(input: ProjectInput): ProjectInput {
  return {
    ...input,
    projektname: String(input?.projektname ?? '').trim(),
    moid: String(input?.moid ?? '').trim(),
  }
}

/** Prüft Pflichtfelder und alle Namen, die später zu Ordnern oder Dateien werden. */
function validate(input: ProjectInput): Required<Pick<ProjectInput, (typeof REQUIRED_FIELDS)[number]>> {
  const missing = REQUIRED_FIELDS.filter((field) => !input?.[field])
  if (missing.length) throw new CoreError('project_fields_missing', { fields: missing })

  const details = (['projektname', 'moid', 'kunde'] as const)
    .map((field) => ({ field, errors: checkWindowsName(input[field]) }))
    .filter((report) => report.errors.length > 0)
  if (details.length) throw new CoreError('validation_failed', { details })

  return input as Required<Pick<ProjectInput, (typeof REQUIRED_FIELDS)[number]>>
}

/**
 * Bestimmt den Dateinamen der nächsten Session.
 * Dafür suchen wir im Stufenordner die höchste vorhandene Version desselben Namens.
 * wildcards: Platzhalter, deren Wert beim Suchen egal ist. So zählt eine Session
 * von gestern oder von einem Kollegen bei der Nummerierung mit.
 */
function nextSessionName(existingFiles: string[], schema: string, values: Record<string, string>, wildcards: string[]): string {
  const normalized = schema.normalize('NFC')
  const pattern = escapeRegExp(normalized)
    .replace(/\\{\\{version\\}\\}/g, 'v(\\d+)')
    .replace(/\\{\\{(\w+)\\}\\}/g, (_match, key: string) => (
      wildcards.includes(key) || !values[key] ? '.*' : escapeRegExp(values[key])
    ))
  const regex = new RegExp(`^${pattern}\\.ptx$`)

  let highest = 0
  for (const file of existingFiles) {
    const match = regex.exec(file.normalize('NFC'))
    if (match?.[1]) highest = Math.max(highest, parseInt(match[1], 10))
  }
  return `${fillTemplate(normalized, { ...values, version: `v${highest + 1}` })}.ptx`
}

export function createProjectService(config: ConfigService, stammdaten: StammdatenService, session: SessionService) {
  /** Liest alle Einstellungen, die Projekte brauchen, frisch aus den Dateien. */
  async function settings() {
    const { data: paths } = await config.getPaths()
    const { data: schema } = await config.getSchema()
    return {
      produktionen: String(paths.PathProduktionen ?? ''),
      mitarbeiter: String(paths.PathMitarbeiter ?? ''),
      projektordnerSchema: String((schema as Record<string, unknown>).projektordnerSchema ?? ''),
      sessionSchema: String((schema as Record<string, unknown>).sessionSchema || DEFAULT_SESSION_SCHEMA),
    }
  }

  /** Findet heraus, welche Dateien zu einer gewählten Vorlage gehören. */
  function templateSources(mitarbeiter: string, userName: string, template: string) {
    const base = path.join(mitarbeiter, userName, 'immo24', 'templates')
    if (/\.ptxt$/i.test(template)) return { ptxt: path.join(base, template), audio: null }
    return {
      ptxt: path.join(base, template, `${template}.ptxt`),
      audio: path.join(base, template, 'Audio Files'),
    }
  }

  /**
   * Legt die Session im Stufenordner an: Vorlage kopieren, bei Paketen auch die Audiodateien.
   * Vorhandene Dateien werden nie überschrieben.
   */
  async function copySession(sources: { ptxt: string; audio: string | null }, stageDir: string, filename: string) {
    await fs.copyFile(sources.ptxt, path.join(stageDir, filename), fs.constants.COPYFILE_EXCL)
    if (sources.audio && (await exists(sources.audio))) {
      await fs.cp(sources.audio, path.join(stageDir, 'Audio Files'), { recursive: true, force: false })
    }
  }

  return {
    /** Für die Auswahlliste: alle Vorlagen des angemeldeten Mitarbeiters. */
    async listTemplates() {
      const { mitarbeiter } = await settings()
      const dir = path.join(mitarbeiter, session.requireUser().name, 'immo24', 'templates')
      const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])

      const options: Array<{ label: string; value: string; kind: string; relPtxt?: string }> = []
      for (const entry of entries) {
        if (entry.isFile() && /\.ptxt$/i.test(entry.name)) {
          options.push({ label: entry.name.replace(/\.ptxt$/i, ''), value: entry.name, kind: 'file' })
        } else if (entry.isDirectory() && !entry.name.startsWith('.')) {
          // Ein Ordner ist nur dann ein Paket, wenn "Audio Files" und eine .ptxt-Datei da sind
          const folder = path.join(dir, entry.name)
          const ptxtFiles = (await fs.readdir(folder)).filter((name) => /\.ptxt$/i.test(name))
          if (ptxtFiles.length === 0 || !(await exists(path.join(folder, 'Audio Files')))) continue
          const preferred = ptxtFiles.find((name) => name.replace(/\.ptxt$/i, '').toLowerCase() === entry.name.toLowerCase())
          options.push({ label: `${entry.name} (mit Clips)`, value: entry.name, kind: 'package', relPtxt: preferred ?? ptxtFiles[0] })
        }
      }
      return options.sort((a, b) => a.label.localeCompare(b.label, 'de', { sensitivity: 'base', numeric: true }))
    },

    /** Für "vorhandenes Projekt": alle Projekte eines Kunden mit gültigen Metadaten, neueste zuerst. */
    async listProjects(kundeInput: unknown) {
      const kunde = String(kundeInput ?? '').trim()
      if (!kunde) throw new CoreError('kunde_required')
      const { produktionen } = await settings()
      const root = path.join(produktionen, kunde)
      const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => [])

      const rows = await Promise.all(entries.filter((entry) => entry.isDirectory()).map(async (entry) => {
        const meta = await readJsonOrNull(path.join(root, entry.name, 'immo24-proj.json')) as Record<string, string> | null
        if (!meta?.erstellt_am || !meta.projektname || !meta.mo_id || !meta.user) return null
        return { date: meta.erstellt_am, projektname: meta.projektname, moid: meta.mo_id, user: meta.user }
      }))
      // Neueste zuerst, bei gleichem Datum alphabetisch
      return rows
        .filter((row) => row !== null)
        .sort((a, b) => b.date.localeCompare(a.date) || a.projektname.localeCompare(b.projektname, 'de'))
    },

    /**
     * Legt ein neues Projekt an.
     * Erst wird alles geprüft, was vorab prüfbar ist. Geht beim Anlegen trotzdem
     * etwas schief, wird der neue Projektordner wieder entfernt, damit kein halbes
     * Projekt zurückbleibt, das eine Wiederholung blockiert.
     */
    async createProject(input: ProjectInput) {
      // Die MoID schreiben wir bei neuen Projekten immer groß
      const trimmed = trimNames(input)
      const data = validate({ ...trimmed, moid: trimmed.moid?.toUpperCase() })
      const user = session.requireUser()
      const { produktionen, mitarbeiter, projektordnerSchema, sessionSchema } = await settings()

      // Schritt 1: Kunde und Stufe in den Stammdaten nachschlagen
      const customers: Kunde[] = await stammdaten.readCustomers()
      const unterordner = customers.find((customer) => customer.kunde === data.kunde)?.ordner ?? []
      if (unterordner.length === 0) throw new CoreError('kunde_ohne_unterordner', { kunde: data.kunde })
      const stage = unterordner.find((folder) => folder.name === data.stufe)
      if (!stage) throw new CoreError('stufe_unbekannt', { stufe: data.stufe })

      // Schritt 2: Fehlt der Produktionen-Ordner, ist vermutlich der Share nicht
      // eingehängt. Dann darf hier nichts entstehen.
      if (!produktionen || !(await exists(produktionen))) throw new CoreError('produktionen_path_missing')

      // Schritt 3: Vorlage und Zielordner prüfen
      const sources = templateSources(mitarbeiter, user.name, data.template)
      if (!(await exists(sources.ptxt))) throw new CoreError('template_missing', { template: data.template })

      const customerDir = path.join(produktionen, data.kunde)
      const values = {
        datum: data.datum,
        projektname: data.projektname,
        moid: data.moid,
        benutzer: user.kuerzel,
        kunde: data.kunde,
      }
      const zielPfad = path.join(customerDir, fillTemplate(projektordnerSchema, values))
      if (await exists(zielPfad)) throw new CoreError('project_exists', { zielPfad })

      // Schritt 4: Anlegen. Ein fehlender Kundenordner wird dabei ergänzt.
      const customerFolderCreated = !(await exists(customerDir))
      const stageDir = path.join(zielPfad, data.stufe)
      try {
        if (customerFolderCreated) await fs.mkdir(customerDir)
        await fs.mkdir(zielPfad)
        await writeFileAtomic(path.join(zielPfad, 'immo24-proj.json'), `${JSON.stringify({
          erstellt_am: data.datum,
          kunde: data.kunde,
          projektname: data.projektname,
          mo_id: data.moid,
          user: user.name,
        }, null, 2)}\n`)
        await Promise.all(unterordner.map((folder) => fs.mkdir(path.join(zielPfad, folder.name))))

        const filename = nextSessionName([], sessionSchema, { ...values, produktionsstufe: stage.label }, [])
        await copySession(sources, stageDir, filename)

        return {
          ok: true,
          zielPfad,
          templateDest: stageDir,
          filename,
          // Nur gesetzt, wenn es passiert ist, damit der Aufrufer es protokollieren kann
          ...(customerFolderCreated ? { kundenordnerAngelegt: true } : {}),
        }
      } catch (error) {
        await fs.rm(zielPfad, { recursive: true, force: true }).catch(() => {})
        if (customerFolderCreated) await fs.rmdir(customerDir).catch(() => {})
        throw error
      }
    },

    /**
     * Legt in einem vorhandenen Projekt die nächste Session an.
     * Den Projektordner finden wir über das Namensschema. Sein Name enthält das
     * ursprüngliche Datum und Kürzel, die Session bekommt aber das heutige Datum.
     */
    async addSession(input: ProjectInput) {
      // Die MoID bleibt hier unverändert: Ältere Projekte können sie kleingeschrieben
      // im Ordnernamen tragen und würden sonst nicht mehr gefunden.
      const data = validate(trimNames(input))
      const user = session.requireUser()
      const { produktionen, mitarbeiter, projektordnerSchema, sessionSchema } = await settings()

      // Schritt 1: Projektordner per Schema suchen. Der Benutzer ist dabei egal.
      const root = path.join(produktionen, data.kunde)
      const values: Record<string, string> = {
        datum: data.datum.normalize('NFC'),
        projektname: data.projektname.normalize('NFC'),
        moid: data.moid.normalize('NFC'),
        kunde: data.kunde.normalize('NFC'),
      }
      const pattern = escapeRegExp(projektordnerSchema.normalize('NFC'))
        .replace(/\\{\\{benutzer\\}\\}/g, '.+')
        .replace(/\\{\\{(\w+)\\}\\}/g, (_match, key: string) => (values[key] ? escapeRegExp(values[key]) : '.*'))
        .replace(/ /g, '\\s+')
      const regex = new RegExp(`^${pattern}$`)
      const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => [])
      const folder = entries.find((entry) => (
        entry.isDirectory() && !entry.name.startsWith('.') && regex.test(entry.name.normalize('NFC'))
      ))
      if (!folder) throw new CoreError('not_found')

      // Schritt 2: Stufenordner sicherstellen und Vorlage prüfen
      const zielPfad = path.join(root, folder.name)
      const stageDir = path.join(zielPfad, data.stufe)
      const sources = templateSources(mitarbeiter, user.name, data.template)
      if (!(await exists(sources.ptxt))) throw new CoreError('template_missing', { template: data.template })
      await fs.mkdir(stageDir, { recursive: true })

      // Schritt 3: Nächste Version bestimmen und anlegen
      const filename = nextSessionName(await fs.readdir(stageDir), sessionSchema, {
        ...values,
        datum: new Date().toISOString().slice(0, 10),
        benutzer: user.kuerzel.normalize('NFC'),
        produktionsstufe: String(input.stufeLabel ?? '').normalize('NFC'),
      }, ['datum', 'benutzer'])
      await copySession(sources, stageDir, filename)

      return { ok: true, zielPfad, templateDest: stageDir, filename }
    },
  }
}
