import { test } from '@japa/runner'
import app from '@adonisjs/core/services/app'
import Transaction from '#models/transaction'
import { createHousehold } from '#tests/helpers/household'
import ProductionBootstrap from '#services/bootstrap/production_bootstrap'
import MerchantRule from '#models/merchant_rule'
import db from '@adonisjs/lucid/services/db'
import drive from '@adonisjs/drive/services/main'
import RuleLearner from '#services/rules/rule_learner'
import { nabCsv, nabFixture } from '#tests/helpers/importing'
import { categoryBySlug, freezeClock } from '#tests/helpers/ledger'
import { TransactionFactory } from '#database/factories/transaction_factory'
import { nabHousehold, nabLine, rowsStartingWith, uploadCsv } from '#tests/helpers/imports'

const TODAY = '2026-10-15T09:00:00+10:00'

/** Uploads and confirms the sample export: a ledger with imported rows in triage. */
async function importedSample(client: any) {
  const home = await nabHousehold()
  const upload = await uploadCsv(client, home.owner, nabFixture('sample.csv'))
  const batchId = upload.body().data[0].id
  await client.post(`/api/v1/imports/${batchId}/confirm`).actingAs(home.owner)
  return home
}

test.group('Merchant rules', (group) => {
  group.each.setup(() => {
    drive.fake()
    const restoreClock = freezeClock(TODAY)
    return () => {
      drive.restore()
      restoreClock()
    }
  })

  test('test_regex_rules_with_catastrophic_backtracking_are_rejected', async ({ client }) => {
    const home = await nabHousehold()
    const gym = await categoryBySlug(home.household.id, 'gym')

    for (const pattern of ['([a-z0-9 ]+)+#', '(a|aa)+$', '(x+x+)+y', '(a)\\1+b']) {
      const response = await client
        .post('/api/v1/rules')
        .json({ matchType: 'regex', pattern, categoryId: gym.id })
        .actingAs(home.owner)
      response.assertStatus(422)
      response.assertBodyContains({ errors: [{ field: 'pattern', rule: 'unsafeRegex' }] })
    }

    const tooLong = await client
      .post('/api/v1/rules')
      .json({ matchType: 'contains', pattern: 'A'.repeat(201), categoryId: gym.id })
      .actingAs(home.owner)
    tooLong.assertStatus(422)
    tooLong.assertBodyContains({ errors: [{ field: 'pattern', rule: 'maxLength' }] })

    const safe = await client
      .post('/api/v1/rules')
      .json({ matchType: 'regex', pattern: '^FIT(BOX|NESS) [A-Z]+$', categoryId: gym.id })
      .actingAs(home.owner)
    safe.assertStatus(201)
  })

  test('test_a_stored_unsafe_regex_is_never_run', async ({ client, assert }) => {
    const home = await nabHousehold()
    const gym = await categoryBySlug(home.household.id, 'gym')
    // Written before the check existed (or straight into the database).
    await MerchantRule.create({
      householdId: home.household.id,
      matchType: 'regex',
      pattern: '(a+)+',
      categoryId: gym.id,
      origin: 'user',
    })
    const csv = nabCsv([
      nabLine({
        date: '01 Oct 26',
        amount: '-5.00',
        details: 'V1111 30/09 AAAA SAMPLEVILLE 70000000930',
        balance: '995.00',
        category: 'Uncategorised',
      }),
    ])

    const upload = await uploadCsv(client, home.owner, csv)

    upload.assertStatus(201)
    const detail = await client
      .get(`/api/v1/imports/${upload.body().data[0].id}`)
      .actingAs(home.owner)
    assert.notEqual(detail.body().data.rows[0].suggestion.source, 'rule')
  })

  test('test_learning_the_same_merchant_twice_updates_the_rule', async ({ assert }) => {
    const home = await nabHousehold()
    const groceries = await categoryBySlug(home.household.id, 'groceries')
    const restaurants = await categoryBySlug(home.household.id, 'restaurants-takeaway')
    const pattern = 'freshco market northvale village'
    await MerchantRule.create({
      householdId: home.household.id,
      matchType: 'merchant',
      pattern,
      categoryId: groceries.id,
      origin: 'learned',
    })
    // A concurrent confirm read the rules before this one was written.
    class StaleLearner extends RuleLearner {
      protected override async existingRules() {
        return []
      }
    }
    const decision = {
      action: 'create' as const,
      merchantFullKey: pattern,
      suggested: { categoryId: null, transferAccountId: null, paidByUserId: null, fromRule: false },
      final: { categoryId: restaurants.id, transferAccountId: null, paidByUserId: null },
    }

    await db.transaction((trx) =>
      new StaleLearner().learnFromImport(home.household, home.owner, [decision], trx)
    )

    const rules = await MerchantRule.query()
      .where('household_id', home.household.id)
      .where('pattern', pattern)
    assert.lengthOf(rules, 1)
    assert.include(rules[0].serialize(), { categoryId: restaurants.id, origin: 'learned' })
  })

  test('test_new_household_gets_the_bank_category_rules', async ({ assert }) => {
    const { household } = await createHousehold({ taxonomy: true })

    const rules = await MerchantRule.query().where('household_id', household.id)

    // Transfer rules wait for the accounts they point at (first import).
    assert.lengthOf(rules, 6)
    assert.isTrue(rules.every((rule) => rule.origin === 'system' && rule.categoryId !== null))
  })

  test('test_bootstrap_adds_the_system_rules_idempotently', async ({ assert }) => {
    const bootstrap = await app.container.make(ProductionBootstrap)
    const input = {
      householdName: 'Synthetic Home',
      locale: 'en' as const,
      owner: {
        email: 'owner-rules@example.test',
        fullName: 'Olive Owner',
        password: 'owner-password-123',
        cardSuffix: '1111',
      },
      member: null,
      jointAccountNumber: '000111222',
    }

    const { household } = await bootstrap.run(input)
    await MerchantRule.query().where('household_id', household.id).delete()
    await bootstrap.run(input)
    await bootstrap.run(input)

    const rules = await MerchantRule.query().where('household_id', household.id)
    assert.lengthOf(rules, 8)
    const hnry = rules.find((rule) => rule.pattern === '^Hnry\\b')
    assert.isNotNull(hnry?.transferAccountId)
  })

  test('test_rules_crud_validates_targets_and_patterns', async ({ client, assert }) => {
    const home = await nabHousehold()
    const gym = await categoryBySlug(home.household.id, 'gym')

    const created = await client
      .post('/api/v1/rules')
      .json({ matchType: 'contains', pattern: 'FITBOX', categoryId: gym.id, priority: 5 })
      .actingAs(home.owner)
    created.assertStatus(201)
    created.assertBodyContains({
      data: { matchType: 'contains', pattern: 'FITBOX', categoryId: gym.id, origin: 'user' },
    })

    const merchant = await client
      .post('/api/v1/rules')
      .json({ matchType: 'merchant', pattern: '  FitBox   Gym ', categoryId: gym.id })
      .actingAs(home.member)
    merchant.assertStatus(201)
    merchant.assertBodyContains({ data: { pattern: 'fitbox gym' } })

    const duplicate = await client
      .post('/api/v1/rules')
      .json({ matchType: 'contains', pattern: 'FITBOX', categoryId: gym.id })
      .actingAs(home.owner)
    duplicate.assertStatus(422)
    duplicate.assertBodyContains({ errors: [{ field: 'pattern', rule: 'taken' }] })

    const noTarget = await client
      .post('/api/v1/rules')
      .json({ matchType: 'contains', pattern: 'NOWHERE' })
      .actingAs(home.owner)
    noTarget.assertStatus(422)
    noTarget.assertBodyContains({ errors: [{ field: 'categoryId', rule: 'required' }] })

    const badRegex = await client
      .post('/api/v1/rules')
      .json({ matchType: 'regex', pattern: '(unclosed', categoryId: gym.id })
      .actingAs(home.owner)
    badRegex.assertStatus(422)
    badRegex.assertBodyContains({ errors: [{ field: 'pattern', rule: 'regex' }] })

    const transfer = await client
      .post('/api/v1/rules')
      .json({ matchType: 'regex', pattern: '^SAVE ', transferAccountId: home.savings.id })
      .actingAs(home.owner)
    transfer.assertStatus(201)

    const updated = await client
      .patch(`/api/v1/rules/${created.body().data.id}`)
      .json({ payeeOverride: 'FitBox', paidByUserId: home.member.id })
      .actingAs(home.owner)
    updated.assertStatus(200)
    updated.assertBodyContains({ data: { payeeOverride: 'FitBox', paidByUserId: home.member.id } })

    const index = await client.get('/api/v1/rules').actingAs(home.owner)
    index.assertStatus(200)
    assert.lengthOf(
      index.body().data.filter((rule: any) => rule.origin === 'user'),
      3,
      'the bank defaults are listed too'
    )
    assert.equal(index.body().data[0].id, created.body().data.id, 'highest priority first')

    const destroyed = await client
      .delete(`/api/v1/rules/${created.body().data.id}`)
      .actingAs(home.owner)
    destroyed.assertStatus(204)
    assert.isNull(await MerchantRule.find(created.body().data.id))
  })

  test('test_a_created_rule_is_returned_with_its_counters', async ({ client, assert }) => {
    const home = await nabHousehold()
    const gym = await categoryBySlug(home.household.id, 'gym')

    const created = await client
      .post('/api/v1/rules')
      .json({ matchType: 'contains', pattern: 'FITBOX', categoryId: gym.id })
      .actingAs(home.owner)

    created.assertStatus(201)
    const rule = created.body().data
    assert.strictEqual(rule.hitCount, 0)
    assert.isNull(rule.lastHitAt)
    // Serialized exactly like its row in GET /rules (same keys, same values).
    const index = await client.get('/api/v1/rules').actingAs(home.owner)
    const listed = index.body().data.find((item: { id: number }) => item.id === rule.id)
    assert.deepEqual(rule, listed)
  })

  test('test_rule_apply_recategorizes_history', async ({ client, assert }) => {
    const home = await importedSample(client)
    const personalCare = await categoryBySlug(home.household.id, 'personal-care')
    const imported = await Transaction.query()
      .where('account_id', home.everyday.id)
      .where('raw_description', 'like', 'V1111 02/09 SAMPLE SERVICES%')
      .firstOrFail()
    assert.isTrue(imported.needsReview)
    const typed = await TransactionFactory.merge({
      householdId: home.household.id,
      accountId: home.everyday.id,
      payee: 'Sample Services',
      needsReview: true,
    }).create()
    const reviewed = await TransactionFactory.merge({
      householdId: home.household.id,
      accountId: home.everyday.id,
      payee: 'Sample Services',
      needsReview: false,
    }).create()
    const rule = await client
      .post('/api/v1/rules')
      .json({ matchType: 'contains', pattern: 'SAMPLE SERVICES', categoryId: personalCare.id })
      .actingAs(home.owner)

    const applied = await client
      .post(`/api/v1/rules/${rule.body().data.id}/apply`)
      .actingAs(home.owner)

    applied.assertStatus(200)
    applied.assertBodyContains({ data: { updated: 2 } })
    for (const row of [imported, typed]) {
      await row.refresh()
      assert.equal(row.categoryId, personalCare.id)
      assert.isFalse(row.needsReview)
    }
    await reviewed.refresh()
    assert.notEqual(reviewed.categoryId, personalCare.id, 'reviewed rows are left alone')
  })

  test('test_update_category_with_apply_to_future_learns_rule', async ({ client, assert }) => {
    const home = await importedSample(client)
    const personalCare = await categoryBySlug(home.household.id, 'personal-care')
    const imported = await Transaction.query()
      .where('account_id', home.everyday.id)
      .where('raw_description', 'like', 'V1111 02/09 SAMPLE SERVICES%')
      .firstOrFail()

    const plain = await client
      .patch(`/api/v1/transactions/${imported.id}`)
      .json({ categoryId: personalCare.id })
      .actingAs(home.owner)
    plain.assertStatus(200)
    assert.isNull(
      await MerchantRule.query()
        .where('household_id', home.household.id)
        .where('category_id', personalCare.id)
        .first(),
      'no rule without applyToFuture'
    )

    const learned = await client
      .patch(`/api/v1/transactions/${imported.id}`)
      .json({ categoryId: personalCare.id, applyToFuture: true })
      .actingAs(home.owner)

    learned.assertStatus(200)
    const rule = await MerchantRule.query()
      .where('household_id', home.household.id)
      .where('category_id', personalCare.id)
      .firstOrFail()
    assert.include(rule.serialize(), { matchType: 'merchant', origin: 'learned' })
    assert.match(rule.pattern, /^sample services/)

    // The next export of that merchant arrives categorized by the rule.
    const next = nabCsv([
      nabLine({
        date: '10 Oct 26',
        amount: '-6.30',
        details: 'V1111 08/10 SAMPLE SERVICES PTY LTD GLENHAVEN 70000000912',
        balance: '7636.45',
        category: 'Services',
        merchant: 'Sample Services Pty Ltd',
      }),
    ])
    const upload = await uploadCsv(client, home.owner, next)
    const detail = await client
      .get(`/api/v1/imports/${upload.body().data[0].id}`)
      .actingAs(home.owner)
    const [row] = rowsStartingWith(detail.body().data.rows, 'V1111 08/10')
    assert.include(row.suggestion, {
      source: 'rule',
      categoryId: personalCare.id,
      needsReview: false,
    })
  })
})
