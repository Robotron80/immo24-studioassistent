/**
 * Spielt das Konfigurations-Szenario auf dem echten Node-RED ab und vergleicht
 * es mit der Referenz. Der Gegenpart für das neue Backend: tests/core/config.test.ts
 */
const test = require('node:test')
const { expectReference, startBackend } = require('./harness.cjs')
const runConfigScenario = require('./scenarios/config.cjs')

test('Ersteinrichtung und Konfiguration', { timeout: 60000 }, async (t) => {
  const backend = await startBackend()
  t.after(() => backend.stop())
  await runConfigScenario(backend)
  expectReference('config', backend.steps)
})
