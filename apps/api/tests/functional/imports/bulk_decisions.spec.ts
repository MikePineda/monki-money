import { DateTime } from 'luxon'
import { test } from '@japa/runner'
import ImportRow from '#models/import_row'
import ImportBatch from '#models/import_batch'
import drive from '@adonisjs/drive/services/main'
import { nabCsv, nabFixture } from '#tests/helpers/importing'
import { categoryBySlug, freezeClock } from '#tests/helpers/ledger'
import { TransactionFactory } from '#database/factories/transaction_factory'
import {
  SAVINGS_NUMBER,
  nabHousehold,
  nabLine,
  rowsStartingWith,
  uploadCsv,
} from '#tests/helpers/imports'

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

  test('test_a_row_of_another_batch_of_the_household_is_not_found', async ({ client, assert }) => {
    const { home, batch, services } = await stagedSample(client)
    const savingsUpload = await uploadCsv(
      client,
      home.owner,
      nabCsv([
        nabLine({
          date: '02 Oct 26',
          amount: '-12.00',
          account: SAVINGS_NUMBER,
          details: 'V1111 01/10 CORNER BAKERY SAMPLEVILLE 70000000990',
          balance: '988.00',
        }),
      ]),
      { accountId: home.savings.id }
    )
    savingsUpload.assertStatus(201)
    const savingsBatch = await ImportBatch.findOrFail(savingsUpload.body().data[0].id)
    const [savingsRow] = await ImportRow.query().where('import_batch_id', savingsBatch.id)

    const response = await client
      .patch(`/api/v1/imports/${batch.id}/rows`)
      .json({
        changes: [
          { rowId: services.id, resolution: 'ignored' },
          { rowId: savingsRow.id, resolution: 'ignored' },
        ],
      })
      .actingAs(home.owner)

    response.assertStatus(404)
    response.assertBodyContains({ code: 'E_ROW_NOT_FOUND' })
    await savingsRow.refresh()
    assert.equal(savingsRow.resolution, 'new')
    const untouched = await ImportRow.findOrFail(services.id)
    assert.equal(untouched.resolution, 'new')
  })

  test('test_a_row_already_confirmed_takes_no_more_changes', async ({ client, assert }) => {
    const { home, batch, services, deli } = await stagedSample(client)
    // `import:nab --confirm-auto` confirms some rows and leaves the batch staged.
    await ImportRow.query().where('id', services.id).update({ confirmed_at: new Date() })

    const response = await client
      .patch(`/api/v1/imports/${batch.id}/rows`)
      .json({
        changes: [
          { rowId: deli.id, resolution: 'ignored' },
          { rowId: services.id, resolution: 'ignored' },
        ],
      })
      .actingAs(home.owner)

    response.assertStatus(409)
    response.assertBodyContains({ code: 'E_IMPORT_BATCH_CLOSED' })
    const deliRow = await ImportRow.findOrFail(deli.id)
    assert.equal(deliRow.resolution, 'new')
  })

  test('test_a_row_named_twice_takes_its_changes_in_order_and_is_answered_once', async ({
    client,
    assert,
  }) => {
    const { home, batch, services } = await stagedSample(client)
    const groceries = await categoryBySlug(home.household.id, 'groceries')

    const response = await client
      .patch(`/api/v1/imports/${batch.id}/rows`)
      .json({
        changes: [
          { rowId: services.id, resolution: 'ignored' },
          { rowId: services.id, resolution: 'new', categoryId: groceries.id },
        ],
      })
      .actingAs(home.owner)

    response.assertStatus(200)
    assert.lengthOf(response.body().data, 1)
    assert.include(response.body().data[0], { id: services.id, resolution: 'new' })
    assert.deepEqual(response.body().data[0].decision, { categoryId: groceries.id })
  })

  test('test_one_request_never_links_two_bank_rows_to_one_transaction', async ({
    client,
    assert,
  }) => {
    const { home, batch } = await stagedSample(client)
    const detail = await client.get(`/api/v1/imports/${batch.id}`).actingAs(home.owner)
    const [first, second] = rowsStartingWith(detail.body().data.rows, 'V1111 15/08 PHONECO')
    const phone = await TransactionFactory.merge({
      householdId: home.household.id,
      accountId: home.everyday.id,
      date: '2026-08-15',
      amountCents: -3_500,
      payee: 'PhoneCo',
    }).create()

    const twice = await client
      .patch(`/api/v1/imports/${batch.id}/rows`)
      .json({
        changes: [
          { rowId: first.id, resolution: 'auto_matched', matchTransactionId: phone.id },
          { rowId: second.id, resolution: 'auto_matched', matchTransactionId: phone.id },
        ],
      })
      .actingAs(home.owner)

    twice.assertStatus(422)
    twice.assertBodyContains({
      errors: [{ field: 'changes.1.matchTransactionId', rule: 'claimed' }],
    })
    const firstRow = await ImportRow.findOrFail(first.id)
    assert.equal(firstRow.resolution, 'new')

    // The first row lets go of it within the same request: the second may take it.
    await client
      .patch(`/api/v1/imports/${batch.id}/rows/${first.id}`)
      .json({ resolution: 'auto_matched', matchTransactionId: phone.id })
      .actingAs(home.owner)
    const handOver = await client
      .patch(`/api/v1/imports/${batch.id}/rows`)
      .json({
        changes: [
          { rowId: first.id, resolution: 'new' },
          { rowId: second.id, resolution: 'auto_matched', matchTransactionId: phone.id },
        ],
      })
      .actingAs(home.owner)
    handOver.assertStatus(200)
    assert.deepEqual(
      handOver.body().data.map((row: any) => row.resolution),
      ['new', 'auto_matched']
    )
  })

  test('test_a_row_staged_without_a_proposal_gets_it_on_its_first_decision', async ({
    client,
    assert,
  }) => {
    const { home, batch, transfer } = await stagedSample(client)
    const groceries = await categoryBySlug(home.household.id, 'groceries')
    // Staged by the previous version while both ran: no proposal kept.
    await ImportRow.query().where('id', transfer.id).update({ proposed_resolution: null })

    await client
      .patch(`/api/v1/imports/${batch.id}/rows`)
      .json({ changes: [{ rowId: transfer.id, resolution: 'new', categoryId: groceries.id }] })
      .actingAs(home.owner)
    const stored = await ImportRow.findOrFail(transfer.id)
    assert.equal(stored.proposedResolution, 'transfer_leg')

    const undo = await client
      .patch(`/api/v1/imports/${batch.id}/rows`)
      .json({ changes: [{ rowId: transfer.id, reset: true }] })
      .actingAs(home.owner)
    undo.assertStatus(200)
    assert.include(undo.body().data[0], { resolution: 'transfer_leg', decidedAt: null })
  })

  test('test_reset_of_a_row_decided_before_its_proposal_was_kept_is_refused', async ({
    client,
    assert,
  }) => {
    const { home, batch, transfer } = await stagedSample(client)
    await ImportRow.query()
      .where('id', transfer.id)
      .update({
        proposed_resolution: null,
        resolution: 'ignored',
        decision: JSON.stringify({}),
        decided_at: DateTime.now().toJSDate(),
      })

    const reset = await client
      .patch(`/api/v1/imports/${batch.id}/rows/${transfer.id}`)
      .json({ reset: true })
      .actingAs(home.owner)

    reset.assertStatus(422)
    reset.assertBodyContains({ errors: [{ field: 'reset', rule: 'unknownProposal' }] })
    const kept = await ImportRow.findOrFail(transfer.id)
    assert.equal(kept.resolution, 'ignored')
    // Saying what the row is instead needs no proposal.
    const stated = await client
      .patch(`/api/v1/imports/${batch.id}/rows`)
      .json({ changes: [{ rowId: transfer.id, reset: true, resolution: 'new' }] })
      .actingAs(home.owner)
    stated.assertStatus(200)
    assert.include(stated.body().data[0], { resolution: 'new' })
  })

  test('test_one_row_can_be_reset_through_its_own_patch', async ({ client, assert }) => {
    const { home, batch, transfer } = await stagedSample(client)
    await client
      .patch(`/api/v1/imports/${batch.id}/rows/${transfer.id}`)
      .json({ resolution: 'ignored' })
      .actingAs(home.owner)

    const restored = await client
      .patch(`/api/v1/imports/${batch.id}/rows/${transfer.id}`)
      .json({ reset: true })
      .actingAs(home.owner)

    restored.assertStatus(200)
    assert.include(restored.body().data, {
      resolution: 'transfer_leg',
      proposedResolution: 'transfer_leg',
      decision: null,
      decidedAt: null,
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
    // At most 5 000 changes a request (well under the 1 MB JSON body limit).
    const tooMany = await client
      .patch(`/api/v1/imports/${batch.id}/rows`)
      .json({ changes: Array.from({ length: 5_001 }, () => ({ rowId: services.id })) })
      .actingAs(home.owner)
    tooMany.assertStatus(422)
    tooMany.assertBodyContains({ errors: [{ field: 'changes', rule: 'array.maxLength' }] })
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
