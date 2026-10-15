import { test } from '@japa/runner'
import { TAXONOMY } from '@monkimoney/shared'
import { defaultResolverSteps, resolveRows } from '#domain/importing/resolver_steps'
import { stageRows } from '#domain/importing/staging'
import {
  type CategorySuggester,
  CategorySuggesterChain,
} from '#domain/importing/suggesters/category_suggester'
import { NabCategorySuggester } from '#domain/importing/suggesters/nab_category_suggester'
import { NoneSuggester } from '#domain/importing/suggesters/none_suggester'
import { RuleSuggester } from '#domain/importing/suggesters/rule_suggester'
import type { MerchantRule, ResolverContext, StagedRow } from '#domain/importing/types'
import { mapNabCategory } from '#importers/nab/category_map'
import { NAB_SYSTEM_RULES, resolveSystemRules } from '#importers/nab/system_rules'
import { parseBankCsv } from '#importers/registry'
import {
  candidate,
  merchantRule,
  nabFixture,
  stagedRow,
  transferLeg,
} from '#tests/helpers/importing'

const EVERYDAY = 1
const SAVINGS = 2
const HNRY = 3
const SLUGS = TAXONOMY.flatMap((group) => group.categories.map((category) => category.slug))
const CATEGORY_IDS = new Map(SLUGS.map((slug, index) => [slug, index + 100]))
const id = (slug: string) => CATEGORY_IDS.get(slug)!

function systemRules(): MerchantRule[] {
  return resolveSystemRules(NAB_SYSTEM_RULES, {
    categoryIdBySlug: CATEGORY_IDS,
    accounts: [
      { id: EVERYDAY, institution: 'NAB', kind: 'transaction' },
      { id: SAVINGS, institution: 'NAB', kind: 'savings' },
      { id: HNRY, institution: 'Hnry', kind: 'wallet' },
    ],
  }).map((seed, index) => ({ ...seed, id: index + 1 }))
}

function stagingSuggester(rules: readonly MerchantRule[]): CategorySuggester {
  return new CategorySuggesterChain([
    new RuleSuggester(rules),
    new NabCategorySuggester(mapNabCategory, CATEGORY_IDS),
    new NoneSuggester(),
  ])
}

function context(overrides: Partial<ResolverContext> = {}): ResolverContext {
  return { existingHashes: new Set(), candidates: [], transferLegs: [], rules: [], ...overrides }
}

function resolve(rows: StagedRow[], ctx: ResolverContext) {
  return resolveRows(rows, ctx, defaultResolverSteps(stagingSuggester(ctx.rules)))
}

function sampleRows(): StagedRow[] {
  return stageRows(parseBankCsv(nabFixture('sample.csv')).rows, {
    accountId: EVERYDAY,
    today: '2026-10-15',
  })
}

const linkedTransfer = stagedRow({
  amountCents: -80000,
  bankDate: '2026-07-31',
  date: '2026-07-31',
  details: 'ONLINE A1000000001 Linked Acc Trns SAMPLE HOUSEHO',
  descriptionNormalized: 'Linked Acc Trns SAMPLE HOUSEHO',
  nabCategory: 'Internal transfers',
  nabMerchant: null,
  merchantKey: 'linked acc trns sample househo',
  merchantFullKey: 'linked acc trns sample househo',
  cardSuffix: null,
})

test.group('Importing / resolver', () => {
  test('test_reimporting_the_same_file_is_all_duplicates', async ({ assert }) => {
    const rows = sampleRows()
    let suggestCalls = 0
    const spy: CategorySuggester = {
      async suggest(inputs) {
        suggestCalls++
        return inputs.map(() => null)
      },
    }
    const resolved = await resolveRows(
      rows,
      context({ existingHashes: new Set(rows.map((row) => row.externalHash)) }),
      defaultResolverSteps(spy)
    )
    assert.isTrue(resolved.every((row) => row.resolution === 'duplicate' && row.settled))
    assert.isTrue(resolved.every((row) => row.reasons.join() === 'duplicate_hash'))
    assert.equal(suggestCalls, 0)
  })

  test('test_zero_amount_rows_are_ignored', async ({ assert }) => {
    const [zero] = await resolve([stagedRow({ amountCents: 0 })], context())
    assert.include(zero, { resolution: 'ignored', settled: true, suggestion: null })
    assert.deepEqual(zero.reasons, ['zero_amount'])
  })

  test('test_internal_transfer_with_a_known_other_leg_is_a_transfer_leg', async ({ assert }) => {
    const leg = transferLeg({ accountId: SAVINGS, amountCents: 80000, date: '2026-08-01' })
    const [resolved] = await resolve([linkedTransfer], context({ transferLegs: [leg] }))
    assert.equal(resolved.resolution, 'transfer_leg')
    assert.equal(resolved.transfer?.counterpartAccountId, SAVINGS)
    assert.equal(resolved.transfer?.oppositeLeg, leg)
    assert.isNull(resolved.suggestion)
    assert.isFalse(resolved.needsReview)
  })

  test('test_two_rows_never_claim_the_same_opposite_leg', async ({ assert }) => {
    const leg = transferLeg({ accountId: SAVINGS, amountCents: 80000, date: '2026-07-31' })
    const twin = { ...linkedTransfer, externalHash: 'hash-2' }
    const [first, second] = await resolve([linkedTransfer, twin], context({ transferLegs: [leg] }))
    assert.equal(first.transfer?.oppositeLeg, leg)
    assert.isNull(second.transfer?.oppositeLeg)
    assert.equal(second.resolution, 'needs_confirmation')
  })

  test('test_transfer_with_unknown_destination_needs_confirmation', async ({ assert }) => {
    const [resolved] = await resolve([linkedTransfer], context())
    assert.equal(resolved.resolution, 'needs_confirmation')
    assert.deepEqual(resolved.reasons, ['transfer_destination_unknown'])
    assert.isNull(resolved.suggestion)
  })

  test('test_transfer_already_entered_by_hand_is_offered_as_a_match', async ({ assert }) => {
    const manualLeg = candidate({ id: 77, amountCents: -80000, date: '2026-07-31', payee: null })
    const [resolved] = await resolve([linkedTransfer], context({ candidates: [manualLeg] }))
    assert.equal(resolved.resolution, 'needs_confirmation')
    assert.equal(resolved.matchTransactionId, 77)
    assert.isNotNull(resolved.transfer)
    assert.include(resolved.reasons, 'possible_match')
  })

  test('test_manual_entry_is_auto_matched_and_gets_no_suggestion', async ({ assert }) => {
    const [resolved] = await resolve(
      [stagedRow()],
      context({ candidates: [candidate({ id: 100 })] })
    )
    assert.include(resolved, {
      resolution: 'auto_matched',
      matchTransactionId: 100,
      matchScore: 95,
      suggestion: null,
      upgradesPendingTransaction: false,
    })
  })

  test('test_future_dated_row_is_never_auto_matched', async ({ assert }) => {
    const future = stagedRow({ isFutureDated: true })
    const [resolved] = await resolve([future], context({ candidates: [candidate({ id: 100 })] }))
    assert.equal(resolved.resolution, 'needs_confirmation')
    assert.isTrue(resolved.needsReview)
    assert.includeMembers(resolved.reasons, ['future_date', 'possible_match'])
  })

  test('test_pending_import_is_upgraded_when_its_posted_row_arrives', async ({ assert }) => {
    const [pending, posted] = stageRows(parseBankCsv(nabFixture('pending-then-posted.csv')).rows, {
      accountId: EVERYDAY,
      today: '2026-10-15',
    })
    const pendingTransaction = candidate({
      id: 42,
      amountCents: pending.amountCents,
      date: pending.date,
      payee: pending.nabMerchant,
      description: pending.descriptionNormalized,
      source: 'import',
      status: 'pending',
    })
    const [resolved] = await resolve(
      [posted],
      context({ existingHashes: new Set([pending.externalHash]), candidates: [pendingTransaction] })
    )
    assert.include(resolved, {
      resolution: 'auto_matched',
      matchTransactionId: 42,
      upgradesPendingTransaction: true,
    })
  })

  test('test_rule_payer_overrides_the_card_payer', async ({ assert }) => {
    const rule = merchantRule({ categoryId: id('groceries'), paidByUserId: 2 })
    const [resolved] = await resolve(
      [stagedRow({ suggestedPaidByUserId: 1 })],
      context({ rules: [rule] })
    )
    assert.equal(resolved.paidByUserId, 2)
    assert.include(resolved.suggestion, { source: 'rule', categoryId: id('groceries') })
    assert.isFalse(resolved.needsReview)
  })

  test('test_sample_fixture_resolves_end_to_end_with_system_rules', async ({ assert }) => {
    const rows = sampleRows()
    const resolved = await resolve(rows, context({ rules: systemRules() }))
    const byDetails = (prefix: string) => resolved.filter((r) => r.row.details.startsWith(prefix))

    assert.isTrue(byDetails('POS 27/09 TRANSLINK').every((r) => r.resolution === 'ignored'))
    for (const transfer of byDetails('ONLINE ')) {
      assert.include(transfer, { resolution: 'transfer_leg' })
      assert.equal(transfer.transfer?.counterpartAccountId, SAVINGS)
    }
    for (const fromHnry of byDetails('Hnry')) {
      assert.equal(fromHnry.resolution, 'transfer_leg')
      assert.include(fromHnry.transfer, { counterpartAccountId: HNRY, direction: 'in' })
    }

    const category = (prefix: string) => byDetails(prefix)[0].suggestion
    assert.include(category('INTERNET BPAY DEFT'), { source: 'rule', categoryId: id('rent') })
    assert.include(category('V1111 26/06 TRANSLINK'), { categoryId: id('public-transport') })
    assert.include(category('ACME PAYROLL'), { source: 'rule', categoryId: id('salary') })
    assert.include(category('V2222 07/08 FRESHCO'), { source: 'nab_map', needsReview: false })
    assert.include(category('J DOE'), { categoryId: id('shared-outings'), needsReview: true })
    assert.include(category('CASH'), { categoryId: id('other-income'), needsReview: true })
    assert.include(category('REFUND-EFTPOS'), { categoryId: id('refunds'), needsReview: true })

    const counts = Object.fromEntries(
      ['new', 'ignored', 'transfer_leg', 'auto_matched', 'needs_confirmation', 'duplicate'].map(
        (resolution) => [resolution, resolved.filter((r) => r.resolution === resolution).length]
      )
    )
    assert.deepEqual(counts, {
      new: 29,
      ignored: 2,
      transfer_leg: 4,
      auto_matched: 0,
      needs_confirmation: 0,
      duplicate: 0,
    })
  })
})
