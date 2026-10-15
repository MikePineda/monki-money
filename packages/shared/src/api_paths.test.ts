import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isApiPath } from './api_paths.ts'

test('isApiPath treats the bare prefix and anything below it as API', () => {
  assert.equal(isApiPath('/api'), true)
  assert.equal(isApiPath('/api/health'), true)
  assert.equal(isApiPath('/api/v1/config'), true)
})

test('isApiPath leaves SPA routes and look-alike prefixes to the client', () => {
  assert.equal(isApiPath('/'), false)
  assert.equal(isApiPath('/month'), false)
  assert.equal(isApiPath('/apiary'), false)
  assert.equal(isApiPath('/transactions/api'), false)
})
