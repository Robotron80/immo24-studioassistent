import path from 'node:path'

import { app } from 'electron'

/** Next-Builds nutzen eigene Benutzerdaten, damit die installierte Version unberührt bleibt. */
export function configureUserData(): void {
  if (app.getVersion().includes('-next')) {
    app.setPath('userData', path.join(app.getPath('appData'), 'immo24-studioassistent-next'))
  }
}

export function assetPath(...segments: string[]): string {
  return path.join(app.getAppPath(), 'assets', ...segments)
}

export function rendererIndexPath(): string {
  return path.join(app.getAppPath(), 'dist', 'index.html')
}

export function preloadPath(): string {
  return path.join(__dirname, 'preload.js')
}

export function devServerUrl(): string | undefined {
  return process.env.VITE_DEV_SERVER_URL?.replace(/\/+$/, '')
}
