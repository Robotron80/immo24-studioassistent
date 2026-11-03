/**
 * Beschreibt für die Typprüfung, was preload.ts im Fenster bereitstellt.
 */
interface BackendResponse {
  ok: boolean
  data?: unknown
  error: { code: string; details?: Record<string, any>; message?: string }
}

interface Window {
  electronAPI: {
    getAppVersion(): Promise<string>
    backend(method: string, arg?: unknown): Promise<BackendResponse>
    openSession(file: string): Promise<string>
    pickFolder(title?: string, defaultPath?: string): Promise<string | null>
    onConfigChanged(callback: () => void): () => void
    hideAndOpenPicker(options?: { doLogout?: boolean }): Promise<{ ok: boolean }>
    closeInitWindow(): Promise<boolean>
  }
  picker: {
    choose(user: string): void
    quit(): void
  }
}

declare module 'vuetify/styles'
