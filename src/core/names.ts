/**
 * Regeln für Namen, aus denen Ordner und Dateien entstehen.
 */

/**
 * Vereinheitlicht einen Namen für den Vergleich.
 * macOS und Windows speichern Umlaute intern unterschiedlich. Ohne normalize()
 * würde "Ärger" vom Mac nicht als "Ärger" von Windows erkannt.
 */
export function comparableName(name: string): string {
  return name.normalize('NFC').toLowerCase()
}

export interface NameError {
  code: 'forbidden_chars' | 'trailing_dot_or_space' | 'reserved_name'
  message: string
  chars?: string[]
}

/**
 * Prüft, ob ein Name als Ordner- oder Dateiname taugt.
 * Windows ist am strengsten. Da beide Systeme denselben Speicher nutzen,
 * gelten seine Regeln überall.
 */
export function checkWindowsName(input: unknown): NameError[] {
  const name = String(input ?? '').trim()
  const errors: NameError[] = []

  const forbidden = name.match(/[<>:"/\\|?*\u0000-\u001F]/g)
  if (forbidden) {
    const chars = [...new Set(forbidden)]
    errors.push({ code: 'forbidden_chars', chars, message: `Unzulässige Zeichen: ${chars.join(' ')}` })
  }
  if (/[. ]$/.test(name)) {
    errors.push({ code: 'trailing_dot_or_space', message: 'Darf nicht mit Punkt oder Leerzeichen enden' })
  }
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\..*)?$/i.test(name)) {
    errors.push({ code: 'reserved_name', message: 'Reservierter Windows-Name' })
  }
  return errors
}

/** Ersetzt im Text alle Platzhalter wie {{moid}} durch ihre Werte. */
export function fillTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/{{(\w+)}}/g, (_match, key: string) => values[key] || '')
}

/** Macht einen Text sicher für die Verwendung in einem regulären Ausdruck (Suchmuster). */
export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
