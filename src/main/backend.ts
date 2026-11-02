/**
 * Verbindet die Oberfläche mit der Fachlogik in src/core.
 *
 * Die Oberfläche ruft eine Funktion über ihren Namen auf (siehe src/renderer/lib/backend.js),
 * die Anfrage kommt hier an und landet beim passenden Dienst. Nur Funktionen aus der
 * Liste unten sind von der Oberfläche aus erreichbar.
 *
 * Über die Leitung zwischen Fenster und Hauptprozess gehen eigene Fehlerklassen verloren.
 * Deshalb antwortet jeder Aufruf mit einem einfachen Objekt:
 *   { ok: true, data }                  hat geklappt
 *   { ok: false, error: { code, ... } } erwarteter Fehler, die Oberfläche zeigt ihn an
 */
import { app, ipcMain } from 'electron'

import { createConfigService } from '../core/config.ts'
import { CoreError } from '../core/errors.ts'
import { createPasswordService } from '../core/password.ts'
import { createPresetService } from '../core/presets.ts'
import { isProcessRunning } from '../core/processes.ts'
import { createProjectService, type ProjectInput } from '../core/projects.ts'
import { createRenameService, type RenameInput } from '../core/rename.ts'
import { createSessionService } from '../core/session.ts'
import { createStammdatenService } from '../core/stammdaten.ts'
import { createUserService } from '../core/users.ts'

import { logLine } from './logger'

/** Erstellt alle Dienste. Erst aufrufen, wenn der Einstellungsordner feststeht. */
function createServices() {
  const dir = app.getPath('userData')
  const config = createConfigService(dir)
  const session = createSessionService(config)
  const stammdaten = createStammdatenService(config)
  return {
    config,
    session,
    stammdaten,
    passwords: createPasswordService(dir),
    users: createUserService(config),
    projects: createProjectService(config, stammdaten, session),
    presets: createPresetService(config, session, isProcessRunning),
    rename: createRenameService(config, session, isProcessRunning),
  }
}

let services: ReturnType<typeof createServices> | undefined

/** Der Hauptprozess selbst braucht manche Dienste auch, z. B. für die Anmeldung. */
export function backend() {
  services ??= createServices()
  return services
}

/** Alle Funktionen, die die Oberfläche aufrufen darf. */
function exposedMethods(): Record<string, (arg: any) => unknown> {
  const { config, passwords, presets, projects, rename, session, stammdaten, users } = backend()
  return {
    getInitializeStatus: () => config.getInitializeStatus(),
    getPaths: () => config.getPaths(),
    savePaths: (input) => config.savePaths(input),
    getSchema: () => config.getSchema(),
    saveSchema: (input) => config.saveSchema(input),
    getModules: () => config.getModules(),
    saveModules: (input) => config.saveModules(input),

    isPasswordSet: () => passwords.isSet(),
    checkPassword: (password) => passwords.check(password),
    setPassword: (input) => passwords.set(input),

    listUsers: () => users.listUsers(),
    saveUsers: (input) => users.saveUsers(input),
    getActiveUser: () => session.getActiveUserName(),

    getSnapshot: () => stammdaten.getSnapshot(),
    saveSnapshot: (input) => stammdaten.saveSnapshot(input),
    listCustomers: () => stammdaten.listForSelection(),

    listTemplates: () => projects.listTemplates(),
    listProjects: (kunde) => projects.listProjects(kunde),
    createProject: async (input: ProjectInput) => {
      const result = await projects.createProject(input)
      if (result.kundenordnerAngelegt) logLine(`[projekt] Kundenordner angelegt: ${input.kunde}`)
      return result
    },
    addSession: (input: ProjectInput) => projects.addSession(input),

    isRenameEnabled: () => rename.isEnabled(),
    previewRename: (input: RenameInput) => rename.preview(input),
    renameProject: async (input: RenameInput) => {
      const result = await rename.rename(input)
      logLine(`[projekt] umbenannt: ${result.von} -> ${result.nach}${input.trotzSperre ? ' (trotz Sperrdatei)' : ''}`)
      return result
    },

    proToolsStatus: () => presets.proToolsStatus(),
    runProToolsPresets: (input) => presets.runProTools(input),
    soundminerStatus: () => presets.soundminerStatus(),
    runSoundminerPresets: (input) => presets.runSoundminer(input),
  }
}

// Mit dem Startparameter --immo24-debug wird jeder Aufruf protokolliert, zur Fehlersuche
const DEBUG = process.argv.includes('--immo24-debug')
// Bei diesen Aufrufen stehen Passwörter in den Daten, sie bleiben aus dem Log heraus
const SECRET_METHODS = new Set(['checkPassword', 'setPassword'])

/** Schreibt einen Aufruf samt Dauer ins Log. Tut ohne --immo24-debug nichts. */
function debugCall(method: string, arg: unknown, startedAt: number, outcome: string): void {
  if (!DEBUG) return
  const shownArg = SECRET_METHODS.has(method) || arg === undefined ? '' : ` ${JSON.stringify(arg)}`
  logLine(`[debug] ${method}${shownArg} -> ${outcome} (${Date.now() - startedAt} ms)`)
}

/** Nimmt die Aufrufe der Oberfläche entgegen. Einmal beim Programmstart aufrufen. */
export function registerBackendIpc(): void {
  const methods = exposedMethods()

  ipcMain.handle('backend', async (_event, method: string, arg: unknown) => {
    if (!Object.hasOwn(methods, method)) {
      return { ok: false, error: { code: 'unknown_method', message: method } }
    }
    const startedAt = Date.now()
    try {
      const data = await methods[method](arg)
      debugCall(method, arg, startedAt, 'ok')
      return { ok: true, data }
    } catch (error) {
      debugCall(method, arg, startedAt, error instanceof CoreError ? `Fehler ${error.code}` : `Fehler ${String(error)}`)
      if (error instanceof CoreError) {
        return { ok: false, error: { code: error.code, details: error.details } }
      }
      // Unerwartet, z. B. Speicher nicht erreichbar: ins Logbuch und an die Oberfläche
      const message = error instanceof Error ? error.message : String(error)
      logLine(`[backend] ${method}:`, error instanceof Error ? (error.stack ?? message) : message)
      return { ok: false, error: { code: 'internal', message } }
    }
  })
}
