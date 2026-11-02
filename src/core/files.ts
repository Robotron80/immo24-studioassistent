/**
 * Hilfsfunktionen zum sicheren Lesen und Schreiben von Dateien.
 * Wird von allen anderen Dateien in src/core benutzt.
 */
import { randomBytes } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

/** Liest eine Textdatei. Gibt null zurück, wenn es sie nicht gibt oder sie nicht lesbar ist. */
export async function readTextOrNull(file: string): Promise<string | null> {
  try {
    return await fs.readFile(file, 'utf8')
  } catch {
    return null
  }
}

/**
 * Liest eine JSON-Datei. Gibt null zurück, wenn sie fehlt oder kaputt ist.
 * Das Programm soll bei einer beschädigten Datei nicht abstürzen, sondern so
 * weitermachen, als wäre noch nichts eingerichtet.
 */
export async function readJsonOrNull(file: string): Promise<unknown> {
  const text = await readTextOrNull(file)
  if (text === null) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/**
 * Schreibt eine Datei "atomar", also ganz oder gar nicht.
 *
 * Würden wir direkt in die Zieldatei schreiben, bliebe bei einem Absturz oder
 * Netzwerkausfall mittendrin eine halb geschriebene Datei zurück. Deshalb:
 *   1. Inhalt in eine temporäre Datei im selben Ordner schreiben
 *   2. Die temporäre Datei auf den Zielnamen umbenennen
 * Das Umbenennen passiert in einem Schritt: Andere sehen also immer entweder
 * die alte oder die neue Datei, nie eine halbe.
 */
export async function writeFileAtomic(file: string, content: string): Promise<void> {
  const temp = path.join(path.dirname(file), `.${path.basename(file)}.${randomBytes(4).toString('hex')}.tmp`)
  try {
    await fs.writeFile(temp, content, 'utf8')
    await fs.rename(temp, file)
  } catch (error) {
    // Bei einem Fehler die temporäre Datei nicht liegen lassen
    await fs.rm(temp, { force: true }).catch(() => {})
    throw error
  }
}

/** Schreibt ein Objekt als lesbar eingerücktes JSON, im selben Format wie bisher. */
export async function writeJsonAtomic(file: string, value: unknown): Promise<void> {
  await writeFileAtomic(file, JSON.stringify(value, null, 2))
}

/** Prüft, ob es einen Ordner oder eine Datei unter diesem Pfad gibt. */
export async function exists(target: string): Promise<boolean> {
  try {
    await fs.access(target)
    return true
  } catch {
    return false
  }
}

/** Prüft, ob ein Wert ein normales Objekt ist (nicht null und kein Array). */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
