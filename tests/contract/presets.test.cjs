/**
 * Spielt das Preset-Szenario auf dem echten Node-RED ab und vergleicht es mit der
 * Referenz. Der Gegenpart für das neue Backend: tests/core/presets.test.ts
 */
const test = require('node:test')
const { expectReference, seedConfigured, startBackend } = require('./harness.cjs')
const { runPresetsScenario } = require('./scenarios/presets.cjs')

test('Pro-Tools- und Soundminer-Presets', { timeout: 120000 }, async (t) => {
  const backend = await startBackend({ seed: seedConfigured })
  t.after(() => backend.stop())
  await runPresetsScenario(backend)
  expectReference('presets', backend.steps)
})
