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
import { localDate } from './dates.ts'
import { CoreError } from './errors.ts'
import { exists, writeFileAtomic } from './files.ts'
import { findProjectByMoid, readCustomerProjects } from './moid.ts'
import {
  checkMoids,
  checkWindowsName,
  escapeRegExp,
  fillSessionName,
  fillTemplate,
  formatMoids,
  isPlaceholderMoid,
  isSimpleName,
  looseSpaces,
  tidyName,
} from './names.ts'
import type { SessionService } from './session.ts'
import type { Kunde, StammdatenService } from './stammdaten.ts'

export interface ProjectInput {
  kunde?: string
  datum?: string
  moid?: string
  /** Das Projekt hat keine MoID, etwa weil es nicht in der Datenbank steht */
  ohneMoid?: boolean
  projektname?: string
  stufe?: string
  template?: string
  /** Bei vorhandenen Projekten: der Projektordner aus der Projektliste */
  ordner?: string
  /** Freier Zusatz für den Sessionnamen, etwa "Kurzversion". Darf leer sein. */
  anmerkung?: string
}

const DEFAULT_SESSION_SCHEMA = '{{projektname}} {{moid}} - {{produktionsstufe}} {{benutzer}} {{version}}'
const REQUIRED_FIELDS = ['kunde', 'datum', 'moid', 'projektname', 'stufe', 'template'] as const

/** Entfernt versehentliche Leerzeichen am Rand der Eingaben, die zu Ordnernamen werden. */
function trimNames(input: ProjectInput): ProjectInput {
  return {
    ...input,
    projektname: String(input?.projektname ?? '').trim(),
    moid: String(input?.moid ?? '').trim(),
    anmerkung: String(input?.anmerkung ?? '').trim(),
  }
}

/** Prüft Pflichtfelder und alle Namen, die später zu Ordnern oder Dateien werden. */
function validate(input: ProjectInput): Required<Pick<ProjectInput, (typeof REQUIRED_FIELDS)[number]>> & ProjectInput {
  const missing = REQUIRED_FIELDS.filter((field) => !input?.[field] && !(field === 'moid' && input?.ohneMoid))
  if (missing.length) throw new CoreError('project_fields_missing', { fields: missing })

  const details = (['projektname', 'moid', 'kunde', 'anmerkung'] as const)
    .map((field) => ({ field, errors: checkWindowsName(input[field]) }))
    .filter((report) => report.errors.length > 0)
  if (details.length) throw new CoreError('validation_failed', { details })

  return input as Required<Pick<ProjectInput, (typeof REQUIRED_FIELDS)[number]>> & ProjectInput
}

/**
 * Bestimmt den Dateinamen der nächsten Session.
 * Dafür suchen wir im Stufenordner die höchste vorhandene Version desselben Namens.
 * wildcards: Platzhalter, deren Wert beim Suchen egal ist. So zählt eine Session
 * von gestern oder von einem Kollegen bei der Nummerierung mit.
 *
 * Eine Anmerkung wie "Kurzversion" steht dort, wo im Schema {{anmerkung}} steht, und
 * bekommt davor ein Leerzeichen. Fehlt der Platzhalter, gibt es keine Anmerkung.
 * Beim Zählen ist Text hinter der Version immer egal, auch solcher, den jemand in
 * Pro Tools beim "Speichern unter" ergänzt hat: Nach "v5 nach Absturz" kommt "v6".
 *
 * Empfohlen ist "{{version}}{{anmerkung}}" ohne Leerzeichen dazwischen: Dann zählt
 * auch Version 0.4 die Sessions mit Anmerkung mit (sie setzt für unbekannte
 * Platzhalter beim Suchen "beliebiger Text" ein und beim Anlegen nichts).
 */
function nextSessionName(
  existingFiles: string[],
  schema: string,
  values: Record<string, string>,
  wildcards: string[],
): string {
  const normalized = schema.normalize('NFC')
  // Fürs Suchen hängen wir hinten "beliebiger Text" an, falls das Schema dort keine Anmerkung vorsieht
  const searchSchema = normalized.includes('{{anmerkung}}') ? normalized : `${normalized}{{anmerkung}}`
  const pattern = looseSpaces(
    escapeRegExp(searchSchema)
      .replace(/\\{\\{version\\}\\}/g, 'v(\\d+)')
      .replace(/\\{\\{(\w+)\\}\\}/g, (_match, key: string) =>
        key === 'anmerkung' || wildcards.includes(key) || !values[key] ? '.*' : escapeRegExp(values[key]),
      ),
  )
  const regex = new RegExp(`^${pattern}\\.ptx$`)

  let highest = 0
  for (const file of existingFiles) {
    const match = regex.exec(file.normalize('NFC'))
    if (match?.[1]) highest = Math.max(highest, parseInt(match[1], 10))
  }
  const name = fillSessionName(normalized, { ...values, version: `v${highest + 1}` })
  // Leere Platzhalter hinterlassen doppelte Leerzeichen oder Trenner am Rand, die kommen weg
  return `${values.moid ? name : tidyName(name)}.ptx`
}

/** Vorsatz im Wert einer Standardvorlage. Ein Schrägstrich kommt in eigenen Vorlagen nie vor. */
const STANDARD_PREFIX = 'standard/'

/**
 * Liest die Vorlagen eines Ordners, für die eigenen und die Standardvorlagen.
 * Gibt es den Ordner nicht, ist die Liste leer.
 *   - einzelne .ptxt-Datei: eine Vorlage ohne Audiodateien
 *   - Ordner mit .ptxt-Datei und "Audio Files": ein Paket, die Clips kommen mit
 */
async function scanTemplates(dir: string) {
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
      const preferred = ptxtFiles.find(
        (name) => name.replace(/\.ptxt$/i, '').toLowerCase() === entry.name.toLowerCase(),
      )
      options.push({ label: entry.name, value: entry.name, kind: 'package', relPtxt: preferred ?? ptxtFiles[0] })
    }
  }
  return options
}

/** Sortiert Vorlagen alphabetisch nach dem angezeigten Namen, "Vorlage 2" vor "Vorlage 10". */
function sortByLabel<T extends { label: string }>(options: T[]): T[] {
  return options.sort((a, b) => a.label.localeCompare(b.label, 'de', { sensitivity: 'base', numeric: true }))
}

export function createProjectService(config: ConfigService, stammdaten: StammdatenService, session: SessionService) {
  /** Liest alle Einstellungen, die Projekte brauchen, frisch aus den Dateien. */
  async function settings() {
    const { data: paths } = await config.getPaths()
    const { data: schema } = await config.getSchema()
    return {
      produktionen: String(paths.PathProduktionen ?? ''),
      mitarbeiter: String(paths.PathMitarbeiter ?? ''),
      standardvorlagen: String(paths.PathStandardvorlagen ?? ''),
      projektordnerSchema: String((schema as Record<string, unknown>).projektordnerSchema ?? ''),
      sessionSchema: String((schema as Record<string, unknown>).sessionSchema || DEFAULT_SESSION_SCHEMA),
    }
  }

  /**
   * Findet heraus, welche Dateien zu einer gewählten Vorlage gehören.
   * Standardvorlagen erkennt man am Vorsatz "standard/" (siehe listTemplates).
   */
  function templateSources(
    folders: { mitarbeiter: string; standardvorlagen: string },
    userName: string,
    template: string,
  ) {
    const standard = template.startsWith(STANDARD_PREFIX)
    const name = standard ? template.slice(STANDARD_PREFIX.length) : template
    if (!isSimpleName(name) || (standard && !folders.standardvorlagen)) {
      throw new CoreError('template_missing', { template })
    }
    const base = standard ? folders.standardvorlagen : path.join(folders.mitarbeiter, userName, 'immo24', 'templates')
    if (/\.ptxt$/i.test(name)) return { ptxt: path.join(base, name), audio: null }
    return {
      ptxt: path.join(base, name, `${name}.ptxt`),
      audio: path.join(base, name, 'Audio Files'),
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
    /**
     * Für die Auswahlliste: erst die eigenen Vorlagen des angemeldeten Mitarbeiters,
     * dann die Standardvorlagen, falls dafür ein Pfad gesetzt ist. Diese tragen im Wert
     * den Vorsatz "standard/" und im Namen den Zusatz "Standard". So bleiben zwei
     * Vorlagen gleichen Namens unterscheidbar.
     */
    async listTemplates() {
      const { mitarbeiter, standardvorlagen } = await settings()
      const eigene = await scanTemplates(path.join(mitarbeiter, session.requireUser().name, 'immo24', 'templates'))
      const standard = standardvorlagen ? await scanTemplates(standardvorlagen) : []
      return [
        ...sortByLabel(
          eigene.map((option) => ({
            ...option,
            label: option.kind === 'package' ? `${option.label} (mit Clips)` : option.label,
          })),
        ),
        ...sortByLabel(
          standard.map((option) => ({
            ...option,
            label: option.kind === 'package' ? `${option.label} (Standard, mit Clips)` : `${option.label} (Standard)`,
            value: `${STANDARD_PREFIX}${option.value}`,
          })),
        ),
      ]
    },

    /** Für "vorhandenes Projekt": alle Projekte eines Kunden mit gültigen Metadaten, neueste zuerst. */
    async listProjects(kundeInput: unknown) {
      const kunde = String(kundeInput ?? '').trim()
      if (!kunde) throw new CoreError('kunde_required')
      if (!isSimpleName(kunde)) throw new CoreError('not_found')
      const { produktionen } = await settings()
      const rows = (await readCustomerProjects(produktionen, kunde)).map(({ ordner, meta }) => {
        if (!meta.erstellt_am || !meta.projektname || typeof meta.mo_id !== 'string' || !meta.user) return null
        return {
          date: String(meta.erstellt_am),
          projektname: String(meta.projektname),
          moid: meta.mo_id,
          user: String(meta.user),
          ordner,
          // Auch alte Projekte mit NOID oder xxxx gelten als "ohne MoID"
          ohneMoid: isPlaceholderMoid(meta.mo_id),
        }
      })
      // Neueste zuerst, bei gleichem Datum alphabetisch
      return rows
        .filter((row) => row !== null)
        .sort((a, b) => b.date.localeCompare(a.date) || a.projektname.localeCompare(b.projektname, 'de'))
    },

    /**
     * Legt ein neues Projekt an.
     * Erst wird alles geprüft, was vorab prüfbar ist. Geht beim Anlegen trotzdem
     * etwas schief, löschen wir bewusst nichts (wie Version 0.4): Ein halbes Projekt
     * bleibt liegen, und die Meldung nennt den Ordner. So kann das Aufräumen nie den
     * Ordner eines anderen Rechners treffen, der zur selben Zeit dasselbe Projekt anlegt.
     */
    async createProject(input: ProjectInput) {
      // Die MoIDs schreiben wir bei neuen Projekten immer groß und einheitlich getrennt
      const data = validate({ ...trimNames(input), moid: input?.ohneMoid ? '' : formatMoids(input?.moid) })
      const moidErrors = checkMoids(data.moid)
      if (moidErrors.length)
        throw new CoreError('validation_failed', { details: [{ field: 'moid', errors: moidErrors }] })
      const user = session.requireUser()
      const { produktionen, mitarbeiter, standardvorlagen, projektordnerSchema, sessionSchema } = await settings()

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
      const sources = templateSources({ mitarbeiter, standardvorlagen }, user.name, data.template)
      if (!(await exists(sources.ptxt))) throw new CoreError('template_missing', { template: data.template })

      const customerDir = path.join(produktionen, data.kunde)
      const values = {
        datum: data.datum,
        projektname: data.projektname,
        moid: data.moid,
        benutzer: user.kuerzel,
        kunde: data.kunde,
      }
      const folderName = fillTemplate(projektordnerSchema, values)
      const zielPfad = path.join(customerDir, data.moid ? folderName : tidyName(folderName))
      if (await exists(zielPfad)) throw new CoreError('project_exists', { zielPfad })

      // Eine MoID soll es beim Kunden nur einmal geben: Die Oberfläche führt dann zum Projekt
      const existing = await findProjectByMoid(produktionen, data.kunde, data.moid)
      if (existing) throw new CoreError('moid_vergeben', { projekt: existing })

      // Schritt 4: Anlegen. Ein fehlender Kundenordner wird dabei ergänzt.
      const customerFolderCreated = !(await exists(customerDir))
      const stageDir = path.join(zielPfad, data.stufe)
      try {
        if (customerFolderCreated)
          await fs.mkdir(customerDir).catch((error) => {
            if (error.code !== 'EEXIST') throw error
          })
        await fs.mkdir(zielPfad)
      } catch (error) {
        // Hat ein anderer Rechner den Ordner gerade eben angelegt, gehört er ihm
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new CoreError('project_exists', { zielPfad })
        throw error
      }
      try {
        await writeFileAtomic(
          path.join(zielPfad, 'immo24-proj.json'),
          `${JSON.stringify(
            {
              erstellt_am: data.datum,
              kunde: data.kunde,
              projektname: data.projektname,
              mo_id: data.moid,
              user: user.name,
            },
            null,
            2,
          )}\n`,
        )
        await Promise.all(unterordner.map((folder) => fs.mkdir(path.join(zielPfad, folder.name))))

        const filename = nextSessionName(
          [],
          sessionSchema,
          { ...values, produktionsstufe: stage.label, anmerkung: data.anmerkung ?? '' },
          [],
        )
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
        throw new CoreError('projekt_unvollstaendig', {
          zielPfad,
          ursache: error instanceof Error ? error.message : String(error),
        })
      }
    },

    /**
     * Legt in einem vorhandenen Projekt die nächste Session an.
     * Der Ordner kommt direkt aus der Projektliste. So finden wir das Projekt auch, wenn
     * das Namensschema inzwischen geändert wurde. Die Session bekommt das heutige Datum.
     */
    async addSession(input: ProjectInput) {
      // Die MoID bleibt hier unverändert: Sie muss zum vorhandenen Projekt passen.
      const data = validate(trimNames(input))
      const user = session.requireUser()
      const { produktionen, mitarbeiter, standardvorlagen, sessionSchema } = await settings()

      // Schritt 1: Projektordner prüfen. Er muss direkt unter dem Kunden liegen und ein
      // Projekt von uns sein, erkennbar an der Metadatei.
      const folderName = String(input?.ordner ?? '')
      if (!isSimpleName(folderName) || !isSimpleName(data.stufe)) throw new CoreError('not_found')
      const zielPfad = path.join(produktionen, data.kunde, folderName)
      if (!(await exists(path.join(zielPfad, 'immo24-proj.json')))) throw new CoreError('not_found')

      const values: Record<string, string> = {
        projektname: data.projektname.normalize('NFC'),
        moid: data.moid.normalize('NFC'),
        kunde: data.kunde.normalize('NFC'),
      }

      // Schritt 2: Stufenordner sicherstellen und Vorlage prüfen
      const stageDir = path.join(zielPfad, data.stufe)
      const sources = templateSources({ mitarbeiter, standardvorlagen }, user.name, data.template)
      if (!(await exists(sources.ptxt))) throw new CoreError('template_missing', { template: data.template })
      await fs.mkdir(stageDir, { recursive: true })

      // Schritt 3: Nächste Version bestimmen und anlegen. Das Label der Stufe kommt aus
      // den Stammdaten. Fehlt der Eintrag dort inzwischen, nehmen wir den Ordnernamen.
      const customers: Kunde[] = await stammdaten.readCustomers()
      const stage = customers
        .find((customer) => customer.kunde === data.kunde)
        ?.ordner?.find((item) => item.name === data.stufe)
      const filename = nextSessionName(
        await fs.readdir(stageDir),
        sessionSchema,
        {
          ...values,
          datum: localDate(),
          benutzer: user.kuerzel.normalize('NFC'),
          produktionsstufe: (stage?.label ?? data.stufe).normalize('NFC'),
          anmerkung: String(data.anmerkung ?? '').normalize('NFC'),
          // Auch Name und MoID zählen nicht: Nach dem Umbenennen zählt die Version weiter
        },
        ['datum', 'benutzer', 'projektname', 'moid'],
      )
      await copySession(sources, stageDir, filename)

      return { ok: true, zielPfad, templateDest: stageDir, filename }
    },
  }
}
