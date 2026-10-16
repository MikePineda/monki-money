import { test } from '@japa/runner'
import type User from '#models/user'
import ImportRow from '#models/import_row'
import MerchantRule from '#models/merchant_rule'
import type { ApiClient } from '@japa/api-client'
import drive from '@adonisjs/drive/services/main'
import { freezeClock } from '#tests/helpers/ledger'
import { nabCsv, nabFixture } from '#tests/helpers/importing'
import { AccountFactory } from '#database/factories/account_factory'
import { nabHousehold, nabLine, rowsStartingWith, uploadCsv } from '#tests/helpers/imports'

const TODAY = '2026-10-15T09:00:00+10:00'

/** The holder rule tests/fixtures/nab/linked-transfers.csv teaches (synthetic holder `MORROW AJ`). */
const HOLDER_PATTERN = 'linked acc trns morrow aj'

/** Details prefixes of the fixture's rows. */
const BANK_MEMO = 'ONLINE A2000000001 Linked Acc Trns'
const HOLIDAY_MEMO = 'ONLINE A2000000002 Holiday fund'
const SHORT_MEMO = 'ONLINE A2000000003 xd'
const PAYID_SAME_SURNAME = 'MORROW BT'

/**
 * A later export of the everyday account: a memo never seen before for the
 * same holder, and a PayID payment to a person with exactly that name.
 */
function laterExport() {
  return nabCsv([
    nabLine({
      date: '12 Oct 26',
      amount: '-80.00',
      type: 'TRANSFER DEBIT',
      details: 'ONLINE A2000000011 Bali trip MORROW AJ',
      balance: '1525.00',
      category: 'Internal transfers',
    }),
    nabLine({
      date: '11 Oct 26',
      amount: '-30.00',
      type: 'TRANSFER DEBIT',
      details: 'MORROW AJ C2000000012',
      balance: '1605.00',
      category: 'Transfers out',
    }),
  ])
}

/** Uploads a CSV and returns its batch and the rows of `GET /imports/:id`. */
async function stage(client: ApiClient, user: User, csv: Buffer) {
  const upload = await uploadCsv(client, user, csv)
  upload.assertStatus(201)
  const [batch] = upload.body().data
  const detail = await client.get(`/api/v1/imports/${batch.id}`).actingAs(user)
  detail.assertStatus(200)
  const rows: any[] = detail.body().data.rows
  return { batch, rows, row: (prefix: string) => rowsStartingWith(rows, prefix)[0] }
}

/** The household's learned rule for the fixture's linked holder, if any. */
function holderRule(householdId: number) {
  return MerchantRule.query()
    .where('household_id', householdId)
    .where('match_type', 'merchant')
    .where('pattern', HOLDER_PATTERN)
    .first()
}

test.group('Imports: transfers to linked accounts', (group) => {
  group.each.setup(() => {
    drive.fake()
    const restoreClock = freezeClock(TODAY)
    return () => {
      drive.restore()
      restoreClock()
    }
  })

  test('test_free_memo_internal_transfers_go_to_the_only_other_nab_account', async ({
    client,
    assert,
  }) => {
    const home = await nabHousehold()

    const { batch, row } = await stage(client, home.owner, nabFixture('linked-transfers.csv'))

    assert.include(batch.counts, { rows: 5, transferLeg: 3, needsConfirmation: 0, new: 2 })
    assert.include(row(BANK_MEMO), { resolution: 'transfer_leg' })
    assert.include(row(BANK_MEMO).transfer, { accountId: home.savings.id, signal: 'rule' })
    for (const prefix of [HOLIDAY_MEMO, SHORT_MEMO]) {
      assert.include(row(prefix), { resolution: 'transfer_leg' }, prefix)
      assert.include(row(prefix).transfer, {
        accountId: home.savings.id,
        signal: 'bank_category',
      })
      assert.notInclude(row(prefix).reasons, 'transfer_destination_unknown')
    }
    assert.include(row(PAYID_SAME_SURNAME), { resolution: 'new', transfer: null })

    const stored = await ImportRow.query()
      .where('import_batch_id', batch.id)
      .where('nab_category', 'Internal transfers')
    assert.lengthOf(stored, 3)
    assert.isTrue(stored.every((r) => r.suggestedTransferAccountId === home.savings.id))
  })

  test('test_confirming_a_linked_transfer_teaches_the_holder_rule_for_later_memos', async ({
    client,
    assert,
  }) => {
    const home = await nabHousehold()
    const first = await stage(client, home.owner, nabFixture('linked-transfers.csv'))

    const confirm = await client
      .post(`/api/v1/imports/${first.batch.id}/confirm`)
      .actingAs(home.owner)

    confirm.assertStatus(200)
    assert.include(confirm.body().data, { transfers: 3, remaining: 0 })
    const rule = await holderRule(home.household.id)
    assert.include(rule?.serialize(), {
      transferAccountId: home.savings.id,
      categoryId: null,
      origin: 'learned',
    })
    // The memo the person typed is not a merchant: nothing is learned under it.
    const memoRules = await MerchantRule.query()
      .where('household_id', home.household.id)
      .whereIn('pattern', ['holiday fund morrow aj', 'xd morrow aj'])
    assert.lengthOf(memoRules, 0)

    // A second NAB savings account: the importing account no longer has one counterpart.
    await AccountFactory.merge({
      householdId: home.household.id,
      name: 'Holiday savings',
      institution: 'NAB',
      kind: 'savings',
    }).create()
    const later = await stage(client, home.owner, laterExport())

    assert.include(later.row('ONLINE A2000000011 Bali trip'), { resolution: 'transfer_leg' })
    assert.include(later.row('ONLINE A2000000011 Bali trip').transfer, {
      accountId: home.savings.id,
      signal: 'rule',
      ruleId: rule!.id,
    })
    assert.include(later.row('MORROW AJ C2000000012'), { resolution: 'new', transfer: null })
  })

  test('test_with_several_counterparts_the_person_picks_and_later_memos_follow', async ({
    client,
    assert,
  }) => {
    const home = await nabHousehold()
    const holiday = await AccountFactory.merge({
      householdId: home.household.id,
      name: 'Holiday savings',
      institution: 'NAB',
      kind: 'savings',
    }).create()
    const first = await stage(client, home.owner, nabFixture('linked-transfers.csv'))

    assert.include(first.batch.counts, { needsConfirmation: 3, transferLeg: 0 })
    const linked = [BANK_MEMO, HOLIDAY_MEMO, SHORT_MEMO].map(first.row)
    for (const pending of linked) {
      assert.include(pending, { resolution: 'needs_confirmation' })
      assert.isNull(pending.transfer.accountId)
      assert.include(pending.reasons, 'transfer_destination_unknown')
    }

    const confirm = await client
      .post(`/api/v1/imports/${first.batch.id}/confirm`)
      .json({
        decisions: linked.map((pending) => ({
          rowId: pending.id,
          resolution: 'transfer_leg',
          transferAccountId: holiday.id,
        })),
      })
      .actingAs(home.owner)

    confirm.assertStatus(200)
    assert.include(confirm.body().data, { transfers: 3, remaining: 0 })
    const rule = await holderRule(home.household.id)
    assert.equal(rule?.transferAccountId, holiday.id)

    const later = await stage(client, home.owner, laterExport())
    assert.include(later.batch.counts, { transferLeg: 1, needsConfirmation: 0 })
    assert.include(later.row('ONLINE A2000000011 Bali trip').transfer, {
      accountId: holiday.id,
      signal: 'rule',
    })
    const stored = await ImportRow.query()
      .where('import_batch_id', later.batch.id)
      .where('nab_category', 'Internal transfers')
      .firstOrFail()
    assert.equal(stored.suggestedTransferAccountId, holiday.id)
  })

  test('test_a_learned_holder_rule_never_reaches_another_household', async ({ client, assert }) => {
    const teacher = await nabHousehold()
    const taught = await stage(client, teacher.owner, nabFixture('linked-transfers.csv'))
    await client.post(`/api/v1/imports/${taught.batch.id}/confirm`).actingAs(teacher.owner)
    assert.isNotNull(await holderRule(teacher.household.id))

    const other = await nabHousehold()
    await AccountFactory.merge({
      householdId: other.household.id,
      institution: 'NAB',
      kind: 'savings',
    }).create()
    const { row } = await stage(client, other.owner, laterExport())

    assert.include(row('ONLINE A2000000011 Bali trip'), { resolution: 'needs_confirmation' })
    assert.include(row('ONLINE A2000000011 Bali trip').transfer, {
      accountId: null,
      signal: 'bank_category',
    })
    assert.isNull(await holderRule(other.household.id))
  })
})
