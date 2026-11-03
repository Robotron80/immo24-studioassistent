/**
 * Regeln rund um die MoID, die Kennung eines Projekts in der Postproduktions-Datenbank.
 *
 * Eine MoID soll es nur einmal geben. Manche Projekte haben aber keine, weil sie nicht in der
 * Datenbank stehen. Früher wurde dort NOID oder xxxx eingetragen. Solche alten Projekte
 * liegen weiter auf dem Speicher und gelten als "ohne MoID".
 */
import fs from 'node:fs/promises'
import path from 'node:path'

import { isPlainObject, readJsonOrNull } from './files.ts'
import { comparableName, isPlaceholderMoid, moidList } from './names.ts'

export interface ExistingProject {
  kunde: string
  ordner: string
  projektname: string
  moid: string
  date: string
}

/**
 * Sucht im Ordner eines Kunden ein Projekt, das eine dieser MoIDs trägt.
 * Im Ergebnis steht unter moid nur die MoID, die übereinstimmt, nicht alle des Projekts.
 *
 * Bewusst nur beim Kunden: Den ganzen Speicher zu durchsuchen dauert im Studio viel zu
 * lange. Bei verschiedenen Kunden kann eine MoID deshalb doppelt vorkommen.
 * ignoreOrdner: das Projekt selbst, damit es sich beim Umbenennen nicht selbst findet.
 */
export async function findProjectByMoid(
  produktionen: string,
  kunde: string,
  moid: string,
  ignoreOrdner?: string,
): Promise<ExistingProject | null> {
  const wanted = new Set(moidList(moid).filter((item) => !isPlaceholderMoid(item)).map(comparableName))
  if (wanted.size === 0) return null
  const customerDir = path.join(produktionen, kunde)
  const entries = await fs.readdir(customerDir, { withFileTypes: true }).catch(() => [])
  const folders = entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== ignoreOrdner)
    .map((entry) => entry.name)

  const metas = await Promise.all(folders.map((ordner) => readJsonOrNull(path.join(customerDir, ordner, 'immo24-proj.json'))))
  for (const [index, meta] of metas.entries()) {
    if (!isPlainObject(meta) || typeof meta.mo_id !== 'string') continue
    const match = moidList(meta.mo_id).find((item) => wanted.has(comparableName(item)))
    if (!match) continue
    return {
      kunde,
      ordner: folders[index],
      projektname: String(meta.projektname ?? ''),
      moid: match,
      date: String(meta.erstellt_am ?? ''),
    }
  }
  return null
}
