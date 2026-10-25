import { DateTime } from 'luxon'
import { test } from '@japa/runner'
import type User from '#models/user'
import ImportNab from '#commands/import_nab'
import ImportRow from '#models/import_row'
import ImportBatch from '#models/import_batch'
import MerchantRule from '#models/merchant_rule'
import LinkedHolderAccount from '#models/linked_holder_account'
import Transaction from '#models/transaction'
import type { ApiClient } from '@japa/api-client'
import ace from '@adonisjs/core/services/ace'
import app from '@adonisjs/core/services/app'
import drive from '@adonisjs/drive/services/main'
import { createHousehold } from '#tests/helpers/household'
import { nabCsv, nabFixture } from '#tests/helpers/importing'
import { categoryBySlug, freezeClock } from '#tests/helpers/ledger'
import { AccountFactory } from '#database/factories/account_factory'
import { TransactionFactory } from '#database/factories/transaction_factory'
import {
  EVERYDAY_NUMBER,
  SAVINGS_NUMBER,
  nabHousehold,
  nabLine,
  rowsStartingWith,
  uploadCsv,
} from '#tests/helpers/imports'

const TODAY = '2026-10-15T09:00:00+10:00'
const FIXTURE = 'linked-transfers.csv'

/** The holder rule tests/fixtures/nab/linked-transfers.csv teaches (synthetic holder `MORROW AJ`). */
const HOLDER_PATTERN = 'linked acc trns morrow aj'

/** Details prefixes of the fixture's rows. */
const BANK_MEMO = 'ONLINE A2000000001 Linked Acc Trns'
const HOLIDAY_MEMO = 'ONLINE A2000000002 Holiday fund'
const SHORT_MEMO = 'ONLINE A2000000003 xd'
const FREE_MEMOS = [HOLIDAY_MEMO, SHORT_MEMO]
const PAYID_SAME_SURNAME = 'MORROW BT'
const GUESSED = 'transfer_destination_guessed'

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

/** The accounts the household learned the fixture's linked holder moves money to. */
async function holderAccounts(householdId: number) {
  const rows = await LinkedHolderAccount.query()
    .where('household_id', householdId)
    .where('holder_key', HOLDER_PATTERN)
    .orderBy('account_id')
  return rows.map((row) => row.accountId)
}

/** A third NAB account: a second savings account for holidays. */
function holidaySavingsOf(householdId: number) {
  return AccountFactory.merge({
    householdId,
    name: 'Holiday savings',
    institution: 'NAB',
    kind: 'savings',
  }).create()
}

/** Confirms `batchId` sending the rows that start with each prefix to `accountId`. */
function confirmTransfers(
  client: ApiClient,
  user: User,
  batchId: number,
  rows: Array<{ id: number }>,
  accountId: number
) {
  return client
    .post(`/api/v1/imports/${batchId}/confirm`)
    .json({
      decisions: rows.map((row) => ({
        rowId: row.id,
        resolution: 'transfer_leg',
        transferAccountId: accountId,
      })),
    })
    .actingAs(user)
}

/** The household's merchant rule for the fixture's linked holder, if any. */
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
    ace.ui.switchMode('raw')
    const restoreClock = freezeClock(TODAY)
    return () => {
      ace.ui.switchMode('normal')
      drive.restore()
      restoreClock()
    }
  })

  test('test_free_memo_internal_transfers_go_to_the_only_other_nab_account', async ({
    client,
    assert,
  }) => {
    const home = await nabHousehold()

    const { batch, row } = await stage(client, home.owner, nabFixture(FIXTURE))

    assert.include(batch.counts, { rows: 5, transferLeg: 3, needsConfirmation: 0, new: 2 })
    assert.include(row(BANK_MEMO), { resolution: 'transfer_leg', needsReview: false })
    assert.include(row(BANK_MEMO).transfer, { accountId: home.savings.id, signal: 'rule' })
    for (const prefix of FREE_MEMOS) {
      // The only other NAB account is a guess: proposed, flagged for review.
      assert.include(row(prefix), { resolution: 'transfer_leg', needsReview: true }, prefix)
      assert.include(row(prefix).transfer, {
        accountId: home.savings.id,
        signal: 'bank_category',
      })
      assert.include(row(prefix).reasons, GUESSED)
      assert.notInclude(row(prefix).reasons, 'transfer_destination_unknown')
    }
    assert.include(row(PAYID_SAME_SURNAME), { resolution: 'new', transfer: null })

    const stored = await ImportRow.query()
      .where('import_batch_id', batch.id)
      .where('nab_category', 'Internal transfers')
    assert.lengthOf(stored, 3)
    assert.isTrue(stored.every((r) => r.suggestedTransferAccountId === home.savings.id))
  })

  test('test_no_account_is_guessed_next_to_a_card_or_a_partner_account', async ({
    client,
    assert,
  }) => {
    // NAB everyday + savings + a NAB card tracked as `other`.
    const withCard = await nabHousehold()
    await AccountFactory.merge({
      householdId: withCard.household.id,
      name: 'Credit card',
      institution: 'NAB',
      kind: 'other',
    }).create()
    // Joint NAB everyday whose only other NAB account is the partner's own.
    const withPartner = await createHousehold({
      users: 2,
      taxonomy: true,
      accounts: [
        { name: 'Everyday', institution: 'NAB', externalAccountNumber: EVERYDAY_NUMBER },
        { name: 'Partner everyday', institution: 'NAB', kind: 'transaction', owner: 1 },
      ],
    })

    for (const home of [withCard, withPartner]) {
      const { row } = await stage(client, home.owner, nabFixture(FIXTURE))
      for (const prefix of FREE_MEMOS) {
        assert.include(row(prefix), { resolution: 'needs_confirmation' }, prefix)
        assert.isNull(row(prefix).transfer.accountId)
        assert.include(row(prefix).reasons, 'transfer_destination_unknown')
      }
    }
  })

  test('test_a_guessed_transfer_waits_for_a_person_in_the_unattended_backfill', async ({
    assert,
  }) => {
    const home = await nabHousehold()

    const command = await ace.create(ImportNab, [
      app.makePath(`tests/fixtures/nab/${FIXTURE}`),
      '--account',
      String(home.everyday.id),
      '--household',
      String(home.household.id),
      '--confirm-auto',
    ])
    await command.exec()

    command.assertSucceeded()
    const batch = await ImportBatch.query().where('household_id', home.household.id).firstOrFail()
    assert.equal(batch.status, 'staged', 'the guessed transfers still wait for a person')
    const open = await ImportRow.query()
      .where('import_batch_id', batch.id)
      .whereNull('confirmed_at')
    assert.lengthOf(open, 2)
    for (const prefix of FREE_MEMOS) {
      assert.isTrue(
        open.some((row) => row.descriptionRaw.startsWith(prefix)),
        `${prefix} stays staged`
      )
    }
    assert.isTrue(open.every((row) => row.resolution === 'transfer_leg' && row.needsReview))
  })

  test('test_confirming_a_linked_transfer_teaches_the_holder_rule_for_later_memos', async ({
    client,
    assert,
  }) => {
    const home = await nabHousehold()
    const first = await stage(client, home.owner, nabFixture(FIXTURE))

    const confirm = await client
      .post(`/api/v1/imports/${first.batch.id}/confirm`)
      .actingAs(home.owner)

    confirm.assertStatus(200)
    assert.include(confirm.body().data, { transfers: 3, remaining: 0 })
    // NAB's own memo (sent by the bank's rule) teaches the holder's account;
    // the guesses nobody checked do not.
    assert.deepEqual(await holderAccounts(home.household.id), [home.savings.id])
    const [learned] = await LinkedHolderAccount.query().where('household_id', home.household.id)
    assert.equal(learned.confirmedCount, 1)
    // No merchant rule: neither on the holder nor on the memos the person typed.
    assert.isNull(await holderRule(home.household.id))
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

    assert.include(later.row('ONLINE A2000000011 Bali trip'), {
      resolution: 'transfer_leg',
      needsReview: false,
    })
    assert.include(later.row('ONLINE A2000000011 Bali trip').transfer, {
      accountId: home.savings.id,
      signal: 'bank_category',
      ruleId: null,
    })
    assert.deepEqual(later.row('ONLINE A2000000011 Bali trip').transfer.candidateAccountIds, [])
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
    const first = await stage(client, home.owner, nabFixture(FIXTURE))

    assert.include(first.batch.counts, { needsConfirmation: 3, transferLeg: 0 })
    const linked = [BANK_MEMO, ...FREE_MEMOS].map(first.row)
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
    assert.deepEqual(await holderAccounts(home.household.id), [holiday.id])
    const [learned] = await LinkedHolderAccount.query().where('household_id', home.household.id)
    assert.equal(learned.confirmedCount, 3, 'one more confirmation per row')

    const later = await stage(client, home.owner, laterExport())
    assert.include(later.batch.counts, { transferLeg: 1, needsConfirmation: 0 })
    assert.include(later.row('ONLINE A2000000011 Bali trip').transfer, {
      accountId: holiday.id,
      signal: 'bank_category',
    })
    const stored = await ImportRow.query()
      .where('import_batch_id', later.batch.id)
      .where('nab_category', 'Internal transfers')
      .firstOrFail()
    assert.equal(stored.suggestedTransferAccountId, holiday.id)
  })

  test('test_a_category_rule_on_the_holder_key_is_never_overwritten', async ({
    client,
    assert,
  }) => {
    const home = await nabHousehold()
    const category = await categoryBySlug(home.household.id, 'personal-care')
    const spending = await MerchantRule.create({
      householdId: home.household.id,
      matchType: 'merchant',
      pattern: HOLDER_PATTERN,
      categoryId: category.id,
      origin: 'user',
    })
    const { batch, row } = await stage(client, home.owner, nabFixture(FIXTURE))

    // NAB's own memo follows the person's rule: spending, not a transfer.
    assert.include(row(BANK_MEMO), { resolution: 'new', transfer: null })
    assert.include(row(BANK_MEMO).suggestion, { source: 'rule', categoryId: category.id })
    // A typed memo for that holder is not guessed into savings: a person decides.
    for (const prefix of FREE_MEMOS) {
      assert.include(row(prefix), { resolution: 'needs_confirmation' }, prefix)
      assert.include(row(prefix).transfer, { accountId: null, signal: 'bank_category' })
      assert.include(row(prefix).reasons, 'transfer_destination_unknown')
    }

    const confirm = await client
      .post(`/api/v1/imports/${batch.id}/confirm`)
      .json({
        decisions: [
          {
            rowId: row(HOLIDAY_MEMO).id,
            resolution: 'transfer_leg',
            transferAccountId: home.savings.id,
          },
          { rowId: row(SHORT_MEMO).id, resolution: 'new', categoryId: category.id },
        ],
      })
      .actingAs(home.owner)

    confirm.assertStatus(200)
    await spending.refresh()
    assert.include(spending.serialize(), {
      categoryId: category.id,
      transferAccountId: null,
      origin: 'user',
    })
  })

  test('test_a_guessed_transfer_confirmed_blind_stays_flagged_in_the_ledger', async ({
    client,
    assert,
  }) => {
    const home = await nabHousehold()
    const { batch, row } = await stage(client, home.owner, nabFixture(FIXTURE))

    // The holiday transfer is accepted explicitly; the `xd` one is confirmed as guessed.
    const confirm = await client
      .post(`/api/v1/imports/${batch.id}/confirm`)
      .json({
        decisions: [
          {
            rowId: row(HOLIDAY_MEMO).id,
            resolution: 'transfer_leg',
            transferAccountId: home.savings.id,
          },
        ],
      })
      .actingAs(home.owner)

    confirm.assertStatus(200)
    const legsOf = async (prefix: string) => {
      const stored = await ImportRow.findOrFail(row(prefix).id)
      const leg = await Transaction.findOrFail(stored.transactionId!)
      return Transaction.query().where('transfer_id', leg.transferId!).orderBy('id')
    }
    const blind = await legsOf(SHORT_MEMO)
    assert.sameMembers(
      blind.map((leg) => leg.accountId),
      [home.everyday.id, home.savings.id]
    )
    assert.isTrue(
      blind.every((leg) => leg.needsReview),
      'both legs of a guess nobody checked'
    )
    for (const prefix of [HOLIDAY_MEMO, BANK_MEMO]) {
      const legs = await legsOf(prefix)
      assert.lengthOf(legs, 2, prefix)
      assert.isTrue(
        legs.every((leg) => !leg.needsReview),
        prefix
      )
    }
  })

  test('test_an_over_long_holder_is_confirmed_without_a_holder_rule', async ({
    client,
    assert,
  }) => {
    const home = await nabHousehold()
    const details = `ONLINE A2000000001 xd ${'ABCDEFGHI '.repeat(25).trim()}`
    const { batch, row } = await stage(
      client,
      home.owner,
      nabCsv([
        nabLine({
          date: '06 Oct 26',
          amount: '-20.00',
          type: 'TRANSFER DEBIT',
          details,
          balance: '1680.00',
          category: 'Internal transfers',
        }),
      ])
    )

    const confirm = await client
      .post(`/api/v1/imports/${batch.id}/confirm`)
      .json({
        decisions: [
          {
            rowId: row('ONLINE A2000000001 xd').id,
            resolution: 'transfer_leg',
            transferAccountId: home.savings.id,
          },
        ],
      })
      .actingAs(home.owner)

    confirm.assertStatus(200)
    assert.include(confirm.body().data, { transfers: 1, remaining: 0 })
    const rules = await MerchantRule.query()
      .where('household_id', home.household.id)
      .where('origin', 'learned')
    assert.isTrue(rules.every((rule) => rule.pattern.length <= 255))
    assert.isFalse(rules.some((rule) => rule.pattern.startsWith('linked acc trns')))
  })

  test('test_a_learned_holder_rule_never_reaches_another_household', async ({ client, assert }) => {
    const teacher = await nabHousehold()
    const holidaySavings = await AccountFactory.merge({
      householdId: teacher.household.id,
      institution: 'NAB',
      kind: 'savings',
    }).create()
    const taught = await stage(client, teacher.owner, nabFixture(FIXTURE))
    await client
      .post(`/api/v1/imports/${taught.batch.id}/confirm`)
      .json({
        decisions: [BANK_MEMO, ...FREE_MEMOS].map((prefix) => ({
          rowId: taught.row(prefix).id,
          resolution: 'transfer_leg',
          transferAccountId: holidaySavings.id,
        })),
      })
      .actingAs(teacher.owner)
    assert.deepEqual(await holderAccounts(teacher.household.id), [holidaySavings.id])

    // One other NAB account here: a leak of the teacher's accounts would make it
    // ambiguous, a leak of its rules would send the row to the teacher's savings.
    const other = await nabHousehold()
    const { row } = await stage(client, other.owner, laterExport())

    assert.include(row('ONLINE A2000000011 Bali trip'), {
      resolution: 'transfer_leg',
      needsReview: true,
    })
    assert.include(row('ONLINE A2000000011 Bali trip').transfer, {
      accountId: other.savings.id,
      signal: 'bank_category',
      ruleId: null,
    })
    assert.isNull(await holderRule(other.household.id))
    assert.deepEqual(await holderAccounts(other.household.id), [])
  })

  test('test_a_holder_confirmed_to_two_accounts_is_staged_for_review_with_both', async ({
    client,
    assert,
  }) => {
    const home = await nabHousehold()
    const holiday = await holidaySavingsOf(home.household.id)
    const first = await stage(client, home.owner, nabFixture(FIXTURE))
    // The holiday memo goes to the holiday account, the other two to savings.
    const confirm = await client
      .post(`/api/v1/imports/${first.batch.id}/confirm`)
      .json({
        decisions: [
          { prefix: HOLIDAY_MEMO, accountId: holiday.id },
          { prefix: BANK_MEMO, accountId: home.savings.id },
          { prefix: SHORT_MEMO, accountId: home.savings.id },
        ].map(({ prefix, accountId }) => ({
          rowId: first.row(prefix).id,
          resolution: 'transfer_leg',
          transferAccountId: accountId,
        })),
      })
      .actingAs(home.owner)
    confirm.assertStatus(200)
    assert.deepEqual(
      await holderAccounts(home.household.id),
      [home.savings.id, holiday.id].sort((a, b) => a - b)
    )

    const later = await stage(client, home.owner, laterExport())

    // Never a confident leg to whichever account came last: a person picks.
    const bali = later.row('ONLINE A2000000011 Bali trip')
    assert.include(bali, { resolution: 'needs_confirmation' })
    assert.include(bali.transfer, { accountId: null, signal: 'bank_category' })
    assert.deepEqual(
      bali.transfer.candidateAccountIds,
      [home.savings.id, holiday.id].sort((a, b) => a - b)
    )
    assert.include(bali.reasons, 'transfer_destination_unknown')
    assert.include(later.batch.counts, { needsConfirmation: 1, transferLeg: 0 })
  })

  test('test_a_holder_rule_learned_by_an_earlier_release_still_counts', async ({
    client,
    assert,
  }) => {
    const home = await nabHousehold()
    const holiday = await holidaySavingsOf(home.household.id)
    const earlier = await MerchantRule.create({
      householdId: home.household.id,
      matchType: 'merchant',
      pattern: HOLDER_PATTERN,
      transferAccountId: home.savings.id,
      origin: 'learned',
    })

    // Its account is the one known account: a confident leg, as before.
    const first = await stage(client, home.owner, laterExport())
    const bali = first.row('ONLINE A2000000011 Bali trip')
    assert.include(bali, { resolution: 'transfer_leg', needsReview: false })
    assert.include(bali.transfer, {
      accountId: home.savings.id,
      signal: 'rule',
      ruleId: earlier.id,
    })

    // A transfer of that holder confirmed elsewhere adds an account; the rule stays as it was.
    const confirm = await confirmTransfers(client, home.owner, first.batch.id, [bali], holiday.id)
    confirm.assertStatus(200)
    await earlier.refresh()
    assert.equal(earlier.transferAccountId, home.savings.id)
    assert.deepEqual(await holderAccounts(home.household.id), [holiday.id])

    const next = await stage(
      client,
      home.owner,
      nabCsv([
        nabLine({
          date: '14 Oct 26',
          amount: '-15.00',
          type: 'TRANSFER DEBIT',
          details: 'ONLINE A2000000021 Concert MORROW AJ',
          balance: '1510.00',
          category: 'Internal transfers',
        }),
      ])
    )
    const concert = next.row('ONLINE A2000000021 Concert')
    assert.include(concert, { resolution: 'needs_confirmation' })
    assert.deepEqual(
      concert.transfer.candidateAccountIds,
      [home.savings.id, holiday.id].sort((a, b) => a - b)
    )
  })

  test('test_upper_case_memo_still_finds_the_holder', async ({ client, assert }) => {
    const home = await nabHousehold()
    const holiday = await holidaySavingsOf(home.household.id)
    const upload = nabFixture('upper-case-memo.csv')

    // First import: nothing known yet. NAB's own memo in the same file tells
    // where the memo typed in capitals ends.
    const first = await stage(client, home.owner, upload)
    const decided = await client
      .post(`/api/v1/imports/${first.batch.id}/confirm`)
      .json({
        decisions: [
          {
            rowId: first.row('ONLINE A3000000001').id,
            resolution: 'transfer_leg',
            transferAccountId: holiday.id,
          },
          {
            rowId: first.row('ONLINE A3000000002').id,
            resolution: 'transfer_leg',
            transferAccountId: holiday.id,
          },
          { rowId: first.row('ONLINE A3000000003').id, resolution: 'ignored' },
          { rowId: first.row('ONLINE C3000000004').id, resolution: 'ignored' },
        ],
      })
      .actingAs(home.owner)
    decided.assertStatus(200)
    const learned = await LinkedHolderAccount.query().where('household_id', home.household.id)
    assert.deepEqual(
      learned.map((row) => [row.holderKey, row.accountId, row.confirmedCount]),
      [[HOLDER_PATTERN, holiday.id, 2]]
    )

    // The same memos later: the one in capitals follows the holder.
    const again = nabCsv([
      nabLine({
        date: '13 Oct 26',
        amount: '-70.00',
        type: 'TRANSFER DEBIT',
        details: 'ONLINE A3000000012 SKI WEEKEND MORROW AJ',
        balance: '1490.00',
        category: 'Internal transfers',
      }),
      nabLine({
        date: '12 Oct 26',
        amount: '-60.00',
        type: 'TRANSFER DEBIT',
        details: 'ONLINE A3000000011 BALI MORROW AJX',
        balance: '1560.00',
        category: 'Internal transfers',
      }),
      nabLine({
        date: '11 Oct 26',
        amount: '-40.00',
        type: 'TRANSFER DEBIT',
        details: 'ONLINE C3000000013 GIFT MORROW AJ',
        balance: '1620.00',
        category: 'Transfers out',
      }),
    ])
    const later = await stage(client, home.owner, again)
    assert.include(later.row('ONLINE A3000000012 SKI WEEKEND'), {
      resolution: 'transfer_leg',
      needsReview: false,
    })
    assert.include(later.row('ONLINE A3000000012 SKI WEEKEND').transfer, {
      accountId: holiday.id,
    })
    // Another holder (`MORROW AJX`) is not this one: a person decides.
    assert.include(later.row('ONLINE A3000000011 BALI'), { resolution: 'needs_confirmation' })
    assert.isNull(later.row('ONLINE A3000000011 BALI').transfer.accountId)
    // A payment to someone of that name is never a transfer.
    assert.include(later.row('ONLINE C3000000013 GIFT'), { resolution: 'new', transfer: null })
  })

  test('test_both_exports_in_one_upload_settle_the_transfer_by_its_opposite_leg', async ({
    client,
    assert,
  }) => {
    const home = await nabHousehold({ savingsNumber: SAVINGS_NUMBER })
    const holiday = await holidaySavingsOf(home.household.id)
    // The holder is known in both savings accounts: alone, the row would wait for a person.
    await LinkedHolderAccount.createMany(
      [home.savings.id, holiday.id].map((accountId) => ({
        householdId: home.household.id,
        holderKey: HOLDER_PATTERN,
        accountId,
        lastConfirmedAt: DateTime.now(),
      }))
    )
    const both = nabCsv([
      nabLine({
        date: '04 Oct 26',
        amount: '-250.00',
        type: 'TRANSFER DEBIT',
        details: 'ONLINE A2000000002 Holiday fund MORROW AJ',
        balance: '1700.00',
        category: 'Internal transfers',
      }),
      nabLine({
        date: '04 Oct 26',
        amount: '250.00',
        account: SAVINGS_NUMBER,
        type: 'TRANSFER CREDIT',
        details: 'ONLINE A2000000002 Holiday fund MORROW AJ',
        balance: '5250.00',
        category: 'Internal transfers',
      }),
    ])

    const upload = await uploadCsv(client, home.owner, both)

    upload.assertStatus(201)
    const batches: any[] = upload.body().data
    assert.lengthOf(batches, 2)
    const rowOf = async (accountId: number) => {
      const batch = batches.find((candidate) => candidate.accountId === accountId)
      const detail = await client.get(`/api/v1/imports/${batch.id}`).actingAs(home.owner)
      return detail.body().data.rows[0]
    }
    const everydayRow = await rowOf(home.everyday.id)
    const savingsRow = await rowOf(home.savings.id)
    assert.include(everydayRow, { resolution: 'transfer_leg', needsReview: false })
    assert.include(everydayRow.transfer, { accountId: home.savings.id, signal: 'bank_category' })
    assert.include(savingsRow, { resolution: 'transfer_leg', needsReview: false })
    assert.include(savingsRow.transfer, { accountId: home.everyday.id })
  })

  test('test_an_opposite_leg_already_in_the_ledger_settles_the_transfer', async ({
    client,
    assert,
  }) => {
    const home = await nabHousehold()
    const holiday = await holidaySavingsOf(home.household.id)
    await LinkedHolderAccount.createMany(
      [home.savings.id, holiday.id].map((accountId) => ({
        householdId: home.household.id,
        holderKey: HOLDER_PATTERN,
        accountId,
        lastConfirmedAt: DateTime.now(),
      }))
    )
    // The holiday deposit was typed by hand.
    const deposit = await TransactionFactory.merge({
      householdId: home.household.id,
      accountId: holiday.id,
      kind: 'income',
      date: '2026-10-12',
      amountCents: 8_000,
      createdByUserId: home.owner.id,
    }).create()

    const { row } = await stage(client, home.owner, laterExport())

    const bali = row('ONLINE A2000000011 Bali trip')
    assert.include(bali, { resolution: 'transfer_leg', needsReview: false })
    assert.include(bali.transfer, { accountId: holiday.id, legTransactionId: deposit.id })
  })
})
