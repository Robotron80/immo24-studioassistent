/**
 * Das Datum, wie es im Studio an der Wand hängt.
 *
 * toISOString() rechnet in UTC. In Deutschland ist es dort ein bis zwei Stunden früher,
 * kurz nach Mitternacht käme also noch der Vortag heraus. Deshalb hier die Ortszeit.
 */

/** Gibt ein Datum im Format JJJJ-MM-TT in Ortszeit zurück, ohne Angabe das heutige. */
export function localDate(date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}
