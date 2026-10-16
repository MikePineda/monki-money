import { test } from '@japa/runner'
import ImportRow from '#models/import_row'
import ImportBatch from '#models/import_batch'
import drive from '@adonisjs/drive/services/main'
import { nabFixture } from '#tests/helpers/importing'
import { categoryBySlug, freezeClock } from '#tests/helpers/ledger'
import { nabHousehold, rowsStartingWith, uploadCsv } from '#tests/helpers/imports'

const TODAY = '2026-10-15T09:00:00+10:00'

/** The sample export staged, with three of its rows: two new purchases and a transfer leg. */
async function stagedSample(client: any) {
  const home = await nabHousehold()
  const upload = await uploadCsv(client, home.owner, nabFixture('sample.csv'))
  const batch = upload.body().data[0]
  const detail = await client.get(`/api/v1/imports/${batch.id}`).actingAs(home.owner)
  const rows = detail.body().data.rows
  const [services] = rowsStartingWith(rows, 'V1111 02/09 SAMPLE SERVICES')
  const [deli] = rowsStartingWith(rows, 'V1111 29/08 RIVERSIDE')
  const [transfer] = rowsStartingWith(rows, 'ONLINE A1000000001')
  return { home, batch, services, deli, transfer }
}

test.group('Imports: bulk decisions', (group) => {
  group.each.setup(() => {
    drive.fake()
    const restoreClock = freezeClock(TODAY)
    return () => {
      drive.restore()
      restoreClock()
    }
  })

  test('test_bulk_decisions_apply_every_change_in_one_request', async ({ client, assert }) => {
    const { home, batch, services, deli, transfer } = await stagedSample(client)
    const groceries = await categoryBySlug(home.household.id, 'groceries')
    assert.equal(transfer.resolution, 'transfer_leg')

    const response = await client
      .patch(`/api/v1/imports/${batch.id}/rows`)
      .json({
        changes: [
          { rowId: transfer.id, resolution: 'new', categoryId: groceries.id },
          { rowId: services.id, resolution: 'ignored' },
          { rowId: deli.id, categoryId: groceries.id },
        ],
      })
      .actingAs(home.member)

    response.assertStatus(200)
    const answered = response.body().data
    assert.deepEqual(
      answered.map((row: any) => row.id),
      [services.id, deli.id, transfer.id],
      'the changed rows, in file order'
    )
    assert.include(answered[0], { resolution: 'ignored' })
    assert.deepEqual(answered[1].decision, { categoryId: groceries.id })
    assert.isString(answered[1].decidedAt)
    assert.include(answered[2], { resolution: 'new' })
    const stored = await ImportBatch.findOrFail(batch.id)
    assert.equal(stored.ignoredCount, batch.counts.ignored + 1)
    assert.equal(stored.transferCount, batch.counts.transferLeg - 1)
    const deliRow = await ImportRow.findOrFail(deli.id)
    assert.equal(deliRow.decidedByUserId, home.member.id)
  })

  test('test_bulk_decisions_are_all_or_nothing', async ({ client, assert }) => {
    const { home, batch, services, deli } = await stagedSample(client)
    const other = await nabHousehold()
    const foreign = await categoryBySlug(other.household.id, 'groceries')

    const response = await client
      .patch(`/api/v1/imports/${batch.id}/rows`)
      .json({
        changes: [
          { rowId: services.id, resolution: 'ignored' },
          { rowId: deli.id, categoryId: foreign.id },
        ],
      })
      .actingAs(home.owner)

    response.assertStatus(422)
    response.assertBodyContains({
      errors: [{ field: 'changes.1.categoryId', rule: 'database.exists' }],
    })
    const untouched = await ImportRow.findOrFail(services.id)
    assert.equal(untouched.resolution, 'new')
    assert.isNull(untouched.decision)
    assert.isNull(untouched.decidedAt)
    const stored = await ImportBatch.findOrFail(batch.id)
    assert.equal(stored.ignoredCount, batch.counts.ignored)
  })

  test('test_reset_puts_rows_back_as_the_importer_proposed_them', async ({ client, assert }) => {
    const { home, batch, services, deli, transfer } = await stagedSample(client)
    const groceries = await categoryBySlug(home.household.id, 'groceries')
    const before = await client
      .patch(`/api/v1/imports/${batch.id}/rows/${deli.id}`)
      .json({ payee: 'Riverside Deli' })
      .actingAs(home.owner)
    before.assertStatus(200)
    await client
      .patch(`/api/v1/imports/${batch.id}/rows`)
      .json({
        changes: [
          { rowId: services.id, resolution: 'ignored' },
          { rowId: deli.id, categoryId: groceries.id },
          { rowId: transfer.id, resolution: 'new', categoryId: groceries.id },
        ],
      })
      .actingAs(home.owner)

    // "Undo": back to the proposal, then the decision each row had before.
    const undo = await client
      .patch(`/api/v1/imports/${batch.id}/rows`)
      .json({
        changes: [
          { rowId: services.id, reset: true },
          { rowId: deli.id, reset: true, payee: 'Riverside Deli' },
          { rowId: transfer.id, reset: true },
        ],
      })
      .actingAs(home.owner)

    undo.assertStatus(200)
    const [servicesRow, deliRow, transferRow] = undo.body().data
    assert.include(servicesRow, { resolution: 'new', decision: null, decidedAt: null })
    assert.include(transferRow, { resolution: 'transfer_leg', decision: null, decidedAt: null })
    assert.include(deliRow, { resolution: 'new' })
    assert.deepEqual(deliRow.decision, { payee: 'Riverside Deli' })
    assert.isString(deliRow.decidedAt)
    const stored = await ImportRow.findOrFail(services.id)
    assert.isNull(stored.decidedByUserId)
    const counted = await ImportBatch.findOrFail(batch.id)
    assert.include(counted.serialize(), {
      ignoredCount: batch.counts.ignored,
      transferCount: batch.counts.transferLeg,
      newCount: batch.counts.new,
    })
  })

  test('test_bulk_decisions_refuse_unknown_rows_closed_batches_and_bad_bodies', async ({
    client,
    assert,
  }) => {
    const { home, batch, services } = await stagedSample(client)

    const empty = await client
      .patch(`/api/v1/imports/${batch.id}/rows`)
      .json({ changes: [] })
      .actingAs(home.owner)
    empty.assertStatus(422)
    const notADecision = await client
      .patch(`/api/v1/imports/${batch.id}/rows`)
      .json({ changes: [{ rowId: services.id, resolution: 'duplicate' }] })
      .actingAs(home.owner)
    notADecision.assertStatus(422)
    notADecision.assertBodyContains({ errors: [{ field: 'changes.0.resolution' }] })

    const unknown = await client
      .patch(`/api/v1/imports/${batch.id}/rows`)
      .json({
        changes: [
          { rowId: services.id, resolution: 'ignored' },
          { rowId: 2_000_000, resolution: 'ignored' },
        ],
      })
      .actingAs(home.owner)
    unknown.assertStatus(404)
    unknown.assertBodyContains({ code: 'E_ROW_NOT_FOUND' })
    const untouched = await ImportRow.findOrFail(services.id)
    assert.equal(untouched.resolution, 'new')

    await client.post(`/api/v1/imports/${batch.id}/confirm`).actingAs(home.owner)
    const late = await client
      .patch(`/api/v1/imports/${batch.id}/rows`)
      .json({ changes: [{ rowId: services.id, resolution: 'ignored' }] })
      .actingAs(home.owner)
    late.assertStatus(409)
    late.assertBodyContains({ code: 'E_IMPORT_BATCH_CLOSED' })
  })
})
