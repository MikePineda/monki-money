import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ENTRY_KINDS,
  GOAL_STATUSES,
  IMPORT_DECISIONS,
  IMPORT_RESOLUTIONS,
  LOCALES,
  POSTGRES_ENUMS,
  TRANSACTION_KINDS,
  isLocale,
} from './enums.ts'

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

test('goal statuses start active and are backed by a native Postgres type', () => {
  assert.equal(GOAL_STATUSES[0], 'active')
  assert.deepEqual([...POSTGRES_ENUMS.goal_status], ['active', 'reached', 'archived'])
})

test('the import enums are backed by native Postgres types', () => {
  assert.deepEqual([...POSTGRES_ENUMS.import_source], ['nab_csv'])
  assert.deepEqual([...POSTGRES_ENUMS.import_batch_status], ['staged', 'completed', 'cancelled'])
  assert.deepEqual(
    [...POSTGRES_ENUMS.import_resolution],
    [
      'new',
      'auto_matched',
      'needs_confirmation',
      'duplicate',
      'transfer_leg',
      'ignored',
      'superseded',
    ]
  )
  assert.deepEqual([...POSTGRES_ENUMS.suggestion_source], ['rule', 'nab_map', 'llm', 'none'])
  assert.deepEqual([...POSTGRES_ENUMS.rule_match_type], ['merchant', 'contains', 'regex'])
  assert.deepEqual([...POSTGRES_ENUMS.rule_origin], ['user', 'learned', 'system'])
})

test('a row decision is one of the final resolutions a person may pick', () => {
  assert.deepEqual([...IMPORT_DECISIONS], ['new', 'auto_matched', 'transfer_leg', 'ignored'])
  for (const decision of IMPORT_DECISIONS) assert.ok(IMPORT_RESOLUTIONS.includes(decision))
})
