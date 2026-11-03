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
import { comparableName } from './names.ts'

/** Ist das eine echte MoID oder nur ein Platzhalter wie NOID oder xxxx? */
export function isPlaceholderMoid(moid: unknown): boolean {
  const text = String(moid ?? '').trim()
  return text === '' || /^(no[ _-]?id|x{2,})$/i.test(text)
}

export interface ExistingProject {
  kunde: string
  ordner: string
  projektname: string
  moid: string
  date: string
}

/**
 * Sucht im Ordner eines Kunden ein Projekt mit dieser MoID.
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
  if (isPlaceholderMoid(moid)) return null
  const wanted = comparableName(moid)
  const customerDir = path.join(produktionen, kunde)
  const entries = await fs.readdir(customerDir, { withFileTypes: true }).catch(() => [])
  const folders = entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== ignoreOrdner)
    .map((entry) => entry.name)

  const metas = await Promise.all(folders.map((ordner) => readJsonOrNull(path.join(customerDir, ordner, 'immo24-proj.json'))))
  for (const [index, meta] of metas.entries()) {
    if (!isPlainObject(meta) || typeof meta.mo_id !== 'string') continue
    if (comparableName(meta.mo_id) !== wanted) continue
    return {
      kunde,
      ordner: folders[index],
      projektname: String(meta.projektname ?? ''),
      moid: meta.mo_id,
      date: String(meta.erstellt_am ?? ''),
    }
  }
  return null
}
