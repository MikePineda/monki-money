import { test } from 'node:test'
import assert from 'node:assert/strict'
import { POSTGRES_ENUMS, LOCALES, isLocale } from './enums.ts'

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
