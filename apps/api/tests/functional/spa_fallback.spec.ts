import { test } from '@japa/runner'
import app from '@adonisjs/core/services/app'
import { existsSync } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'

test.group('SPA fallback', (group) => {
  const indexPath = app.publicPath('index.html')

  // The real index.html only exists once the Angular build is copied into
  // public/ (Docker image, E2E). Provide a stand-in when it is missing.
  group.setup(async () => {
    const createdHere = !existsSync(indexPath)
    if (createdHere) {
      await mkdir(app.publicPath(), { recursive: true })
      await writeFile(indexPath, '<!doctype html><title>spa</title><app-root></app-root>')
    }
    return async () => {
      if (createdHere) await rm(indexPath)
    }
  })

  test('client-side routes get the SPA shell without caching', async ({ client, assert }) => {
    const response = await client.get('/month/2026-10')

    response.assertStatus(200)
    assert.include(response.header('content-type'), 'text/html')
    assert.include(response.text(), '<app-root')
    response.assertHeader('cache-control', 'no-cache')
  })

  test('unknown API routes answer 404 JSON, never the SPA shell', async ({ client, assert }) => {
    const response = await client.get('/api/v1/does-not-exist')

    response.assertStatus(404)
    assert.include(response.header('content-type'), 'application/json')
    assert.notInclude(response.text(), '<app-root')
  })

  test('the bare API prefix is not a SPA route either', async ({ client }) => {
    const response = await client.get('/api')

    response.assertStatus(404)
  })
})
