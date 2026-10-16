import { DateTime } from 'luxon'
import { test } from '@japa/runner'
import LlmUsage from '#models/llm_usage'
import ImportRow from '#models/import_row'
import ImportBatch from '#models/import_batch'
import drive from '@adonisjs/drive/services/main'
import { nabCsv } from '#tests/helpers/importing'
import { categoryBySlug, freezeClock } from '#tests/helpers/ledger'
import { countOf, nabHousehold, nabLine, rowsStartingWith, uploadCsv } from '#tests/helpers/imports'

const TODAY = '2026-10-15T09:00:00+10:00'

/** Two card purchases NAB could not categorize: one the fake model knows, one it does not. */
const csv = nabCsv([
  nabLine({
    date: '02 Oct 26',
    amount: '-45.10',
    details: 'V1111 01/10 COLES 1234 SAMPLEVILLE 70000000910',
    balance: '954.90',
    category: 'Uncategorised',
  }),
  nabLine({
    date: '01 Oct 26',
    amount: '-30.00',
    details: 'V2222 30/09 MYSTERY SHOP SAMPLEVILLE 70000000911',
    balance: '1000.00',
    category: 'Uncategorised',
  }),
])

test.group('Imports: classify', (group) => {
  group.each.setup(() => {
    drive.fake()
    const restoreClock = freezeClock(TODAY)
    return () => {
      drive.restore()
      restoreClock()
    }
  })

  test('test_classify_uses_fake_llm_and_records_usage', async ({ client, assert }) => {
    const home = await nabHousehold()
    const groceries = await categoryBySlug(home.household.id, 'groceries')
    const misc = await categoryBySlug(home.household.id, 'misc')
    const upload = await uploadCsv(client, home.owner, csv)
    const batch = upload.body().data[0]

    const classify = await client.post(`/api/v1/imports/${batch.id}/classify`).actingAs(home.owner)

    classify.assertStatus(202)
    const detail = await client.get(`/api/v1/imports/${batch.id}`).actingAs(home.owner)
    const [coles] = rowsStartingWith(detail.body().data.rows, 'V1111 01/10 COLES')
    assert.deepInclude(coles.suggestion, {
      source: 'llm',
      categoryId: groceries.id,
      confidence: 0.92,
      needsReview: false,
      payee: 'Coles',
    })
    assert.isFalse(coles.needsReview)
    const [mystery] = rowsStartingWith(detail.body().data.rows, 'V2222 30/09')
    assert.include(mystery.suggestion, {
      source: 'nab_map',
      categoryId: misc.id,
      needsReview: true,
    })

    const usage = await LlmUsage.query().where('household_id', home.household.id)
    assert.lengthOf(usage, 1)
    assert.include(usage[0].serialize(), {
      userId: home.owner.id,
      purpose: 'classify',
      provider: 'fake',
      status: 'ok',
    })
  })

  test('test_classify_is_blocked_when_llm_quota_exceeded', async ({ client, assert }) => {
    const home = await nabHousehold()
    await LlmUsage.createMany(
      Array.from({ length: 200 }, () => ({
        householdId: home.household.id,
        purpose: 'classify' as const,
        provider: 'fake',
        model: 'fake',
        status: 'ok' as const,
        createdAt: DateTime.now(),
      }))
    )
    const upload = await uploadCsv(client, home.owner, csv)
    const batch = upload.body().data[0]

    const classify = await client.post(`/api/v1/imports/${batch.id}/classify`).actingAs(home.owner)

    classify.assertStatus(402)
    classify.assertBodyContains({ code: 'E_LLM_QUOTA_EXCEEDED' })
    const rows = await ImportRow.query().where('import_batch_id', batch.id)
    assert.isTrue(rows.every((row) => row.suggestionSource === 'nab_map'))
    assert.equal(
      await countOf(LlmUsage.query().where('household_id', home.household.id)),
      200,
      'a blocked classify records nothing'
    )
  })

  test('test_classify_degrades_silently_when_the_model_fails', async ({ client, assert }) => {
    const home = await nabHousehold()
    const upload = await uploadCsv(client, home.owner, csv)
    const batch = upload.body().data[0]
    const { LlmProvider } = await import('#llm/llm_provider')
    const { LlmProviderError } = await import('#llm/errors')
    const { default: app } = await import('@adonisjs/core/services/app')
    const llm = (await app.container.make(LlmProvider)) as any
    llm.script(new LlmProviderError('vendor down', 503))

    const classify = await client.post(`/api/v1/imports/${batch.id}/classify`).actingAs(home.owner)

    classify.assertStatus(202)
    const rows = await ImportRow.query().where('import_batch_id', batch.id)
    assert.isTrue(rows.every((row) => row.suggestionSource === 'nab_map'))
  })

  test('test_classify_keeps_the_chunks_answered_before_a_failure', async ({ client, assert }) => {
    const home = await nabHousehold()
    // 50 uncategorized purchases: one model call per 40 rows.
    const lines = Array.from({ length: 50 }, (_, index) =>
      nabLine({
        date: '02 Oct 26',
        amount: `-${index + 1}.00`,
        details: `V1111 01/10 COLES ${1000 + index} SAMPLEVILLE ${70000001000 + index}`,
        balance: `${5000 - index}.00`,
        category: 'Uncategorised',
      })
    )
    const upload = await uploadCsv(client, home.owner, nabCsv(lines))
    const batch = upload.body().data[0]
    const firstAnswer = JSON.stringify({
      results: Array.from({ length: 40 }, (_, index) => ({
        id: String(index),
        categorySlug: 'groceries',
        confidence: 0.92,
        payee: 'Coles',
      })),
    })
    const { LlmProvider } = await import('#llm/llm_provider')
    const { LlmProviderError } = await import('#llm/errors')
    const { default: app } = await import('@adonisjs/core/services/app')
    const llm = (await app.container.make(LlmProvider)) as any
    llm.script(firstAnswer, new LlmProviderError('vendor down', 503))

    const classify = await client.post(`/api/v1/imports/${batch.id}/classify`).actingAs(home.owner)

    classify.assertStatus(202)
    const rows = await ImportRow.query().where('import_batch_id', batch.id)
    assert.equal(rows.filter((row) => row.suggestionSource === 'llm').length, 40)
    assert.equal(rows.filter((row) => row.suggestionSource === 'nab_map').length, 10)
  })

  test('test_classify_with_the_sync_queue_answers_the_run_already_finished', async ({
    client,
    assert,
  }) => {
    const home = await nabHousehold()
    const upload = await uploadCsv(client, home.owner, csv)
    const batch = upload.body().data[0]
    assert.include(batch, { classifying: false, classifiedAt: null })

    const classify = await client.post(`/api/v1/imports/${batch.id}/classify`).actingAs(home.owner)

    // QUEUE_DRIVER=sync: the run ended inside the request.
    classify.assertStatus(202)
    assert.isFalse(classify.body().data.classifying)
    assert.isString(classify.body().data.classifiedAt)
    const stored = await ImportBatch.findOrFail(batch.id)
    assert.isNull(stored.classifyStartedAt)
    assert.isNotNull(stored.classifyFinishedAt)
    const summary = await client.get(`/api/v1/imports/${batch.id}?rows=0`).actingAs(home.owner)
    assert.include(summary.body().data, { classifying: false })
  })

  test('test_batch_says_classifying_while_a_live_run_holds_its_claim', async ({
    client,
    assert,
  }) => {
    const home = await nabHousehold()
    const upload = await uploadCsv(client, home.owner, csv)
    const batchId = upload.body().data[0].id
    const running = await ImportBatch.findOrFail(batchId)
    running.classifyStartedAt = DateTime.now().minus({ minutes: 1 })
    await running.save()

    const during = await client.get(`/api/v1/imports/${batchId}?rows=0`).actingAs(home.member)

    assert.include(during.body().data, { classifying: true, classifiedAt: null })
    const listed = await client.get('/api/v1/imports?status=staged').actingAs(home.member)
    assert.isTrue(listed.body().data[0].classifying)

    // A claim older than 10 minutes belongs to a run that died.
    running.classifyStartedAt = DateTime.now().minus({ minutes: 30 })
    await running.save()
    const stale = await client.get(`/api/v1/imports/${batchId}?rows=0`).actingAs(home.member)
    assert.isFalse(stale.body().data.classifying)
  })

  test('test_a_classify_run_the_model_fails_still_ends_the_run', async ({ client, assert }) => {
    const home = await nabHousehold()
    const upload = await uploadCsv(client, home.owner, csv)
    const batch = upload.body().data[0]
    const { LlmProvider } = await import('#llm/llm_provider')
    const { LlmProviderError } = await import('#llm/errors')
    const { default: app } = await import('@adonisjs/core/services/app')
    const llm = (await app.container.make(LlmProvider)) as any
    llm.script(new LlmProviderError('vendor down', 503))

    const classify = await client.post(`/api/v1/imports/${batch.id}/classify`).actingAs(home.owner)

    classify.assertStatus(202)
    assert.isFalse(classify.body().data.classifying)
    assert.isString(classify.body().data.classifiedAt)
  })

  test('test_concurrent_classify_of_a_batch_is_a_conflict', async ({ client, assert }) => {
    const home = await nabHousehold()
    const upload = await uploadCsv(client, home.owner, csv)
    const batchId = upload.body().data[0].id
    const running = await ImportBatch.findOrFail(batchId)
    running.classifyStartedAt = DateTime.now()
    await running.save()

    const busy = await client.post(`/api/v1/imports/${batchId}/classify`).actingAs(home.owner)

    busy.assertStatus(409)
    busy.assertBodyContains({ code: 'E_IMPORT_CLASSIFY_RUNNING' })
    assert.equal(await countOf(LlmUsage.query().where('household_id', home.household.id)), 0)

    // A run that died long ago does not block the next one.
    running.classifyStartedAt = DateTime.now().minus({ minutes: 30 })
    await running.save()
    const retry = await client.post(`/api/v1/imports/${batchId}/classify`).actingAs(home.owner)
    retry.assertStatus(202)
    await running.refresh()
    assert.isNull(running.classifyStartedAt, 'the claim is released when the run ends')
  })
})
