import { test } from '@japa/runner'
import { TAXONOMY } from '@monkimoney/shared'
import { stageRows } from '#domain/importing/staging'
import { linkedHolderKey } from '#domain/importing/linked_accounts'
import { detectTransfer, type TransferContext } from '#domain/importing/transfer_detector'
import type { MerchantRule, StagedRow } from '#domain/importing/types'
import { NAB_SYSTEM_RULES, resolveSystemRules } from '#importers/nab/system_rules'
import { parseBankCsv } from '#importers/registry'
import {
  householdAccount,
  merchantRule,
  nabFixture,
  parsedRow,
  stagedRow,
  transferLeg,
} from '#tests/helpers/importing'

const EVERYDAY = 1
const SAVINGS = 2
const HNRY = 3
const SECOND_SAVINGS = 4
const ME = 10
const PARTNER = 11

/** The household of the fixtures: joint NAB everyday + joint NAB savings + a Hnry wallet. */
const ACCOUNTS = [
  householdAccount({ id: EVERYDAY, institution: 'NAB', kind: 'transaction' }),
  householdAccount({ id: SAVINGS, institution: 'NAB', kind: 'savings' }),
  householdAccount({ id: HNRY, institution: 'Hnry', kind: 'wallet', ownerUserId: ME }),
]

/** The same household with a second NAB savings account: the counterpart is ambiguous. */
const TWO_SAVINGS = [
  ...ACCOUNTS,
  householdAccount({ id: SECOND_SAVINGS, institution: 'NAB', kind: 'savings' }),
]

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

/** A row of the everyday account as staging builds it (merchant keys included). */
function bankRow(details: string, nabCategory: string | null, amountCents = -25000): StagedRow {
  const [row] = stageRows(
    [
      parsedRow({
        bankDate: '2026-10-04',
        amountCents,
        transactionType: amountCents < 0 ? 'TRANSFER DEBIT' : 'TRANSFER CREDIT',
        details,
        detailsRaw: details,
        nabCategory,
        nabMerchant: null,
      }),
    ],
    { accountId: EVERYDAY, today: '2026-10-15' }
  )
  return row
}

/** An internal transfer whose memo the person typed: NAB drops `Linked Acc Trns` for it. */
function freeMemo(memo: string, holder = 'SMITH JO'): StagedRow {
  return bankRow(`ONLINE A1000000002 ${memo} ${holder}`, 'Internal transfers')
}

/** A learned rule sending one linked holder's transfers to one account. */
function holderRule(id: number, pattern: string, accountId: number): MerchantRule {
  return merchantRule({ id, pattern, categoryId: null, transferAccountId: accountId })
}

function noLegs(rules: readonly MerchantRule[], accounts = ACCOUNTS): TransferContext {
  return { rules, legs: [], accounts }
}

/** What the detector says about a free-memo transfer it cannot place. */
const UNKNOWN = {
  signal: 'bank_category' as const,
  direction: 'out' as const,
  counterpartAccountId: null,
  oppositeLeg: null,
  ruleId: null,
  guessed: false,
}

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
      accounts: [],
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
      guessed: false,
    })
  })

  test('test_closest_opposite_leg_wins', ({ assert }) => {
    const near = transferLeg({ accountId: SAVINGS, date: '2026-07-31', transactionId: 9 })
    const detection = detectTransfer(linkedTransfer, {
      rules: [],
      accounts: [],
      legs: [transferLeg({ accountId: HNRY, date: '2026-07-30', transactionId: 8 }), near],
    })
    assert.equal(detection?.oppositeLeg, near)
  })

  test('test_transfer_detector_recognizes_linked_acc_trns', ({ assert }) => {
    const detection = detectTransfer({ ...linkedTransfer, nabCategory: null }, noLegs([], []))
    assert.deepEqual(detection, { ...UNKNOWN, signal: 'linked_account_memo' })
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
    const detection = detectTransfer(linkedTransfer, {
      rules: [rule],
      legs: [elsewhere],
      accounts: [],
    })
    assert.deepEqual(detection, {
      signal: 'rule',
      direction: 'out',
      counterpartAccountId: SAVINGS,
      oppositeLeg: null,
      ruleId: 7,
      guessed: false,
    })

    const leg = transferLeg({ accountId: SAVINGS, date: '2026-07-31' })
    assert.equal(
      detectTransfer(linkedTransfer, { rules: [rule], legs: [elsewhere, leg], accounts: [] })
        ?.oppositeLeg,
      leg
    )
  })

  test('test_transfer_detector_ignores_payid_to_friend', ({ assert }) => {
    const coincidence = transferLeg({ accountId: SAVINGS, amountCents: 11800, date: '2026-08-12' })
    assert.isNull(
      detectTransfer(payIdToFriend, {
        rules: seededRules(),
        legs: [coincidence],
        accounts: ACCOUNTS,
      })
    )
  })

  test('test_a_category_rule_overrides_the_bank_transfer_signal', ({ assert }) => {
    const rule = merchantRule({ pattern: linkedTransfer.merchantFullKey, categoryId: 5 })
    assert.isNull(detectTransfer(linkedTransfer, noLegs([rule])))
  })

  test('test_a_rule_pointing_at_the_imported_account_itself_is_ignored', ({ assert }) => {
    const rule = merchantRule({
      matchType: 'contains',
      pattern: 'Linked Acc Trns',
      categoryId: null,
      transferAccountId: EVERYDAY,
    })
    const detection = detectTransfer(linkedTransfer, noLegs([rule], []))
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

    const detection = detectTransfer(invoice, noLegs(seededRules()))
    assert.equal(detection?.signal, 'rule')
    assert.equal(detection?.direction, 'in')
    assert.equal(detection?.counterpartAccountId, HNRY)
  })

  test('test_internal_transfer_with_free_memo_is_sent_to_the_only_other_nab_account', ({
    assert,
  }) => {
    const accounts = [
      ...ACCOUNTS,
      householdAccount({ id: 5, institution: 'NAB', kind: 'savings', isActive: false }),
      householdAccount({ id: 6, institution: 'Other Bank', kind: 'savings' }),
    ]
    for (const memo of ['Honeymoon', 'xd']) {
      assert.deepEqual(
        detectTransfer(freeMemo(memo), noLegs(seededRules(), accounts)),
        { ...UNKNOWN, counterpartAccountId: SAVINGS, guessed: true },
        memo
      )
    }

    // The savings side of the same movement: its only counterpart is the everyday account.
    const incoming = { ...freeMemo('Honeymoon'), accountId: SAVINGS, amountCents: 25000 }
    const back = detectTransfer(incoming, noLegs([], accounts))
    assert.equal(back?.counterpartAccountId, EVERYDAY)
    assert.isTrue(back?.guessed)
  })

  test('test_no_account_is_guessed_next_to_another_kind_of_account_at_the_bank', ({ assert }) => {
    const card = householdAccount({ id: 7, institution: 'NAB', kind: 'other' })

    // Everyday, savings and a card at NAB: a card repayment must not land in savings.
    const repayment = freeMemo('Card repayment')
    assert.deepEqual(detectTransfer(repayment, noLegs([], [...ACCOUNTS, card])), UNKNOWN)

    // The card is the only other NAB account: still not a savings or transaction account.
    const cardOnly = [ACCOUNTS[0], card, ACCOUNTS[2]]
    assert.deepEqual(detectTransfer(repayment, noLegs([], cardOnly)), UNKNOWN)
  })

  test('test_a_partner_personal_account_is_never_guessed', ({ assert }) => {
    const partnerEveryday = householdAccount({
      id: 8,
      institution: 'NAB',
      kind: 'transaction',
      ownerUserId: PARTNER,
    })
    // Joint everyday whose only other NAB account is the partner's: never a guess.
    const joint = [ACCOUNTS[0], partnerEveryday]
    assert.deepEqual(detectTransfer(freeMemo('Rent'), noLegs([], joint)), UNKNOWN)

    // A personal everyday account guesses its owner's own or a joint account only.
    const mine = householdAccount({ id: EVERYDAY, institution: 'NAB', kind: 'transaction' })
    const personal = { ...mine, ownerUserId: ME }
    const mySavings = householdAccount({ id: 9, institution: 'NAB', ownerUserId: ME })
    const jointSavings = householdAccount({ id: 9, institution: 'NAB' })
    const partnerSavings = householdAccount({ id: 9, institution: 'NAB', ownerUserId: PARTNER })
    const guess = (other: typeof mySavings) =>
      detectTransfer(freeMemo('Rent'), noLegs([], [personal, other]))?.counterpartAccountId
    assert.equal(guess(mySavings), 9)
    assert.equal(guess(jointSavings), 9)
    assert.isNull(guess(partnerSavings))
  })

  test('test_internal_transfer_with_free_memo_uses_the_learned_holder_rule', ({ assert }) => {
    const rules = [
      ...seededRules(),
      holderRule(41, 'linked acc trns nguyen', SAVINGS),
      holderRule(42, 'linked acc trns smith jo', SECOND_SAVINGS),
    ]

    for (const memo of ['Honeymoon', 'xd', 'Linked Acc Trns']) {
      assert.deepEqual(
        detectTransfer(freeMemo(memo), noLegs(rules, TWO_SAVINGS)),
        {
          signal: 'rule',
          direction: 'out',
          counterpartAccountId: SECOND_SAVINGS,
          oppositeLeg: null,
          ruleId: 42,
          guessed: false,
        },
        memo
      )
    }

    const leg = transferLeg({ accountId: SECOND_SAVINGS, amountCents: 25000, date: '2026-10-05' })
    const withLeg = detectTransfer(freeMemo('Honeymoon'), {
      rules,
      legs: [leg],
      accounts: TWO_SAVINGS,
    })
    assert.equal(withLeg?.oppositeLeg, leg)
    // Another holder's transfers follow their own rule.
    assert.equal(
      detectTransfer(freeMemo('Rent', 'NGUYEN'), noLegs(rules, TWO_SAVINGS))?.counterpartAccountId,
      SAVINGS
    )
  })

  test('test_an_opposite_leg_still_wins_over_the_holder_rule', ({ assert }) => {
    const rules = [holderRule(42, 'linked acc trns smith jo', SECOND_SAVINGS)]
    const leg = transferLeg({ accountId: SAVINGS, amountCents: 25000, date: '2026-10-04' })

    const detection = detectTransfer(freeMemo('Honeymoon'), {
      rules,
      legs: [leg],
      accounts: TWO_SAVINGS,
    })

    assert.deepEqual(detection, {
      signal: 'bank_category',
      direction: 'out',
      counterpartAccountId: SAVINGS,
      oppositeLeg: leg,
      ruleId: null,
      guessed: false,
    })
  })

  test('test_a_holder_rule_naming_a_category_blocks_the_guess', ({ assert }) => {
    const pocketMoney = freeMemo('Pocket money', 'SMITH KID')
    const spending = merchantRule({
      id: 50,
      pattern: 'linked acc trns smith kid',
      categoryId: 77,
      transferAccountId: null,
    })
    const spendingWithAccount = { ...spending, transferAccountId: SECOND_SAVINGS }

    // The household calls this holder's movements spending: a person decides, nothing is guessed.
    for (const rule of [spending, spendingWithAccount]) {
      assert.deepEqual(detectTransfer(pocketMoney, noLegs([rule], ACCOUNTS)), UNKNOWN)
      assert.deepEqual(detectTransfer(pocketMoney, noLegs([rule], TWO_SAVINGS)), UNKNOWN)
    }
    // Another holder's spending rule does not block this holder's guess.
    const otherKid = { ...spending, pattern: 'linked acc trns smith ben' }
    assert.isTrue(detectTransfer(pocketMoney, noLegs([otherKid], ACCOUNTS))?.guessed)
  })

  test('test_ambiguous_counterpart_still_needs_confirmation', ({ assert }) => {
    const otherHolder = holderRule(41, 'linked acc trns nguyen', SAVINGS)
    assert.deepEqual(
      detectTransfer(freeMemo('Honeymoon'), noLegs([otherHolder], TWO_SAVINGS)),
      UNKNOWN
    )

    // A holder rule pointing at the imported account itself names nothing.
    const itself = holderRule(42, 'linked acc trns smith jo', EVERYDAY)
    assert.deepEqual(detectTransfer(freeMemo('Honeymoon'), noLegs([itself], TWO_SAVINGS)), UNKNOWN)

    // No other account at the importing bank: nothing to guess.
    const alone = [householdAccount({ id: EVERYDAY, institution: 'NAB', kind: 'transaction' })]
    assert.deepEqual(detectTransfer(freeMemo('Honeymoon'), noLegs([], alone)), UNKNOWN)
  })

  test('test_a_payment_to_a_person_with_the_same_surname_is_not_a_transfer', ({ assert }) => {
    const rules = [...seededRules(), holderRule(42, 'linked acc trns smith jo', SAVINGS)]

    for (const row of [
      bankRow('SMITH JO C1000000003', 'Transfers out'),
      bankRow('SMITH AL C1000000004 Dinner', 'Transfers out'),
      bankRow('ONLINE C1000000005 Pizza night SMITH JO', 'Transfers out'),
      bankRow('SMITH JOIt is me', 'Transfers in', 2500),
      bankRow('SMITH JO C1000000006', null),
    ]) {
      assert.isNull(detectTransfer(row, noLegs(rules)), row.details)
    }
  })

  test('test_linked_holder_key_is_the_merchant_key_of_the_bank_memo', ({ assert }) => {
    for (const holder of [
      'SMITH JO',
      'SMITH JO & DOE AL',
      'J. SMITH',
      'MÜLLER JO',
      "O'NEIL-WARD PK",
      'DE LA CRUZ MA',
    ]) {
      const linked = bankRow(`ONLINE A1000000001 Linked Acc Trns ${holder}`, 'Internal transfers')
      assert.equal(linkedHolderKey(linked), linked.merchantFullKey, holder)
      assert.equal(linkedHolderKey(freeMemo('Honeymoon', holder)), linked.merchantFullKey, holder)
    }

    const linked = bankRow('ONLINE A1000000001 Linked Acc Trns SMITH JO', 'Internal transfers')
    assert.equal(linkedHolderKey(linked), 'linked acc trns smith jo')
    assert.equal(linkedHolderKey({ ...linked, nabCategory: null }), 'linked acc trns smith jo')
    assert.isNull(linkedHolderKey(bankRow('SMITH JO C1000000003', 'Transfers out')))
    assert.isNull(
      linkedHolderKey(bankRow('ONLINE C1000000010 Monthly saving', 'Internal transfers'))
    )
  })

  test('test_a_holder_without_latin_letters_has_no_key', ({ assert }) => {
    // The merchant key keeps Latin letters only: every such holder would share `linked acc trns`.
    const cyrillic = freeMemo('Rent', 'ИВАНОВ ИВ')
    assert.isNull(linkedHolderKey(cyrillic))
    const anyHolder = holderRule(42, 'linked acc trns', SECOND_SAVINGS)
    assert.isNull(detectTransfer(cyrillic, noLegs([anyHolder], TWO_SAVINGS))?.ruleId)
  })

  test('test_an_over_long_holder_has_no_key', ({ assert }) => {
    const longest = freeMemo('xd', 'ABCDEFGHI '.repeat(25).trim())
    assert.isNull(linkedHolderKey(longest))
    assert.isNull(detectTransfer(longest, noLegs([], TWO_SAVINGS))?.ruleId)
  })
})
