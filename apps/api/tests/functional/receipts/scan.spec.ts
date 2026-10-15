import sharp from 'sharp'
import { DateTime } from 'luxon'
import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import Category from '#models/category'
import LlmUsage from '#models/llm_usage'
import app from '@adonisjs/core/services/app'
import { LlmProvider } from '#llm/llm_provider'
import { LlmProviderError } from '#llm/errors'
import { receiptPhoto } from '#tests/helpers/llm'
import { categoryBySlug } from '#tests/helpers/ledger'
import { createHousehold } from '#tests/helpers/household'
import ReceiptScanner from '#services/receipts/receipt_scanner'
import { FakeLlmProvider } from '#llm/providers/fake_llm_provider'
import { receiptKey, type ReceiptUploadType } from '#domain/receipts/receipt_key'
import {
  fakeObjectStorage,
  restoreObjectStorage,
  type FakeObjectStorage,
} from '#tests/helpers/storage'

/** tests/fixtures/llm/receipt.json, as the API answers it. */
const FIXTURE_RECEIPT = {
  merchant: 'Corner Grocer',
  date: '2026-09-14',
  totalCents: 2345,
  currencyCode: 'AUD',
  categorySlug: 'groceries',
  items: [
    { description: 'Bananas 1kg', amountCents: 390, quantity: 1 },
    { description: 'Coffee beans 500g', amountCents: 1655, quantity: 1 },
    { description: 'Sourdough loaf', amountCents: 300, quantity: null },
  ],
  confidence: 0.9,
}

async function fakeLlm() {
  const llm = await app.container.make(LlmProvider)
  if (!(llm instanceof FakeLlmProvider)) throw new Error('Tests run with LLM_PROVIDER=fake')
  return llm
}

/** Plays the browser: a photo PUT under the household's receipts prefix. */
async function uploadPhoto(
  storage: FakeObjectStorage,
  householdId: number,
  options: { width?: number; height?: number; contentType?: ReceiptUploadType } = {}
) {
  const contentType = options.contentType ?? 'image/png'
  const key = receiptKey(householdId, randomUUID(), contentType)
  const photo = await receiptPhoto(options.width, options.height)
  storage.put(key, Buffer.from(photo.base64, 'base64'), contentType)
  return key
}

async function usageCount(householdId: number) {
  const [row] = await LlmUsage.query().where('household_id', householdId).count('* as total')
  return Number(row.$extras.total)
}

test.group('Receipts: scan', (group) => {
  let storage: FakeObjectStorage

  group.each.setup(() => {
    storage = fakeObjectStorage()
    return () => restoreObjectStorage()
  })

  test('test_scan_reads_object_reduces_it_and_calls_fake_llm', async ({ client, assert }) => {
    const { household, owner } = await createHousehold({ taxonomy: true })
    const key = await uploadPhoto(storage, household.id, { width: 3200, height: 2400 })
    const llm = await fakeLlm()
    const requestsBefore = llm.requests.length

    const response = await client.post('/api/v1/receipts/scan').json({ key }).actingAs(owner)

    response.assertStatus(200)
    const groceries = await categoryBySlug(household.id, 'groceries')
    assert.deepEqual(response.body().data, { ...FIXTURE_RECEIPT, categoryId: groceries.id, key })

    assert.lengthOf(llm.requests, requestsBefore + 1)
    const request = llm.requests.at(-1)!
    assert.equal(request.purpose, 'receipt')
    const [image, text] = request.messages[0].content
    if (image.type !== 'image' || text.type !== 'text') throw new Error('image, then text')
    assert.equal(image.mediaType, 'image/jpeg')
    const sent = await sharp(Buffer.from(image.base64, 'base64')).metadata()
    assert.equal(Math.max(sent.width!, sent.height!), 1600)
    assert.include(text.text, '"groceries"')
    assert.include(text.text, '"AUD"')

    assert.isFalse(storage.has(key), 'nothing is kept after the scan')
  })

  test('test_scan_rejects_key_outside_household_with_404', async ({ client, assert }) => {
    const mine = await createHousehold({ taxonomy: true })
    const other = await createHousehold({ taxonomy: true })
    const theirs = await uploadPhoto(storage, other.household.id)
    const llm = await fakeLlm()
    const requestsBefore = llm.requests.length

    for (const key of [
      theirs,
      theirs.replace(`receipts/${other.household.id}/`, `receipts/${mine.household.id}/../`),
      `imports/${mine.household.id}/1.csv`,
      `receipts/${mine.household.id}/not-a-uuid.jpg`,
    ]) {
      const response = await client.post('/api/v1/receipts/scan').json({ key }).actingAs(mine.owner)

      response.assertStatus(404)
      response.assertBody({ message: 'Not found', code: 'E_ROW_NOT_FOUND' })
    }

    assert.isTrue(storage.has(theirs), "another household's photo is never touched")
    assert.deepEqual(storage.deleted, [])
    assert.lengthOf(llm.requests, requestsBefore)
  })

  test('test_scan_answers_404_when_object_is_missing', async ({ client, assert }) => {
    const { household, owner } = await createHousehold()
    const key = receiptKey(household.id, randomUUID(), 'image/jpeg')

    const missing = await client.post('/api/v1/receipts/scan').json({ key }).actingAs(owner)
    const noKey = await client.post('/api/v1/receipts/scan').json({}).actingAs(owner)

    missing.assertStatus(404)
    missing.assertBodyContains({ code: 'E_ROW_NOT_FOUND' })
    noKey.assertStatus(422)
    noKey.assertBodyContains({ errors: [{ field: 'key', rule: 'required' }] })
    assert.equal(await usageCount(household.id), 0)
  })

  test('test_scan_rejects_objects_that_are_not_a_readable_photo', async ({ client, assert }) => {
    const { household, owner } = await createHousehold()
    const gif = receiptKey(household.id, randomUUID(), 'image/jpeg')
    storage.put(gif, Buffer.from('GIF89a'), 'image/gif')
    const huge = receiptKey(household.id, randomUUID(), 'image/jpeg')
    storage.put(huge, Buffer.alloc(10 * 1024 * 1024 + 1), 'image/jpeg')
    const garbage = receiptKey(household.id, randomUUID(), 'image/jpeg')
    storage.put(garbage, Buffer.from('not really a photo'), 'image/jpeg')

    const cases: Array<[string, string]> = [
      [gif, 'mimetype'],
      [huge, 'fileSize'],
      [garbage, 'image'],
    ]
    for (const [key, rule] of cases) {
      const response = await client.post('/api/v1/receipts/scan').json({ key }).actingAs(owner)

      response.assertStatus(422)
      response.assertBodyContains({ errors: [{ field: 'key', rule }] })
      assert.isFalse(storage.has(key), `${rule}: the rejected object is deleted`)
    }
    assert.equal(await usageCount(household.id), 0)
  })

  test('test_scan_deletes_object_after_extraction_even_when_llm_fails', async ({
    client,
    assert,
  }) => {
    const { household, owner } = await createHousehold({ taxonomy: true })
    const key = await uploadPhoto(storage, household.id)
    const llm = await fakeLlm()
    llm.script(new LlmProviderError('vendor down', 529))

    const response = await client.post('/api/v1/receipts/scan').json({ key }).actingAs(owner)

    response.assertStatus(503)
    response.assertBody({
      message: 'AI suggestions are unavailable right now. Try again later',
      code: 'E_LLM_UNAVAILABLE',
    })
    assert.deepEqual(storage.deleted, [key])
    assert.isFalse(storage.has(key))
  })

  test('test_scan_still_answers_when_the_delete_fails', async ({ client, assert }) => {
    const { household, owner } = await createHousehold({ taxonomy: true })
    const key = await uploadPhoto(storage, household.id)
    storage.failDeletes = true

    const response = await client.post('/api/v1/receipts/scan').json({ key }).actingAs(owner)

    response.assertStatus(200)
    response.assertBodyContains({ data: { merchant: 'Corner Grocer', key } })
    assert.deepEqual(storage.deleted, [key], 'the delete was attempted')
  })

  test('test_scan_maps_category_slug_to_household_category_id', async ({ client, assert }) => {
    const withTaxonomy = await createHousehold({ taxonomy: true })
    const hidden = await createHousehold({ taxonomy: true })
    await Category.query()
      .where('household_id', hidden.household.id)
      .where('slug', 'groceries')
      .update({ is_hidden: true })
    const bare = await createHousehold()

    const groceries = await categoryBySlug(withTaxonomy.household.id, 'groceries')
    const otherGroceries = await categoryBySlug(hidden.household.id, 'groceries')
    const scan = async (home: typeof bare) => {
      const key = await uploadPhoto(storage, home.household.id)
      const response = await client.post('/api/v1/receipts/scan').json({ key }).actingAs(home.owner)
      response.assertStatus(200)
      return response.body().data
    }

    const mapped = await scan(withTaxonomy)
    assert.equal(mapped.categoryId, groceries.id)
    assert.equal(mapped.categorySlug, 'groceries')
    assert.notEqual(mapped.categoryId, otherGroceries.id)

    for (const home of [hidden, bare]) {
      const unmapped = await scan(home)
      assert.isNull(unmapped.categoryId, 'a hidden or missing category is never suggested')
      assert.isNull(unmapped.categorySlug)
      assert.equal(unmapped.totalCents, 2345)
    }
  })

  test('test_scan_is_blocked_when_llm_quota_exceeded', async ({ client, assert }) => {
    const { household, owner } = await createHousehold({ taxonomy: true })
    await LlmUsage.createMany(
      Array.from({ length: 200 }, () => ({
        householdId: household.id,
        purpose: 'receipt' as const,
        provider: 'fake',
        model: 'fake',
        status: 'ok' as const,
        createdAt: DateTime.now(),
      }))
    )
    const key = await uploadPhoto(storage, household.id)
    const llm = await fakeLlm()
    const requestsBefore = llm.requests.length

    const response = await client.post('/api/v1/receipts/scan').json({ key }).actingAs(owner)

    response.assertStatus(402)
    response.assertBodyContains({ code: 'E_LLM_QUOTA_EXCEEDED' })
    assert.lengthOf(llm.requests, requestsBefore, 'no model call once over quota')
    assert.equal(await usageCount(household.id), 200)
    assert.isFalse(storage.has(key))
  })

  test('test_scan_returns_422_on_invalid_llm_output', async ({ client, assert }) => {
    const { household, owner } = await createHousehold({ taxonomy: true })
    const key = await uploadPhoto(storage, household.id)
    const llm = await fakeLlm()
    llm.script('I cannot read this receipt.', '{"merchant": 3}')

    const response = await client.post('/api/v1/receipts/scan').json({ key }).actingAs(owner)

    response.assertStatus(422)
    response.assertBody({
      message: 'The AI could not read this. Try again or fill it in by hand',
      code: 'E_LLM_OUTPUT_INVALID',
    })
    const statuses = await LlmUsage.query().where('household_id', household.id).orderBy('id')
    assert.deepEqual(
      statuses.map((row) => row.status),
      ['invalid_output', 'invalid_output']
    )
    assert.isFalse(storage.has(key))
  })

  test('test_scan_records_llm_usage', async ({ client, assert }) => {
    const { household, owner, member } = await createHousehold({ taxonomy: true, users: 2 })
    const key = await uploadPhoto(storage, household.id)

    const response = await client.post('/api/v1/receipts/scan').json({ key }).actingAs(member)

    response.assertStatus(200)
    const rows = await LlmUsage.query().where('household_id', household.id)
    assert.lengthOf(rows, 1)
    assert.include(rows[0].serialize(), {
      userId: member.id,
      purpose: 'receipt',
      provider: 'fake',
      status: 'ok',
    })
    assert.notEqual(rows[0].userId, owner.id)
  })

  test('test_scan_answers_503_when_the_llm_is_not_live', async ({ client, assert, cleanup }) => {
    // Outside tests the fake provider never answers a person with fixtures.
    class LiveOnlyScanner extends ReceiptScanner {
      protected override fakeLlmAllowed() {
        return false
      }
    }
    app.container.swap(ReceiptScanner, (resolver) => resolver.make(LiveOnlyScanner))
    cleanup(() => app.container.restore(ReceiptScanner))
    const { household, owner } = await createHousehold({ taxonomy: true })
    const key = await uploadPhoto(storage, household.id)

    const response = await client.post('/api/v1/receipts/scan').json({ key }).actingAs(owner)

    response.assertStatus(503)
    response.assertBodyContains({ code: 'E_LLM_UNAVAILABLE' })
    assert.equal(await usageCount(household.id), 0)
    assert.isFalse(storage.has(key))
  })

  test('test_scan_answers_503_when_storage_is_disabled', async ({ client }) => {
    restoreObjectStorage()
    const { household, owner } = await createHousehold()
    const key = receiptKey(household.id, randomUUID(), 'image/jpeg')

    const response = await client.post('/api/v1/receipts/scan').json({ key }).actingAs(owner)

    response.assertStatus(503)
    response.assertBodyContains({ code: 'E_STORAGE_UNAVAILABLE' })
  })

  test('test_scan_is_throttled_per_user', async ({ client }) => {
    const { household, owner } = await createHousehold()
    const key = receiptKey(household.id, randomUUID(), 'image/jpeg')

    for (let attempt = 1; attempt <= 10; attempt++) {
      const response = await client.post('/api/v1/receipts/scan').json({ key }).actingAs(owner)
      response.assertStatus(404)
    }
    const throttled = await client.post('/api/v1/receipts/scan').json({ key }).actingAs(owner)
    throttled.assertStatus(429)
  })
})
