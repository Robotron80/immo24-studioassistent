/**
 * Spielt das Projekt-Szenario auf dem echten Node-RED ab und vergleicht es mit der
 * Referenz. Der Gegenpart für das neue Backend: tests/core/projects.test.ts
 */
const test = require('node:test')
const { expectReference, startBackend } = require('./harness.cjs')
const { runProjectsScenario, seed } = require('./scenarios/projects.cjs')

test('Anmeldung, Produktionsbuch und Projektanlage', { timeout: 120000 }, async (t) => {
  const backend = await startBackend({ seed })
  t.after(() => backend.stop())
  await runProjectsScenario(backend)
  expectReference('projects', backend.steps)
})
