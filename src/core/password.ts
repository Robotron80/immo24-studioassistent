/**
 * Das Passwort für das Konfigurationsmenü.
 *
 * Es ist eine Sperre gegen versehentliche Änderungen, kein Sicherheitsmerkmal.
 * Deshalb liegt es bewusst lesbar in adminpw.json im Einstellungsordner:
 * nachschauen geht jederzeit. Das Passwort entsteht im Einrichtungsassistenten. Wer die
 * Datei löscht, setzt es zurück: Ohne gesetztes Passwort ist die Konfiguration offen.
 *
 * Format: { "password": "..." }. Version 0.4 liest und schreibt dasselbe.
 * Ältere Dateien können das Passwort auch als reinen Text enthalten.
 */
import path from 'node:path'

import { CoreError } from './errors.ts'
import { isPlainObject, readTextOrNull, writeJsonAtomic } from './files.ts'

export type PasswordService = ReturnType<typeof createPasswordService>

export function createPasswordService(userDataDir: string) {
  const file = path.join(userDataDir, 'adminpw.json')

  /** Liest das gespeicherte Passwort. Fehlende Datei oder {} heißt: keines gesetzt. */
  async function readStored(): Promise<string | null> {
    const raw = (await readTextOrNull(file))?.trim()
    if (!raw) return null
    try {
      const parsed = JSON.parse(raw)
      if (isPlainObject(parsed)) return typeof parsed.password === 'string' && parsed.password ? parsed.password : null
    } catch {
      // Kein JSON: Der Text selbst ist das Passwort
    }
    return raw
  }

  return {
    /** Muss die Oberfläche überhaupt nach einem Passwort fragen? */
    async isSet(): Promise<boolean> {
      return (await readStored()) !== null
    },

    /** Prüft die Eingabe. Ist kein Passwort gesetzt, passt jede Eingabe. */
    async check(password: unknown): Promise<boolean> {
      const given = String(password ?? '')
      if (!given) throw new CoreError('missing_password')
      const stored = await readStored()
      return stored === null || given === stored
    },

    /** Setzt ein neues Passwort, wenn beide Eingaben übereinstimmen. */
    async set(input: { newPassword?: unknown; repeatPassword?: unknown }): Promise<void> {
      const next = String(input?.newPassword ?? '')
      const repeat = String(input?.repeatPassword ?? '')
      if (!next || !repeat) throw new CoreError('missing_fields')
      if (next !== repeat) throw new CoreError('password_mismatch')
      await writeJsonAtomic(file, { password: next })
    },
  }
}
