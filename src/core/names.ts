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
  code: 'forbidden_chars' | 'trailing_dot_or_space' | 'reserved_name' | 'moid_too_long' | 'moid_duplicate'
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

/** Ist das eine echte MoID oder nur ein Platzhalter wie NOID oder xxxx? */
export function isPlaceholderMoid(moid: unknown): boolean {
  const text = String(moid ?? '').trim()
  return text === '' || /^(no[ _-]?id|x{2,})$/i.test(text)
}

/**
 * Bringt die Eingabe ins gespeicherte Format: Aus "ab12 cd34" wird "AB12+CD34".
 * Ein Projekt kann mehrere MoIDs haben, etwa bei Kurz- und Langfassung in einer Session.
 * Gespeichert bleibt ein einziger Text, so kann auch Version 0.4 damit umgehen.
 */
export function formatMoids(input: unknown): string {
  return moidList(String(input ?? '').toUpperCase()).join('+')
}

/** Zerlegt eine oder mehrere MoIDs in eine Liste. Getrennt wird an Leerzeichen, Komma oder Plus. */
export function moidList(moids: unknown): string[] {
  return String(moids ?? '').split(/[\s,+]+/).filter(Boolean)
}

/** Prüft jede MoID einer Eingabe: höchstens vier Stellen und keine doppelt. Platzhalter sind frei. */
export function checkMoids(input: unknown): NameError[] {
  const list = moidList(formatMoids(input))
  const errors: NameError[] = []
  if (list.some((moid) => moid.length > 4 && !isPlaceholderMoid(moid))) {
    errors.push({ code: 'moid_too_long', message: 'Eine Mo-ID hat höchstens vier Stellen' })
  }
  if (new Set(list).size < list.length) {
    errors.push({ code: 'moid_duplicate', message: 'Eine Mo-ID steht doppelt in der Eingabe' })
  }
  return errors
}

/** Ersetzt im Text alle Platzhalter wie {{moid}} durch ihre Werte. */
export function fillTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/{{(\w+)}}/g, (_match, key: string) => values[key] || '')
}

/**
 * Räumt einen Namen auf, wenn ein Platzhalter leer geblieben ist, etwa die MoID:
 * "Spot  - Dialog" wird zu "Spot - Dialog", und übrig gebliebene Trenner am Rand fallen weg.
 */
export function tidyName(name: string): string {
  return name.replace(/\s+/g, ' ').replace(/^[\s_-]+|[\s_-]+$/g, '')
}

/** Macht aus einem Text mit Leerzeichen und " - " ein Suchmuster, das auch aufgeräumte Namen findet. */
export function looseSpaces(pattern: string): string {
  return pattern.replace(/ - /g, '\\s*-?\\s*').replace(/ /g, '\\s*')
}

/** Macht einen Text sicher für die Verwendung in einem regulären Ausdruck (Suchmuster). */
export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
