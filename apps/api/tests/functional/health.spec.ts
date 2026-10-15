import { test } from '@japa/runner'

test.group('Health probes', () => {
  test('readiness reports ok with version, sha and the database check', async ({
    client,
    assert,
  }) => {
    const response = await client.get('/api/health')

    response.assertStatus(200)
    response.assertBodyContains({ status: 'ok' })
    const body = response.body()
    assert.isString(body.version)
    assert.isString(body.sha)
    assert.properties(body.checks, ['database', 'memory_heap'])
    assert.equal(body.checks.database.status, 'ok')
  })

  test('readiness never leaks process debug information', async ({ client, assert }) => {
    const response = await client.get('/api/health')

    response.assertStatus(200)
    assert.notProperty(response.body(), 'debugInfo')
    assert.deepEqual(response.body().checks.database, { status: 'ok' })
  })

  test('liveness answers without touching dependencies', async ({ client }) => {
    const response = await client.get('/api/health/live')

    response.assertStatus(200)
    response.assertBody({ status: 'ok' })
  })
})
