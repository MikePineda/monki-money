import { test } from '@japa/runner'
import { TAXONOMY } from '@monkimoney/shared'
import { stageRows } from '#domain/importing/staging'
import { detectTransfer } from '#domain/importing/transfer_detector'
import type { MerchantRule } from '#domain/importing/types'
import { NAB_SYSTEM_RULES, resolveSystemRules } from '#importers/nab/system_rules'
import { parseBankCsv } from '#importers/registry'
import { merchantRule, nabFixture, stagedRow, transferLeg } from '#tests/helpers/importing'

const EVERYDAY = 1
const SAVINGS = 2
const HNRY = 3

const linkedTransfer = stagedRow({
  accountId: EVERYDAY,
  amountCents: -75000,
  bankDate: '2026-07-31',
  date: '2026-07-31',
  transactionType: 'TRANSFER DEBIT',
  details: 'ONLINE A1000000001 Linked Acc Trns SAMPLE HOUSEHO',
  detailsRaw: 'ONLINE A1000000001 Linked Acc Trns SAMPLE HOUSEHO',
  descriptionNormalized: 'Linked Acc Trns SAMPLE HOUSEHO',
  nabCategory: 'Internal transfers',
  nabMerchant: null,
  merchantKey: 'linked acc trns sample househo',
  merchantFullKey: 'linked acc trns sample househo',
  cardSuffix: null,
})

const payIdToFriend = stagedRow({
  accountId: EVERYDAY,
  amountCents: -11800,
  bankDate: '2026-08-12',
  date: '2026-08-12',
  transactionType: 'TRANSFER DEBIT',
  details: 'J DOE C1000000002 hot pot',
  detailsRaw: 'J DOE C1000000002 hot pot',
  descriptionNormalized: 'J DOE hot pot',
  nabCategory: 'Transfers out',
  nabMerchant: null,
  merchantKey: 'j doe hot pot',
  merchantFullKey: 'j doe hot pot',
  cardSuffix: null,
})

function seededRules(): MerchantRule[] {
  const slugs = TAXONOMY.flatMap((group) => group.categories.map((category) => category.slug))
  const seeds = resolveSystemRules(NAB_SYSTEM_RULES, {
    categoryIdBySlug: new Map(slugs.map((slug, index) => [slug, index + 100])),
    accounts: [
      { id: EVERYDAY, institution: 'NAB', kind: 'transaction' },
      { id: SAVINGS, institution: 'NAB', kind: 'savings' },
      { id: HNRY, institution: 'Hnry', kind: 'wallet' },
    ],
  })
  return seeds.map((seed, index) => ({ ...seed, id: index + 1 }))
}

test.group('Importing / transfer detector', () => {
  test('test_transfer_detector_links_opposite_amount_in_other_account_within_two_days', ({
    assert,
  }) => {
    const leg = transferLeg({ accountId: SAVINGS, amountCents: 75000, date: '2026-08-02' })
    const detection = detectTransfer(linkedTransfer, {
      rules: [],
      legs: [
        transferLeg({
          accountId: SAVINGS,
          amountCents: 75000,
          date: '2026-08-03',
          transactionId: 1,
        }),
        transferLeg({
          accountId: EVERYDAY,
          amountCents: 75000,
          date: '2026-07-31',
          transactionId: 2,
        }),
        transferLeg({
          accountId: SAVINGS,
          amountCents: -75000,
          date: '2026-07-31',
          transactionId: 3,
        }),
        leg,
      ],
    })
    assert.deepEqual(detection, {
      signal: 'bank_category',
      direction: 'out',
      counterpartAccountId: SAVINGS,
      oppositeLeg: leg,
      ruleId: null,
    })
  })

  test('test_closest_opposite_leg_wins', ({ assert }) => {
    const near = transferLeg({ accountId: SAVINGS, date: '2026-07-31', transactionId: 9 })
    const detection = detectTransfer(linkedTransfer, {
      rules: [],
      legs: [transferLeg({ accountId: HNRY, date: '2026-07-30', transactionId: 8 }), near],
    })
    assert.equal(detection?.oppositeLeg, near)
  })

  test('test_transfer_detector_recognizes_linked_acc_trns', ({ assert }) => {
    const detection = detectTransfer(
      { ...linkedTransfer, nabCategory: null },
      { rules: [], legs: [] }
    )
    assert.deepEqual(detection, {
      signal: 'linked_account_memo',
      direction: 'out',
      counterpartAccountId: null,
      oppositeLeg: null,
      ruleId: null,
    })
  })

  test('test_transfer_rule_names_the_destination_when_no_leg_is_found', ({ assert }) => {
    const rule = merchantRule({
      id: 7,
      matchType: 'contains',
      pattern: 'Linked Acc Trns',
      categoryId: null,
      transferAccountId: SAVINGS,
    })
    const elsewhere = transferLeg({ accountId: HNRY, date: '2026-07-31' })
    const detection = detectTransfer(linkedTransfer, { rules: [rule], legs: [elsewhere] })
    assert.deepEqual(detection, {
      signal: 'rule',
      direction: 'out',
      counterpartAccountId: SAVINGS,
      oppositeLeg: null,
      ruleId: 7,
    })

    const leg = transferLeg({ accountId: SAVINGS, date: '2026-07-31' })
    assert.equal(
      detectTransfer(linkedTransfer, { rules: [rule], legs: [elsewhere, leg] })?.oppositeLeg,
      leg
    )
  })

  test('test_transfer_detector_ignores_payid_to_friend', ({ assert }) => {
    const coincidence = transferLeg({ accountId: SAVINGS, amountCents: 11800, date: '2026-08-12' })
    assert.isNull(detectTransfer(payIdToFriend, { rules: seededRules(), legs: [coincidence] }))
  })

  test('test_a_category_rule_overrides_the_bank_transfer_signal', ({ assert }) => {
    const rule = merchantRule({ pattern: linkedTransfer.merchantFullKey, categoryId: 5 })
    assert.isNull(detectTransfer(linkedTransfer, { rules: [rule], legs: [] }))
  })

  test('test_a_rule_pointing_at_the_imported_account_itself_is_ignored', ({ assert }) => {
    const rule = merchantRule({
      matchType: 'contains',
      pattern: 'Linked Acc Trns',
      categoryId: null,
      transferAccountId: EVERYDAY,
    })
    const detection = detectTransfer(linkedTransfer, { rules: [rule], legs: [] })
    assert.equal(detection?.signal, 'bank_category')
    assert.isNull(detection?.counterpartAccountId)
  })

  test('test_hnry_invoice_row_is_a_transfer_from_hnry_account', ({ assert }) => {
    const rows = stageRows(parseBankCsv(nabFixture('sample.csv')).rows, {
      accountId: EVERYDAY,
      today: '2026-10-15',
    })
    const invoice = rows.find((row) => row.details.startsWith('Hnry - INV-'))!
    assert.equal(invoice.nabCategory, 'Transfers in')

    const detection = detectTransfer(invoice, { rules: seededRules(), legs: [] })
    assert.equal(detection?.signal, 'rule')
    assert.equal(detection?.direction, 'in')
    assert.equal(detection?.counterpartAccountId, HNRY)
  })
})
