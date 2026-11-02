/**
 * Übersetzer zwischen den Vergleichstests und dem neuen Backend.
 *
 * Die Szenarien in tests/contract/scenarios sprechen die alten Web-Adressen an,
 * z. B. "GET /api/paths". Das neue Backend hat keine Web-Adressen, sondern normale
 * Funktionen. Diese Datei übersetzt zwischen beiden und gehört nur zu den Tests.
 */
import { createConfigService } from '../../src/core/config.ts'
import { CoreError } from '../../src/core/errors.ts'
import { createPasswordService } from '../../src/core/password.ts'
import { createPresetService } from '../../src/core/presets.ts'
import { createProjectService } from '../../src/core/projects.ts'
import { createSessionService } from '../../src/core/session.ts'
import { createStammdatenService } from '../../src/core/stammdaten.ts'
import { createUserService } from '../../src/core/users.ts'

export interface AdapterResponse {
  status: number
  body: unknown
}

/** Übersetzt einen gemeldeten Fehler in die Antwort, die Node-RED gegeben hat. */
function toResponse(error: CoreError, key: string): AdapterResponse {
  switch (error.code) {
    case 'version_conflict':
    case 'version_required':
      return { status: 409, body: { error: error.code, ...error.details } }
    case 'missing_password':
    case 'missing_fields':
      return { status: 400, body: { ok: false, error: error.code } }
    case 'password_mismatch':
      return { status: 422, body: { ok: false, error: error.code } }
    case 'mitarbeiter_required':
      return { status: 400, body: { error: 'mitarbeiter array required' } }
    case 'project_fields_missing':
      return {
        status: 400,
        body: { error: key.includes('resolve-existing') ? 'missing' : 'missing fields', ...error.details },
      }
    case 'validation_failed':
      return { status: 422, body: { error: error.code, ...error.details } }
    case 'project_exists':
      return { status: 409, body: { error: 'Das Projekt existiert bereits.', ...error.details } }
    case 'not_found':
      return { status: 404, body: { error: error.code } }
    case 'kunde_required':
      return { status: 400, body: { error: 'kunde required' } }
    default:
      return { status: 400, body: { error: error.code } }
  }
}

/** Erstellt eine request-Funktion, die das neue Backend wie Node-RED ansprechbar macht. */
export function createCoreRequest(userDataDir: string) {
  const config = createConfigService(userDataDir)
  const passwords = createPasswordService(userDataDir)
  const users = createUserService(config)
  const session = createSessionService(config)
  const stammdaten = createStammdatenService(config)
  const projects = createProjectService(config, stammdaten, session)
  // In den Tests läuft weder Pro Tools noch Soundminer
  const presets = createPresetService(config, session, async () => false)

  /** Node-RED antwortete mit 207, wenn nicht alles glatt lief. */
  const presetResponse = (body: { details: Array<{ status: string }> }): AdapterResponse => ({
    status: body.details.every((detail) => detail.status === 'ok') ? 200 : 207,
    body,
  })

  async function route(key: string, url: URL, body: any): Promise<AdapterResponse> {
    switch (key) {
      case 'GET /api/ping':
        return { status: 200, body: { ok: true } }
      case 'GET /api/initialize': {
        const status = await config.getInitializeStatus()
        return { status: status.paths ? 200 : 503, body: status }
      }
      case 'GET /api/paths':
        return { status: 200, body: await config.getPaths() }
      case 'PUT /api/paths':
        return { status: 200, body: await config.savePaths(body) }
      case 'GET /api/schema': {
        const schema = await config.getSchema()
        return { status: schema.version === null ? 404 : 200, body: schema }
      }
      case 'PUT /api/schema':
        return { status: 200, body: await config.saveSchema(body) }
      case 'POST /api/check-password': {
        const ok = await passwords.check(body?.password)
        return { status: ok ? 200 : 401, body: { ok } }
      }
      case 'POST /api/adminpw':
        await passwords.set(body)
        return { status: 200, body: { ok: true } }
      case 'GET /api/modules':
        return { status: 200, body: await config.getModules() }
      case 'PUT /api/modules':
        return { status: 200, body: await config.saveModules(body) }
      case 'GET /api/user':
        return { status: 200, body: await users.listUsers() }
      case 'POST /api/user':
        return { status: 200, body: await users.saveUsers(body) }
      case 'POST /api/login':
        return { status: 200, body: await session.login(body?.user) }
      case 'POST /api/logout':
        session.logout()
        return { status: 200, body: '' }
      case 'GET /api/activeUser':
        return { status: 200, body: session.getActiveUserName() }
      case 'GET /api/pb/snapshot':
        return { status: 200, body: await stammdaten.getSnapshot() }
      case 'PUT /api/pb/snapshot':
        return { status: 200, body: await stammdaten.saveSnapshot(body) }
      case 'GET /api/projektanlage/kunden':
        return { status: 200, body: await stammdaten.listForSelection() }
      case 'GET /api/projektanlage/templates':
        return { status: 200, body: await projects.listTemplates() }
      case 'GET /api/projektanlage/projekte':
        return { status: 200, body: await projects.listProjects(url.searchParams.get('kunde')) }
      case 'POST /api/projektanlage/projekte':
        return { status: 200, body: await projects.createProject(body) }
      case 'POST /api/projektanlage/resolve-existing': {
        // Node-RED suchte den Ordner selbst, die Oberfläche kennt ihn aus der Projektliste
        const rows = await projects.listProjects(body?.kunde).catch(() => [])
        const row = rows.find((item) => item.projektname === body?.projektname && item.moid === body?.moid && item.date === body?.datum)
        return { status: 200, body: await projects.addSession({ ...body, ordner: row?.ordner }) }
      }
      case 'POST /api/protools/presets':
        return presetResponse(await presets.runProTools(body))
      case 'POST /api/soundminer/presets':
        return presetResponse(await presets.runSoundminer(body))
      default:
        throw new Error(`Im Adapter noch nicht vorhanden: ${key}`)
    }
  }

  return async function request(method: string, target: string, body?: unknown): Promise<AdapterResponse> {
    const url = new URL(target, 'http://adapter')
    const key = `${method} ${url.pathname}`
    try {
      return await route(key, url, body)
    } catch (error) {
      if (error instanceof CoreError) return toResponse(error, key)
      throw error
    }
  }
}
