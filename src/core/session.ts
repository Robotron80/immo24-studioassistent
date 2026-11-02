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

export type SessionService = ReturnType<typeof createSessionService>

export function createSessionService(config: ConfigService) {
  let activeUser: { name: string; kuerzel: string } | null = null

  return {
    /** Meldet einen Mitarbeiter an und gibt sein Kürzel zurück. */
    async login(name: string): Promise<string> {
      const { data } = await config.getPaths()
      const file = path.join(String(data.PathMitarbeiter ?? ''), name, 'immo24', 'immo24-user.json')
      const kuerzel = (await readTextOrNull(file))?.trim() ?? ''
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
