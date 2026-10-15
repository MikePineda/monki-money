import { test } from '@japa/runner'
import { freezeClock } from '#tests/helpers/ledger'
import { createHousehold } from '#tests/helpers/household'
import {
  fakeObjectStorage,
  restoreObjectStorage,
  type FakeObjectStorage,
} from '#tests/helpers/storage'

const TEN_MEGABYTES = 10 * 1024 * 1024

test.group('Uploads: presign', (group) => {
  let storage: FakeObjectStorage

  group.each.setup(() => {
    storage = fakeObjectStorage()
    return () => restoreObjectStorage()
  })

  test('test_presign_returns_household_scoped_key_and_put_url', async ({
    client,
    assert,
    cleanup,
  }) => {
    cleanup(freezeClock('2026-10-16T09:00:00+10:00'))
    const { household, owner } = await createHousehold()

    const response = await client
      .post('/api/v1/uploads/presign')
      .json({ kind: 'receipt', contentType: 'image/webp', byteSize: 123_456 })
      .actingAs(owner)

    response.assertStatus(201)
    const { key, url, headers, expiresAt } = response.body().data
    assert.match(
      key,
      new RegExp(
        `^receipts/${household.id}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.webp$`
      )
    )
    assert.deepEqual(storage.presigned, [
      { key, contentType: 'image/webp', byteSize: 123_456, expiresInSeconds: 300 },
    ])
    assert.equal(
      url,
      `https://storage.test/fake-bucket/${key}?X-Amz-Expires=300&X-Amz-Signature=fake`
    )
    assert.deepEqual(headers, { 'Content-Type': 'image/webp' })
    assert.equal(expiresAt, '2026-10-15T23:05:00.000Z')

    // The server picks a fresh key every time; the client never chooses one.
    const again = await client
      .post('/api/v1/uploads/presign')
      .json({ kind: 'receipt', contentType: 'image/jpeg', byteSize: 1, key: 'receipts/1/x.jpg' })
      .actingAs(owner)
    again.assertStatus(201)
    assert.notEqual(again.body().data.key, key)
    assert.match(again.body().data.key, new RegExp(`^receipts/${household.id}/.+\\.jpg$`))
  })

  test('test_presign_rejects_unsupported_content_type', async ({ client, assert }) => {
    const { owner } = await createHousehold()

    for (const body of [
      { kind: 'receipt', contentType: 'image/gif', byteSize: 100 },
      { kind: 'receipt', contentType: 'application/pdf', byteSize: 100 },
      { kind: 'receipt', byteSize: 100 },
    ]) {
      const response = await client.post('/api/v1/uploads/presign').json(body).actingAs(owner)

      response.assertStatus(422)
      response.assertBodyContains({ errors: [{ field: 'contentType' }] })
    }

    const unknownKind = await client
      .post('/api/v1/uploads/presign')
      .json({ kind: 'avatar', contentType: 'image/png', byteSize: 100 })
      .actingAs(owner)
    unknownKind.assertStatus(422)
    unknownKind.assertBodyContains({ errors: [{ field: 'kind' }] })
    assert.lengthOf(storage.presigned, 0)
  })

  test('test_presign_rejects_files_over_ten_megabytes', async ({ client, assert }) => {
    const { owner } = await createHousehold({ locale: 'es' })

    const tooLarge = await client
      .post('/api/v1/uploads/presign')
      .json({ kind: 'receipt', contentType: 'image/jpeg', byteSize: TEN_MEGABYTES + 1 })
      .actingAs(owner)
    const empty = await client
      .post('/api/v1/uploads/presign')
      .json({ kind: 'receipt', contentType: 'image/jpeg', byteSize: 0 })
      .actingAs(owner)
    const limit = await client
      .post('/api/v1/uploads/presign')
      .json({ kind: 'receipt', contentType: 'image/jpeg', byteSize: TEN_MEGABYTES })
      .actingAs(owner)

    tooLarge.assertStatus(422)
    tooLarge.assertBodyContains({
      errors: [{ field: 'byteSize', rule: 'max', message: 'La foto debe pesar 10 MB o menos' }],
    })
    empty.assertStatus(422)
    empty.assertBodyContains({ errors: [{ field: 'byteSize' }] })
    limit.assertStatus(201)
    assert.lengthOf(storage.presigned, 1)
  })

  test('test_presign_answers_503_when_storage_is_disabled', async ({ client }) => {
    // Tests run with DRIVE_DISK=fs: the configured storage is the disabled one.
    restoreObjectStorage()
    const { owner } = await createHousehold()

    const response = await client
      .post('/api/v1/uploads/presign')
      .json({ kind: 'receipt', contentType: 'image/jpeg', byteSize: 100 })
      .actingAs(owner)

    response.assertStatus(503)
    response.assertBody({
      message: 'Photo uploads are unavailable right now. Try again later',
      code: 'E_STORAGE_UNAVAILABLE',
    })
  })

  test('test_presign_needs_a_session_and_is_throttled_per_user', async ({ client, assert }) => {
    const { owner, member } = await createHousehold({ users: 2 })
    const body = { kind: 'receipt', contentType: 'image/jpeg', byteSize: 100 }

    const guest = await client.post('/api/v1/uploads/presign').json(body).withCsrfToken()
    guest.assertStatus(401)

    for (let attempt = 1; attempt <= 30; attempt++) {
      const response = await client.post('/api/v1/uploads/presign').json(body).actingAs(owner)
      response.assertStatus(201)
    }
    const throttled = await client.post('/api/v1/uploads/presign').json(body).actingAs(owner)
    throttled.assertStatus(429)
    assert.exists(throttled.header('retry-after'))

    const partner = await client.post('/api/v1/uploads/presign').json(body).actingAs(member)
    partner.assertStatus(201)
  })
})
