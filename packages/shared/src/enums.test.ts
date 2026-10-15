import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ENTRY_KINDS, LOCALES, POSTGRES_ENUMS, TRANSACTION_KINDS, isLocale } from './enums.ts'

test('every Postgres enum has unique snake_case literals', () => {
  for (const [name, values] of Object.entries(POSTGRES_ENUMS)) {
    assert.match(name, /^[a-z_]+$/)
    assert.equal(new Set(values).size, values.length, name)
    for (const value of values) assert.match(value, /^[a-z_]+$/, `${name}.${value}`)
  }
})

test('english is the first (default) locale and spanish is available', () => {
  assert.equal(LOCALES[0], 'en')
  assert.ok(LOCALES.includes('es'))
})

test('isLocale accepts only supported locales', () => {
  assert.equal(isLocale('en'), true)
  assert.equal(isLocale('es'), true)
  assert.equal(isLocale('fr'), false)
  assert.equal(isLocale(undefined), false)
})

test('entry kinds are the transaction kinds a person types, never transfer', () => {
  assert.deepEqual([...ENTRY_KINDS], ['expense', 'income'])
  for (const kind of ENTRY_KINDS) assert.ok(TRANSACTION_KINDS.includes(kind))
  assert.ok(!(ENTRY_KINDS as readonly string[]).includes('transfer'))
})

test('the ledger enums are backed by native Postgres types', () => {
  assert.deepEqual([...POSTGRES_ENUMS.transaction_kind], ['expense', 'income', 'transfer'])
  assert.deepEqual([...POSTGRES_ENUMS.transaction_status], ['pending', 'cleared'])
  assert.deepEqual(
    [...POSTGRES_ENUMS.transaction_source],
    ['manual', 'import', 'receipt', 'telegram']
  )
})
