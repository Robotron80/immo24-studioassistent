/**
 * Prüft, ob Pro Tools oder Soundminer gerade läuft.
 *
 * Manche Presets dürfen nicht kopiert werden, solange das Programm offen ist. Ein
 * Fehlschlag der Abfrage zählt als "läuft nicht", damit sie niemanden aussperrt.
 */
import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'

import type { IsProcessRunning } from './presets.ts'

const run = promisify(execFile)

// Voller Pfad, damit keine gleichnamige Datei an anderer Stelle (z. B. im Programmordner) startet
const TASKLIST = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tasklist.exe')
const WINDOWS_EXE = { protools: 'ProTools.exe', soundminer: 'Soundminer v6.exe' }
const MAC_PROCESS = { protools: 'Pro Tools', soundminer: 'Soundminer' }

/** Läuft unter Windows mit tasklist, das ist deutlich schneller als PowerShell. */
export const isProcessRunning: IsProcessRunning = async (app) => {
  try {
    if (process.platform === 'win32') {
      const { stdout } = await run(TASKLIST, ['/FI', `IMAGENAME eq ${WINDOWS_EXE[app]}`, '/NH'], { timeout: 5000 })
      return stdout.toLowerCase().includes(WINDOWS_EXE[app].toLowerCase())
    }
    if (process.platform === 'darwin') {
      // pgrep braucht keine Berechtigung, anders als eine Abfrage über "System Events".
      // -x heißt: exakter Name, die Hilfsprozesse wie "Pro Tools Helper" zählen also nicht.
      // Findet es nichts, endet es mit einem Fehlercode und wir landen unten im catch.
      await run('/usr/bin/pgrep', ['-x', MAC_PROCESS[app]], { timeout: 5000 })
      return true
    }
  } catch {
    // Abfrage nicht möglich: gilt als "läuft nicht"
  }
  return false
}
