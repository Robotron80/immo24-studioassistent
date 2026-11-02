/**
 * Versionsnummern gegen versehentliches Überschreiben.
 *
 * Das Problem: Sind zwei Fenster offen und speichert das eine, würde das andere
 * beim Speichern dessen Änderungen mit seinem veralteten Stand überschreiben.
 *
 * Die Lösung: Wer Daten liest, bekommt eine Versionsnummer mit und muss sie beim
 * Speichern wieder mitschicken. Passt sie nicht mehr, wird das Speichern
 * abgelehnt ("version_conflict"), und die Oberfläche kann die Daten neu laden.
 *
 * Die Nummern gelten nur, solange das Programm läuft, und werden nicht gespeichert.
 * Sie schützen daher vor zwei Fenstern, aber nicht vor einem zweiten Rechner.
 */
import { CoreError } from './errors.ts'

export interface VersionTracker {
  /** Liefert die aktuelle Version und legt beim ersten Aufruf eine an. */
  current(): string
  /** Wirft einen Fehler, wenn die mitgeschickte Version veraltet ist. */
  assertCurrent(version: string): void
  /** Erzeugt nach dem Speichern eine neue Version und gibt sie zurück. */
  bump(): string
}

// Merkt sich die zuletzt vergebene Zeit, damit zwei Versionen in derselben
// Millisekunde trotzdem verschieden sind.
let lastIssued = 0

function nextVersion(): string {
  lastIssued = Math.max(Date.now(), lastIssued + 1)
  return String(lastIssued)
}

/** Erstellt einen eigenen Versionszähler, einen pro Datenart (Pfade, Module, ...). */
export function createVersionTracker(): VersionTracker {
  let version: string | null = null

  function current(): string {
    version ??= nextVersion()
    return version
  }

  return {
    current,
    assertCurrent(clientVersion) {
      const currentVersion = current()
      if (clientVersion !== currentVersion) {
        throw new CoreError('version_conflict', { currentVersion })
      }
    },
    bump() {
      version = nextVersion()
      return version
    },
  }
}
