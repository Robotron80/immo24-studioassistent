/**
 * Die Anmeldung: Wer arbeitet gerade an diesem Rechner?
 *
 * Es gibt nur Name und Kürzel, kein Passwort, und nur solange das Programm läuft.
 * Name und Kürzel fließen in Projekte und Sessionnamen ein.
 */
import path from 'node:path'

import type { ConfigService } from './config.ts'
import { CoreError } from './errors.ts'
import { readTextOrNull } from './files.ts'
import { isSimpleName } from './names.ts'

export type SessionService = ReturnType<typeof createSessionService>

export function createSessionService(config: ConfigService) {
  let activeUser: { name: string; kuerzel: string } | null = null

  return {
    /**
     * Meldet einen Mitarbeiter an und gibt sein Kürzel zurück. Nur wer ein Kürzel hat,
     * ist ein Mitarbeiter (wie in der Anmeldeliste), andere Namen werden abgewiesen.
     */
    async login(name: string): Promise<string> {
      if (!isSimpleName(name)) throw new CoreError('not_found')
      const { data } = await config.getPaths()
      const file = path.join(String(data.PathMitarbeiter ?? ''), name, 'immo24', 'immo24-user.json')
      const kuerzel = (await readTextOrNull(file))?.trim() ?? ''
      if (!kuerzel) throw new CoreError('not_found')
      activeUser = { name, kuerzel }
      return kuerzel
    },

    logout(): void {
      activeUser = null
    },

    getActiveUserName(): string | null {
      return activeUser?.name ?? null
    },

    /** Für Abläufe, die nur mit Anmeldung möglich sind, z. B. die Projektanlage. */
    requireUser(): { name: string; kuerzel: string } {
      if (!activeUser) throw new CoreError('not_logged_in')
      return activeUser
    },
  }
}
