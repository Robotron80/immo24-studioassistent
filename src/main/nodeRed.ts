/**
 * Eingebettetes Node-RED-Backend.
 * Übergangslösung: Die Module wandern schrittweise nach TypeScript, danach entfällt diese Datei.
 */
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'

import { app } from 'electron'
import express from 'express'
import RED from 'node-red'

import { logLine } from './logger'
import { assetPath } from './paths'

export const NODE_RED_HOST = '127.0.0.1'
export const NODE_RED_PORT = 59593

const keepAliveAgent = new http.Agent({ keepAlive: true })

// CLI-Schalter: --dev-backend → Flows im UserDir bearbeitbar, Admin-UI aktiv
if (process.argv.slice(1).includes('--dev-backend')) {
  process.env.IMMO24_DEV_BACKEND = '1'
}
export const DEV_BACKEND = process.env.IMMO24_DEV_BACKEND === '1'

let redServer: http.Server | undefined
let redStarted = false

export interface InitializeStatus {
  ok?: boolean
  ready?: boolean
  initialize?: { needsUserAction?: boolean }
  user?: Array<{ name: string }>
}

// ────────────────────────────── HTTP-API ──────────────────────────────
function apiRequest(apiPath: string, method: 'GET' | 'POST', payload?: unknown, timeoutMs?: number): Promise<{ status: number; body: string } | null> {
  return new Promise((resolve) => {
    const data = payload === undefined ? undefined : Buffer.from(JSON.stringify(payload))
    const req = http.request(
      {
        host: NODE_RED_HOST,
        port: NODE_RED_PORT,
        path: apiPath,
        method,
        agent: keepAliveAgent,
        headers: data ? { 'Content-Type': 'application/json', 'Content-Length': data.length } : undefined,
      },
      (res) => {
        let body = ''
        res.setEncoding('utf8')
        res.on('data', (chunk) => (body += chunk))
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body }))
      },
    )
    if (timeoutMs) {
      req.setTimeout(timeoutMs, () => req.destroy(new Error('timeout')))
    }
    req.on('error', () => resolve(null))
    if (data) req.write(data)
    req.end()
  })
}

function isSuccess(status: number): boolean {
  return status >= 200 && status < 300
}

export async function fetchReadyStatus(): Promise<{ ok: boolean }> {
  const res = await apiRequest('/api/ping', 'GET', undefined, 1500)
  return { ok: !!res && isSuccess(res.status) }
}

export async function fetchInitializeStatus(): Promise<InitializeStatus> {
  const res = await apiRequest('/api/initialize', 'GET', undefined, 3000)
  if (!res) return { ok: false }
  try {
    return JSON.parse(res.body) as InitializeStatus
  } catch {
    return { ok: res.status >= 200 && res.status < 400 }
  }
}

export async function getUsers(): Promise<string[]> {
  const res = await apiRequest('/api/user', 'GET')
  if (!res) return []
  try {
    const users = JSON.parse(res.body) as Array<{ name: string }>
    return Array.isArray(users) ? users.map((u) => u.name) : []
  } catch {
    return []
  }
}

export async function postActiveUser(user: string): Promise<boolean> {
  const res = await apiRequest('/api/login', 'POST', { user })
  return !!res && isSuccess(res.status)
}

export async function postLogout(timeoutMs = 1200): Promise<boolean> {
  const res = await apiRequest('/api/logout', 'POST', undefined, timeoutMs)
  return !!res && isSuccess(res.status)
}

// ────────────────────────────── Seed & Defaults ──────────────────────────────
function resolveSeedDir(): string | null {
  const fromEnv = process.env.IMMO24_NODERED_SEED
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv
  const bundled = assetPath('node-red')
  return fs.existsSync(bundled) ? bundled : null
}

function ensureDefaults(userDir: string): void {
  const flowsPath = path.join(userDir, 'flows.json')
  if (fs.existsSync(flowsPath)) return
  const seedDir = resolveSeedDir()
  if (seedDir && fs.existsSync(path.join(seedDir, 'flows.json'))) {
    fs.cpSync(seedDir, userDir, { recursive: true })
    return
  }
  fs.mkdirSync(userDir, { recursive: true })
  fs.writeFileSync(flowsPath, '[]', 'utf8')
  const credsPath = path.join(userDir, 'flows_cred.json')
  if (!fs.existsSync(credsPath)) fs.writeFileSync(credsPath, '{}', 'utf8')
}

// ────────────────────────────── Start & Stopp ──────────────────────────────
export async function startNodeRed(): Promise<void> {
  const userDir = path.join(app.getPath('userData'), 'node-red')
  fs.mkdirSync(userDir, { recursive: true })
  process.env.IMMO24_USERDATA ||= app.getPath('userData')
  if (DEV_BACKEND) ensureDefaults(userDir)

  const redApp = express()
  const server = http.createServer(redApp)
  redServer = server

  process.env.NODE_RED_HOME = path.dirname(require.resolve('node-red/package.json'))
  logLine(`[Node-RED] HOME = ${process.env.NODE_RED_HOME}`)

  const seedDir = resolveSeedDir()
  const settings = {
    // Admin-UI nur im Dev-Backend, sonst komplett aus
    httpAdminRoot: DEV_BACKEND ? '/red' : false,
    userDir,
    // Dev-Backend: Flows aus dem UserDir, sonst schreibgeschützt aus den Assets
    flowFile: DEV_BACKEND || !seedDir ? 'flows.json' : path.join(seedDir, 'flows.json'),
    coreNodesDir: path.dirname(require.resolve('@node-red/nodes/package.json')),
    logging: { console: { level: 'info' } },
    functionGlobalContext: {},
    contextStorage: { default: { module: 'memory' } },
    editorTheme: { disableEditor: !DEV_BACKEND },
    // Sonst ruft Node-RED beim Start process.execPath auf, was in Electron die App selbst ist
    externalModules: { palette: { allowInstall: false } },
  }

  await RED.init(server, settings)
  if (settings.httpAdminRoot) redApp.use(settings.httpAdminRoot, RED.httpAdmin)
  redApp.use(RED.httpNode)

  await new Promise<void>((resolve, reject) => {
    server.once('error', (err: NodeJS.ErrnoException) => {
      reject(
        err.code === 'EADDRINUSE'
          ? new Error(`Port ${NODE_RED_PORT} ist belegt. Läuft noch eine andere Version des Studioassistenten?`)
          : err,
      )
    })
    server.listen(NODE_RED_PORT, NODE_RED_HOST, () => resolve())
  })

  await RED.start()
  redStarted = true
  logLine(`Node-RED läuft auf http://${NODE_RED_HOST}:${NODE_RED_PORT}`)
}

export async function stopNodeRed(): Promise<void> {
  if (!redStarted) return
  redStarted = false
  await RED.stop()
  await new Promise<void>((resolve) => {
    if (redServer) redServer.close(() => resolve())
    else resolve()
  })
}
