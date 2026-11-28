/**
 * App-Test: Die Content-Security-Policy blockiert nichts, was die Oberfläche braucht,
 * aber eingeschleuste Skripte.
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import { createEnv, launch, loginAsTester, sleep } from './lib.mjs'

test('Content-Security-Policy', async (t) => {
  const env = createEnv(t)
  const app = await launch(t, env)
  const main = await loginAsTester(app)

  // Verstöße ab dem nächsten Laden mitschreiben, dann jede Seite einmal öffnen
  await main.send('Page.enable')
  await main.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `window.__csp = []; document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI))`,
  })
  await main.ev(`location.reload(); 1`)
  await main.waitForText('Neues Projekt')
  const policy = await main.ev(`document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content ?? ''`)
  assert.match(policy, /script-src 'self'/)

  for (const page of ['protools', 'soundminer', 'konfiguration', 'projektanlage']) {
    await main.ev(`location.hash = '#/${page}'; 1`)
    await sleep(800)
  }
  await main.ev(`document.querySelector('[aria-label="Kalender öffnen"]')?.click(); 1`)
  await sleep(500)
  assert.deepEqual(await main.ev('window.__csp'), [])

  // Gegenprobe: Ein eingeschleustes Inline-Skript läuft nicht
  await main.ev(
    `const s = document.createElement('script'); s.textContent = 'window.__boese = 1'; document.body.append(s); 1`,
  )
  await sleep(300)
  assert.equal(await main.ev('window.__boese'), undefined)
  assert.equal(await main.ev('window.__csp.length'), 1)
})
