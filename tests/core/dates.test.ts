/**
 * Prüft, dass das Datum der Ortszeit folgt und nicht UTC.
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import { localDate } from '../../src/core/dates.ts'

test('kurz nach Mitternacht gilt in Deutschland schon der neue Tag', (t) => {
  const before = process.env.TZ
  t.after(() => {
    process.env.TZ = before
  })
  process.env.TZ = 'Europe/Berlin'

  // In UTC ist es hier noch der 2. November
  assert.equal(localDate(new Date('2026-11-02T23:30:00Z')), '2026-11-03')
  assert.equal(localDate(new Date('2026-07-02T22:30:00Z')), '2026-07-03')
})
