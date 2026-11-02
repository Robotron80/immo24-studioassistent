const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const http = require('node:http')
const os = require('node:os')
const path = require('node:path')
const { setTimeout: delay } = require('node:timers/promises')
const test = require('node:test')
const express = require('express')
const RED = require('node-red')

test('embedded Node-RED loads the application flows with isolated user data', { timeout: 30000 }, async (t) => {
  const root = path.resolve(__dirname, '..')
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'immo24-backend-test-'))
  const previousUserData = process.env.IMMO24_USERDATA
  const previousHome = process.env.NODE_RED_HOME
  const app = express()
  const server = http.createServer(app)
  let initialized = false

  t.after(async () => {
    try {
      if (initialized) await RED.stop()
    } finally {
      server.closeAllConnections()
      if (server.listening) {
        await new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve()))
      }
      if (previousUserData === undefined) delete process.env.IMMO24_USERDATA
      else process.env.IMMO24_USERDATA = previousUserData
      if (previousHome === undefined) delete process.env.NODE_RED_HOME
      else process.env.NODE_RED_HOME = previousHome
      await fs.rm(dataDir, { recursive: true, force: true })
    }
  })

  process.env.IMMO24_USERDATA = dataDir
  process.env.NODE_RED_HOME = path.dirname(require.resolve('node-red/package.json'))
  for (const file of ['path.json', 'config.json', 'adminpw.json']) {
    await fs.writeFile(path.join(dataDir, file), '{}')
  }
  const flowFile = path.join(dataDir, 'flows.json')
  await fs.copyFile(path.join(root, 'tests/contract/flows.json'), flowFile)
  await RED.init(server, {
    httpAdminRoot: false,
    userDir: path.join(dataDir, 'node-red'),
    flowFile,
    coreNodesDir: path.dirname(require.resolve('@node-red/nodes/package.json')),
    logging: { console: { level: 'info' } },
    functionGlobalContext: {},
    contextStorage: { default: { module: 'memory' } },
    editorTheme: { disableEditor: true },
  })
  initialized = true
  app.use(RED.httpNode)
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  await RED.start()
  const base = `http://127.0.0.1:${server.address().port}`

  let ready = false
  for (let attempt = 0; attempt < 50; attempt++) {
    const response = await fetch(`${base}/api/ping`, { signal: AbortSignal.timeout(2000) })
    if (response.status === 200) {
      assert.deepEqual(await response.json(), { ok: true })
      ready = true
      break
    }
    assert.equal(response.status, 404)
    await delay(100)
  }
  assert.ok(ready, 'application flows must start')

  const flows = JSON.parse(await fs.readFile(flowFile, 'utf8'))
  for (const type of new Set(flows.map(node => node.type))) {
    if (['tab', 'group', 'subflow', 'global-config'].includes(type) || type.startsWith('subflow:')) continue
    assert.ok(RED.nodes.getType(type), `flow node type must be registered: ${type}`)
  }

  const paths = await fetch(`${base}/api/paths`, { signal: AbortSignal.timeout(5000) })
  assert.equal(paths.status, 200)
  const pathsBody = await paths.json()
  assert.deepEqual(pathsBody.data, {})
  assert.equal(typeof pathsBody.version, 'string')

  const initialize = await fetch(`${base}/api/initialize`, { signal: AbortSignal.timeout(5000) })
  assert.equal(initialize.status, 503)
  const status = await initialize.json()
  assert.equal(status.ready, true)
  assert.equal(status.initialize.needsUserAction, true)
  assert.equal(status.initialize.required_keys_ok, false)
  assert.deepEqual(status.initialize.missingKeys, ['PathProduktionen', 'PathMitarbeiter'])
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(dataDir, 'path.json'), 'utf8')), {})
})
