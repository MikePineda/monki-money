import { test } from '@japa/runner'
import Transaction from '#models/transaction'
import drive from '@adonisjs/drive/services/main'
import { freezeClock } from '#tests/helpers/ledger'
import { nabFixture } from '#tests/helpers/importing'
import { nabHousehold, rowsStartingWith, uploadCsv } from '#tests/helpers/imports'

const TODAY = '2026-10-15T09:00:00+10:00'

test.group('Imports: privacy', (group) => {
  group.each.setup(() => {
    drive.fake()
    const restoreClock = freezeClock(TODAY)
    return () => {
      drive.restore()
      restoreClock()
    }
  })

  test('test_rows_linked_to_the_partners_private_transaction_are_masked', async ({
    client,
    assert,
  }) => {
    const home = await nabHousehold()
    const gift = await client
      .post('/api/v1/transactions')
      .json({
        accountId: home.everyday.id,
        kind: 'expense',
        date: '2026-09-19',
        amountCents: 16_340,
        payee: 'FreshCo Market Northvale',
        isPrivate: true,
      })
      .actingAs(home.member)
    const upload = await uploadCsv(client, home.owner, nabFixture('sample.csv'))
    const batchId = upload.body().data[0].id

    const asOwner = await client.get(`/api/v1/imports/${batchId}`).actingAs(home.owner)
    const [masked] = asOwner
      .body()
      .data.rows.filter((row: any) => row.match?.transactionId === gift.body().data.id)

    assert.include(masked, {
      isMasked: true,
      description: null,
      descriptionNormalized: null,
      nabMerchant: null,
      merchantKey: null,
      merchantFullKey: null,
      decision: null,
    })
    assert.isNull(masked.match.transaction.payee)

    const asMember = await client.get(`/api/v1/imports/${batchId}`).actingAs(home.member)
    const [visible] = rowsStartingWith(asMember.body().data.rows, 'V2222 19/09 FRESHCO')
    assert.isFalse(visible.isMasked)
    assert.equal(visible.match.transaction.payee, 'FreshCo Market Northvale')
  })

  test('test_an_own_private_row_turned_into_a_leg_lends_its_tags_to_no_visible_leg', async ({
    client,
    assert,
  }) => {
    const home = await nabHousehold()
    const secret = await client
      .post('/api/v1/transactions')
      .json({
        accountId: home.savings.id,
        kind: 'income',
        date: '2026-07-31',
        amountCents: 75_000,
        payee: 'Ring fund',
        isPrivate: true,
        tags: ['ring'],
      })
      .actingAs(home.owner)
    const secretId = secret.body().data.id

    const upload = await uploadCsv(client, home.owner, nabFixture('sample.csv'))
    const batchId = upload.body().data[0].id
    const detail = await client.get(`/api/v1/imports/${batchId}`).actingAs(home.owner)
    const [row] = rowsStartingWith(detail.body().data.rows, 'ONLINE A1000000001')
    assert.include(row.transfer, { accountId: home.savings.id, legTransactionId: secretId })

    const confirm = await client.post(`/api/v1/imports/${batchId}/confirm`).actingAs(home.owner)
    confirm.assertStatus(200)

    const reused = await Transaction.findOrFail(secretId)
    assert.include(reused.serialize(), { kind: 'transfer', isPrivate: true })
    assert.deepEqual(reused.tags, ['ring'])
    const transfer = await client
      .get(`/api/v1/transfers/${reused.transferId}`)
      .actingAs(home.member)
    transfer.assertStatus(200)
    // The new Everyday leg is not private: it must not carry the private row's tags.
    assert.notInclude(JSON.stringify(transfer.body()), 'ring')
    const everyday = transfer.body().data.legs.find((leg: any) => leg.id !== secretId)
    assert.deepEqual(everyday.tags, [])
  })

  test('test_partners_private_transaction_is_never_a_transfer_leg', async ({ client, assert }) => {
    const home = await nabHousehold()
    const secret = await client
      .post('/api/v1/transactions')
      .json({
        accountId: home.savings.id,
        kind: 'income',
        date: '2026-07-31',
        amountCents: 75_000,
        payee: 'Secret',
        isPrivate: true,
      })
      .actingAs(home.member)
    const secretId = secret.body().data.id

    const upload = await uploadCsv(client, home.owner, nabFixture('sample.csv'))
    const batchId = upload.body().data[0].id
    const detail = await client.get(`/api/v1/imports/${batchId}`).actingAs(home.owner)
    const [row] = rowsStartingWith(detail.body().data.rows, 'ONLINE A1000000001')
    assert.include(row.transfer, { accountId: home.savings.id, legTransactionId: null })

    await client.post(`/api/v1/imports/${batchId}/confirm`).actingAs(home.owner)

    const untouched = await Transaction.findOrFail(secretId)
    assert.include(untouched.serialize(), { kind: 'income', transferId: null, isPrivate: true })
    const legs = await Transaction.query()
      .where('account_id', home.savings.id)
      .where('kind', 'transfer')
      .where('amount_cents', 75_000)
    assert.lengthOf(legs, 1, 'a leg of its own instead of the private row')
  })
})
