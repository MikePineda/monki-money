import { test } from '@japa/runner'
import type User from '#models/user'
import ImportNab from '#commands/import_nab'
import ImportRow from '#models/import_row'
import ImportBatch from '#models/import_batch'
import MerchantRule from '#models/merchant_rule'
import type { ApiClient } from '@japa/api-client'
import ace from '@adonisjs/core/services/ace'
import app from '@adonisjs/core/services/app'
import drive from '@adonisjs/drive/services/main'
import { createHousehold } from '#tests/helpers/household'
import { nabCsv, nabFixture } from '#tests/helpers/importing'
import { categoryBySlug, freezeClock } from '#tests/helpers/ledger'
import { AccountFactory } from '#database/factories/account_factory'
import {
  EVERYDAY_NUMBER,
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
    // NAB's own memo (sent by the bank's rule) teaches the holder; the guesses nobody checked do not.
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

    assert.include(later.row('ONLINE A2000000011 Bali trip'), {
      resolution: 'transfer_leg',
      needsReview: false,
    })
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
    for (const prefix of FREE_MEMOS) {
      assert.include(row(prefix), { resolution: 'transfer_leg', needsReview: true }, prefix)
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
    const learned = await holderRule(teacher.household.id)
    assert.equal(learned?.transferAccountId, holidaySavings.id)

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
  })
})
