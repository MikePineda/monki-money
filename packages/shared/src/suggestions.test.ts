import { test } from 'node:test'
import assert from 'node:assert/strict'
import { RECENCY_HALF_LIFE_DAYS, payeeKey, recencyWeight, roundScore } from './suggestions.ts'

test('a use made today weighs one and halves every thirty days', () => {
  assert.equal(RECENCY_HALF_LIFE_DAYS, 30)
  assert.equal(recencyWeight('2026-10-15', '2026-10-15'), 1)
  assert.ok(Math.abs(recencyWeight('2026-09-15', '2026-10-15') - 0.5) < 1e-9)
  assert.ok(Math.abs(recencyWeight('2026-08-16', '2026-10-15') - 0.25) < 1e-9)
})

test('a use dated in the future counts as today', () => {
  assert.equal(recencyWeight('2026-10-20', '2026-10-15'), 1)
})

test('two spellings of a payee share one key', () => {
  assert.equal(payeeKey('  Café   Nero '), 'cafe nero')
  assert.equal(payeeKey('CAFÉ NERO'), payeeKey('cafe nero'))
})

test('scores travel with four decimals', () => {
  assert.equal(roundScore(1.234_567), 1.2346)
  assert.equal(roundScore(2), 2)
})
