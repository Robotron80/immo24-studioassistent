/**
 * Prüft die Grundregel der Architektur automatisch:
 * Die Fachlogik in src/core darf nichts von Electron, Node-RED oder einem Webserver
 * wissen. Nur so bleibt sie ohne Fenster testbar und später auch für andere
 * immo24-Programme nutzbar. Schleicht sich so ein Import ein, schlägt dieser Test fehl.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const CORE_DIR = path.resolve(import.meta.dirname, '../../src/core')
const FORBIDDEN = ['electron', 'node-red', 'express', 'node:http', 'node:https']

test('src/core importiert weder Electron noch Node-RED oder einen Webserver', () => {
  const files = fs.readdirSync(CORE_DIR, { recursive: true, encoding: 'utf8' }).filter((file) => file.endsWith('.ts'))
  assert.ok(files.length > 0)

  for (const file of files) {
    const source = fs.readFileSync(path.join(CORE_DIR, file), 'utf8')
    for (const name of FORBIDDEN) {
      assert.ok(!source.includes(`from '${name}'`), `${file} darf ${name} nicht importieren`)
      assert.ok(!source.includes(`require('${name}')`), `${file} darf ${name} nicht laden`)
    }
  }
})
