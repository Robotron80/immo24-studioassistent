/**
 * Das Produktionsbuch: die Kunden und ihre Ordnerstruktur.
 *
 * Liegt als kunden_stammdaten.json im Stammdaten-Ordner, damit alle Rechner
 * dieselben Daten sehen. Jeder Kunde hat zusätzlich einen Ordner unter Produktionen.
 *
 * Die Datei wird bei jedem Zugriff frisch gelesen. Wer sie von Hand oder auf einem
 * anderen Rechner ändert, wird also sofort berücksichtigt.
 */
import fs from 'node:fs/promises'
import path from 'node:path'

import type { ConfigService } from './config.ts'
import { CoreError } from './errors.ts'
import { exists, readJsonOrNull, writeJsonAtomic } from './files.ts'
import { comparableName } from './names.ts'
import { createVersionTracker } from './versions.ts'

/** Ein Unterordner in jedem Projekt eines Kunden. */
export interface Unterordner {
  name: string
  label: string
  /** Produktionsstufen sind die Ordner, in denen Pro Tools Sessions entstehen. */
  ist_Produktionsstufe?: boolean
}

export interface Kunde {
  kunde: string
  ordner?: Unterordner[]
}

/** Macht aus einem Kundennamen einen zulässigen Ordnernamen. */
function customerFolderName(name: unknown): string {
  return String(name ?? '')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/^\.+/, '')
    .replace(/\.+$/, '')
}

export type StammdatenService = ReturnType<typeof createStammdatenService>

export function createStammdatenService(config: ConfigService) {
  const version = createVersionTracker()

  async function file(): Promise<string> {
    const { data } = await config.getPaths()
    return path.join(String(data.PathStammdaten ?? ''), 'kunden_stammdaten.json')
  }

  /** Liest alle Kunden. Eine fehlende oder kaputte Datei ergibt eine leere Liste. */
  async function readCustomers(): Promise<Kunde[]> {
    const parsed = await readJsonOrNull(await file())
    return Array.isArray(parsed) ? parsed : []
  }

  /**
   * Legt für neue Kunden den Ordner unter Produktionen an.
   * Ein Ordner in anderer Schreibweise zählt als vorhanden. Fehlt der
   * Produktionen-Ordner selbst, ist vermutlich der Share nicht eingehängt:
   * Dann brechen wir ab, statt Ordner an falscher Stelle anzulegen.
   */
  async function createCustomerFolders(customers: Kunde[]): Promise<void> {
    const { data } = await config.getPaths()
    const base = String(data.PathProduktionen ?? '')
    if (!base || !(await exists(base))) throw new CoreError('produktionen_path_missing')

    const existing = new Set((await fs.readdir(base)).map(comparableName))
    for (const customer of customers) {
      const name = customerFolderName(customer?.kunde)
      if (!name || existing.has(comparableName(name))) continue
      await fs.mkdir(path.join(base, name))
      existing.add(comparableName(name))
    }
  }

  return {
    readCustomers,

    /** Für die Konfiguration: alle Kunden samt Version. */
    async getSnapshot() {
      return { customers: await readCustomers(), version: version.current() }
    },

    /** Speichert die Kunden alphabetisch sortiert und legt fehlende Kundenordner an. */
    async saveSnapshot(input: { version?: unknown; customers?: unknown }) {
      if (typeof input?.version !== 'string' || !Array.isArray(input.customers)) {
        throw new CoreError('bad_payload')
      }
      version.assertCurrent(input.version)

      const collator = new Intl.Collator('de', { sensitivity: 'base', numeric: true })
      const sorted = [...(input.customers as Kunde[])].sort((a, b) => collator.compare(
        String(a?.kunde ?? '').normalize('NFC').trim(),
        String(b?.kunde ?? '').normalize('NFC').trim(),
      ))

      await createCustomerFolders(sorted)
      await writeJsonAtomic(await file(), sorted)
      return { ok: true, version: version.bump() }
    },

    /** Für die Projektanlage: Kunden mit ihren Produktionsstufen als Auswahlliste. */
    async listForSelection() {
      return (await readCustomers()).map((customer) => ({
        label: customer.kunde,
        value: customer.kunde,
        stufen: (customer.ordner ?? [])
          .filter((folder) => folder.ist_Produktionsstufe)
          .map((folder) => ({ label: folder.label, value: folder.name })),
      }))
    },
  }
}
