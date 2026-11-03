/**
 * Alle wichtigen Pfade des Programms an einer Stelle.
 *
 * Der Grund: Im Entwicklungsmodus und in der installierten App liegen die Dateien
 * an anderen Orten. Die übrigen Dateien fragen deshalb hier nach, statt Pfade
 * selbst zusammenzubauen.
 */
import path from 'node:path'

import { app } from 'electron'

/**
 * Legt fest, wo die Einstellungen gespeichert werden. Muss vor allem anderen laufen.
 * Next-Builds nutzen einen eigenen Ordner, damit die installierte Version unberührt bleibt.
 */
export function configureUserData(): void {
  // Für automatische Tests: eigener Ordner, damit sie eine laufende App nicht stören
  if (process.env.IMMO24_USER_DATA) {
    app.setPath('userData', process.env.IMMO24_USER_DATA)
  } else if (app.getVersion().includes('-next')) {
    app.setPath('userData', path.join(app.getPath('appData'), 'immo24-studioassistent-next'))
  }
}

/** Pfad zu einer Datei im Ordner assets, z. B. zum Ladefenster loading.html. */
export function assetPath(...segments: string[]): string {
  return path.join(app.getAppPath(), 'assets', ...segments)
}

/** Pfad zur gebauten Oberfläche, die die Fenster laden. */
export function rendererIndexPath(): string {
  return path.join(app.getAppPath(), 'dist', 'index.html')
}

/** Pfad zum Preload-Skript, der Brücke zwischen Fenster und Hauptprozess (siehe preload.ts). */
export function preloadPath(): string {
  return path.join(__dirname, 'preload.js')
}

/**
 * Adresse des Vite-Entwicklungsservers. Nur bei `npm run dev` gesetzt:
 * Die Oberfläche kommt dann vom Server und aktualisiert sich bei Änderungen sofort.
 */
export function devServerUrl(): string | undefined {
  return process.env.VITE_DEV_SERVER_URL?.replace(/\/+$/, '')
}
