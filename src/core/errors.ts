/**
 * Fehler, die das Backend bewusst meldet.
 *
 * Wenn zum Beispiel ein Passwort nicht übereinstimmt, ist das kein Absturz,
 * sondern ein erwarteter Fall, den die Oberfläche anzeigen soll. Dafür gibt es
 * diese eigene Fehlerklasse. Sie trägt einen festen Code, an dem die Oberfläche
 * erkennt, was passiert ist, und bei Bedarf Zusatzinfos.
 *
 * Alle anderen Fehler (z. B. eine Festplatte, die nicht reagiert) bleiben normale
 * JavaScript-Fehler und landen im Log.
 *
 * Wichtig: Dieser Ordner (src/core) enthält nur die Fachlogik. Er kennt weder
 * Electron noch Fenster. tests/core/architecture.test.ts prüft das automatisch.
 */

/** Alle Codes, die das Backend bisher melden kann. */
export type CoreErrorCode =
  | 'bad_payload'
  | 'version_conflict'
  | 'version_required'
  | 'no_stammdaten_path'
  | 'missing_password'
  | 'missing_fields'
  | 'password_mismatch'
  | 'mitarbeiter_required'
  | 'mitarbeiter_path_missing'

export class CoreError extends Error {
  /** Fester Code, z. B. "version_conflict". */
  readonly code: CoreErrorCode
  /** Zusatzinfos für die Oberfläche, z. B. die aktuelle Version. */
  readonly details: Record<string, unknown>

  constructor(code: CoreErrorCode, details: Record<string, unknown> = {}) {
    super(code)
    this.name = 'CoreError'
    this.code = code
    this.details = details
  }
}
