/**
 * Das Fehler-Logbuch des Programms.
 *
 * Alles Wichtige landet in der Datei logs/app.log im Einstellungsordner. Wenn etwas
 * schiefgeht, steht dort, was zuletzt passiert ist. Unerwartete Fehler bekommen
 * zusätzlich ein Fehlerfenster.
 */
import fs from 'node:fs'
import path from 'node:path'

import { app, dialog } from 'electron'

/** Schreibt eine Zeile mit Zeitstempel ins Logbuch und in die Konsole. */
export function logLine(...args: unknown[]): void {
  try {
    const logDir = path.join(app.getPath('userData'), 'logs')
    const ts = new Date().toISOString()
    const text = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')
    fs.mkdirSync(logDir, { recursive: true })
    fs.appendFileSync(path.join(logDir, 'app.log'), `[${ts}] ${text}\n`)
    console.log(...args)
  } catch {
    // Logging darf die App nie stoppen
  }
}

// Merkt sich, ob gerade ein Fehlerfenster offen ist, damit sich keine stapeln.
let errorBoxOpen = false

/** Zeigt ein Fehlerfenster, außer es ist schon eines offen. */
export function showOnceErrorBox(title: string, message: string): void {
  if (errorBoxOpen) return
  errorBoxOpen = true
  try {
    dialog.showErrorBox(title, message)
  } finally {
    errorBoxOpen = false
  }
}

/**
 * Fängt alle Fehler auf, die sonst niemand behandelt hat, und meldet sie.
 * Wird einmal beim Programmstart aufgerufen.
 */
export function installGlobalErrorHandlers(): void {
  process.on('uncaughtException', (err) => {
    logLine('[uncaughtException]', err?.stack || String(err))
    showOnceErrorBox('Unerwarteter Fehler', String(err?.message || err))
  })

  process.on('unhandledRejection', (reason) => {
    logLine('[unhandledRejection]', { reason: String(reason) })
    showOnceErrorBox('Unerwarteter Fehler (Promise)', String(reason))
  })
}
