import { DateTime } from 'luxon'
import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import type Account from '#models/account'
import Category from '#models/category'
import type Transfer from '#models/transfer'
import Invitation from '#models/invitation'
import Payslip from '#models/payslip'
import SavingsGoal from '#models/savings_goal'
import RecurringItem from '#models/recurring_item'
import MonthlyInsight from '#models/monthly_insight'
import ImportRow from '#models/import_row'
import ImportBatch from '#models/import_batch'
import MerchantRule from '#models/merchant_rule'
import PushSubscription from '#models/push_subscription'
import Transaction from '#models/transaction'
import AccountCard from '#models/account_card'
import HouseholdMember from '#models/household_member'
import router from '@adonisjs/core/services/router'
import CategoryGroup from '#models/category_group'
import { receiptKey } from '#domain/receipts/receipt_key'
import { createHousehold, type TestHousehold } from '#tests/helpers/household'
import { aBrowserSubscription, subscribeDevice } from '#tests/helpers/push'
import { download, unzip } from '#tests/helpers/zip'
import db from '@adonisjs/lucid/services/db'
import HouseholdOwnershipTransfer from '#models/household_ownership_transfer'
import { FACTORY_PASSWORD } from '#database/factories/user_factory'
import { fakeObjectStorage, restoreObjectStorage } from '#tests/helpers/storage'
import { generateInvitationToken, hashInvitationToken } from '#domain/households/invitation_token'
import { TransactionFactory, TransferFactory } from '#database/factories/transaction_factory'

/**
 * Cross-household access answers 404 (never 403, which would leak that the
 * id exists) and leaves the victim's data untouched. One case per route
 * with an `:id`-like param (or a household-scoped reference in the body,
 * see BODY_SCOPED); the guard test below fails when a new route is added
 * without a case here.
 */

interface Victim {
  household: TestHousehold
  account: Account
  card: AccountCard
  group: CategoryGroup
  category: Category
  invitation: Invitation
  transaction: Transaction
  transfer: Transfer
  payslip: Payslip
  goal: SavingsGoal
  insight: MonthlyInsight
  batch: ImportBatch
  row: ImportRow
  rule: MerchantRule
  recurringItem: RecurringItem
  /** One of the bank defaults seeded with the taxonomy (`origin = 'system'`). */
  systemRule: MerchantRule
  /** An uploaded receipt photo, still in (fake) storage. */
  receiptKey: string
  /** The owner's phone, subscribed to Web Push. */
  pushDevice: PushSubscription
}

interface Attacker {
  household: TestHousehold
  account: Account
  batch: ImportBatch
}

interface IsolationCase {
  route: string
  method: 'get' | 'patch' | 'post' | 'put' | 'delete'
  url: (victim: Victim, attacker: Attacker) => string
  body?: Record<string, unknown> | ((victim: Victim) => Record<string, unknown>)
  /** 404 unless the param is not an id (see the case). */
  status?: number
}

const cases: IsolationCase[] = [
  { route: 'accounts.show', method: 'get', url: (v) => `/api/v1/accounts/${v.account.id}` },
  {
    route: 'accounts.update',
    method: 'patch',
    url: (v) => `/api/v1/accounts/${v.account.id}`,
    body: { name: 'Hijacked' },
  },
  { route: 'accounts.destroy', method: 'delete', url: (v) => `/api/v1/accounts/${v.account.id}` },
  {
    route: 'accounts.cards.store',
    method: 'post',
    url: (v) => `/api/v1/accounts/${v.account.id}/cards`,
    body: { cardSuffix: '9999' },
  },
  {
    route: 'accounts.cards.destroy',
    method: 'delete',
    url: (v) => `/api/v1/accounts/${v.account.id}/cards/${v.card.id}`,
  },
  {
    // Own account in the path, another household's card id.
    route: 'accounts.cards.destroy',
    method: 'delete',
    url: (v, a) => `/api/v1/accounts/${a.account.id}/cards/${v.card.id}`,
  },
  {
    route: 'category_groups.update',
    method: 'patch',
    url: (v) => `/api/v1/category-groups/${v.group.id}`,
    body: { name: 'Hijacked' },
  },
  {
    route: 'category_groups.destroy',
    method: 'delete',
    url: (v) => `/api/v1/category-groups/${v.group.id}`,
  },
  {
    route: 'categories.update',
    method: 'patch',
    url: (v) => `/api/v1/categories/${v.category.id}`,
    body: { name: 'Hijacked' },
  },
  {
    route: 'categories.destroy',
    method: 'delete',
    url: (v) => `/api/v1/categories/${v.category.id}`,
  },
  {
    route: 'household.invitations.destroy',
    method: 'delete',
    url: (v) => `/api/v1/household/invitations/${v.invitation.id}`,
  },
  {
    route: 'household.invitations.resend',
    method: 'post',
    url: (v) => `/api/v1/household/invitations/${v.invitation.id}/resend`,
  },
  {
    route: 'transactions.show',
    method: 'get',
    url: (v) => `/api/v1/transactions/${v.transaction.id}`,
  },
  {
    route: 'transactions.update',
    method: 'patch',
    url: (v) => `/api/v1/transactions/${v.transaction.id}`,
    body: { payee: 'Hijacked' },
  },
  {
    route: 'transactions.destroy',
    method: 'delete',
    url: (v) => `/api/v1/transactions/${v.transaction.id}`,
  },
  {
    route: 'transactions.splits.update',
    method: 'put',
    url: (v) => `/api/v1/transactions/${v.transaction.id}/splits`,
    body: { splits: [] },
  },
  { route: 'transfers.show', method: 'get', url: (v) => `/api/v1/transfers/${v.transfer.id}` },
  {
    route: 'transfers.update',
    method: 'patch',
    url: (v) => `/api/v1/transfers/${v.transfer.id}`,
    body: { memo: 'Hijacked' },
  },
  {
    route: 'transfers.destroy',
    method: 'delete',
    url: (v) => `/api/v1/transfers/${v.transfer.id}`,
  },
  {
    route: 'payslips.destroy',
    method: 'delete',
    url: (v) => `/api/v1/payslips/${v.payslip.id}`,
  },
  {
    route: 'reports.category',
    method: 'get',
    url: (v) => `/api/v1/reports/category/${v.category.id}`,
  },
  // A tag is not an id: another household's tag simply does not exist here.
  {
    route: 'tags.show',
    method: 'get',
    url: (v) => `/api/v1/tags/${encodeURIComponent(v.transaction.tags[0])}`,
  },
  {
    route: 'tags.update',
    method: 'patch',
    url: (v) => `/api/v1/tags/${encodeURIComponent(v.transaction.tags[0])}`,
    body: { name: 'Hijacked' },
  },
  { route: 'goals.show', method: 'get', url: (v) => `/api/v1/goals/${v.goal.id}` },
  {
    route: 'goals.update',
    method: 'patch',
    url: (v) => `/api/v1/goals/${v.goal.id}`,
    body: { name: 'Hijacked', status: 'reached' },
  },
  { route: 'goals.destroy', method: 'delete', url: (v) => `/api/v1/goals/${v.goal.id}` },
  {
    route: 'goals.projection',
    method: 'get',
    url: (v) => `/api/v1/goals/${v.goal.id}/projection`,
  },
  // A month is not an id: the attacker only ever reaches its own summaries.
  { route: 'insights.show', method: 'get', url: (v) => `/api/v1/insights/${v.insight.month}` },
  {
    // Its own ledger has nothing that month: 422, and the victim's stored
    // summary is neither returned nor replaced.
    route: 'insights.generate',
    method: 'post',
    url: (v) => `/api/v1/insights/${v.insight.month}/generate`,
    body: { force: true },
    status: 422,
  },
  { route: 'imports.show', method: 'get', url: (v) => `/api/v1/imports/${v.batch.id}` },
  {
    route: 'imports.classify',
    method: 'post',
    url: (v) => `/api/v1/imports/${v.batch.id}/classify`,
  },
  {
    route: 'imports.confirm',
    method: 'post',
    url: (v) => `/api/v1/imports/${v.batch.id}/confirm`,
  },
  {
    route: 'imports.cancel',
    method: 'post',
    url: (v) => `/api/v1/imports/${v.batch.id}/cancel`,
  },
  {
    route: 'imports.rows.update',
    method: 'patch',
    url: (v) => `/api/v1/imports/${v.batch.id}/rows/${v.row.id}`,
    body: { resolution: 'ignored' },
  },
  {
    // Own batch in the path, another household's row id.
    route: 'imports.rows.update',
    method: 'patch',
    url: (v, a) => `/api/v1/imports/${a.batch.id}/rows/${v.row.id}`,
    body: { resolution: 'ignored' },
  },
  {
    route: 'imports.rows.bulk',
    method: 'patch',
    url: (v) => `/api/v1/imports/${v.batch.id}/rows`,
    body: (v) => ({ changes: [{ rowId: v.row.id, resolution: 'ignored' }] }),
  },
  {
    // Own batch in the path, another household's row id in the body.
    route: 'imports.rows.bulk',
    method: 'patch',
    url: (_v, a) => `/api/v1/imports/${a.batch.id}/rows`,
    body: (v) => ({ changes: [{ rowId: v.row.id, resolution: 'ignored' }] }),
  },
  {
    route: 'rules.update',
    method: 'patch',
    url: (v) => `/api/v1/rules/${v.rule.id}`,
    body: { pattern: 'HIJACKED' },
  },
  {
    // A bank default: the 404 comes before its pattern lock (a 422 would leak the id).
    route: 'rules.update',
    method: 'patch',
    url: (v) => `/api/v1/rules/${v.systemRule.id}`,
    body: { pattern: 'HIJACKED' },
  },
  { route: 'rules.destroy', method: 'delete', url: (v) => `/api/v1/rules/${v.rule.id}` },
  { route: 'rules.apply', method: 'post', url: (v) => `/api/v1/rules/${v.rule.id}/apply` },
  {
    route: 'recurring.update',
    method: 'patch',
    url: (v) => `/api/v1/recurring/${v.recurringItem.id}`,
    body: { payee: 'Hijacked', status: 'dismissed', amountCents: 1 },
  },
  {
    route: 'recurring.destroy',
    method: 'delete',
    url: (v) => `/api/v1/recurring/${v.recurringItem.id}`,
  },
  {
    route: 'receipts.scan',
    method: 'post',
    url: () => '/api/v1/receipts/scan',
    body: (v) => ({ key: v.receiptKey }),
  },
  {
    // Someone else's device: never re-registered to the attacker.
    route: 'push.subscriptions.store',
    method: 'post',
    url: () => '/api/v1/push/subscriptions',
    body: (v) => aBrowserSubscription(v.pushDevice.endpoint),
  },
  {
    route: 'push.subscriptions.destroy',
    method: 'delete',
    url: () => '/api/v1/push/subscriptions',
    body: (v) => ({ endpoint: v.pushDevice.endpoint }),
  },
  {
    // Another household's owner as the new owner: not a member here.
    route: 'household.transferOwnership',
    method: 'post',
    url: () => '/api/v1/household/transfer-ownership',
    body: (v) => ({ userId: v.household.owner.id, password: FACTORY_PASSWORD }),
  },
]

/** A staged batch with one open row for `account`. */
async function stagedBatch(householdId: number, accountId: number) {
  const batch = await ImportBatch.create({
    householdId,
    accountId,
    source: 'nab_csv',
    status: 'staged',
    fileHash: 'a'.repeat(64),
  })
  const row = await ImportRow.create({
    importBatchId: batch.id,
    householdId,
    accountId,
    rowIndex: 0,
    externalHash: 'b'.repeat(64),
    raw: {},
    bankDate: '2026-10-01',
    date: '2026-10-01',
    amountCents: -1_000,
    descriptionRaw: 'VICTIM ROW',
    descriptionNormalized: 'VICTIM ROW',
    resolution: 'new',
    reasons: [],
  })
  return { batch, row }
}

/**
 * Routes with params that are not household-scoped ids: public invitation
 * routes are looked up by an unguessable token, not by id.
 */
const NOT_ID_SCOPED = new Set(['auth.invitations.show', 'auth.invitations.accept'])

/**
 * Routes without params that still reach a household-scoped resource by a
 * reference in the body (the key of an uploaded receipt photo, the member
 * who becomes the owner, the endpoint of a push subscription).
 */
const BODY_SCOPED = new Set([
  'receipts.scan',
  'household.transferOwnership',
  'push.subscriptions.store',
  'push.subscriptions.destroy',
])

async function victimHousehold(): Promise<Victim> {
  const household = await createHousehold({
    taxonomy: true,
    accounts: [{ name: 'Victim account' }, { name: 'Victim savings' }],
  })
  const account = household.accounts[0]
  const card = await AccountCard.create({
    accountId: account.id,
    cardSuffix: '4242',
    userId: household.owner.id,
  })
  const group = await CategoryGroup.query()
    .where('household_id', household.household.id)
    .where('slug', 'food')
    .firstOrFail()
  const category = await Category.query()
    .where('household_id', household.household.id)
    .where('slug', 'groceries')
    .firstOrFail()
  const invitation = await Invitation.create({
    householdId: household.household.id,
    email: 'victim-invitee@example.test',
    tokenHash: hashInvitationToken(generateInvitationToken()),
    role: 'member',
    expiresAt: DateTime.now().plus({ days: 7 }),
  })
  const transaction = await TransactionFactory.merge({
    householdId: household.household.id,
    accountId: account.id,
    categoryId: category.id,
    payee: 'Victim payee',
    tags: ['Victim trip'],
  }).create()
  const transfer = await TransferFactory.merge({
    householdId: household.household.id,
    fromAccountId: account.id,
    toAccountId: household.accounts[1].id,
    memo: 'Victim memo',
  }).create()
  const payslip = await Payslip.create({
    householdId: household.household.id,
    accountId: account.id,
    userId: household.owner.id,
    date: transfer.date,
    grossCents: transfer.amountCents + 1_000,
    netCents: transfer.amountCents,
    transferId: transfer.id,
    memo: 'Victim payslip',
  })
  await TransactionFactory.apply('income')
    .merge({
      householdId: household.household.id,
      accountId: account.id,
      amountCents: payslip.grossCents,
      date: payslip.date,
      payslipId: payslip.id,
      payee: null,
    })
    .create()
  const goal = await SavingsGoal.create({
    householdId: household.household.id,
    name: 'Victim goal',
    targetCents: 100_000,
    accountId: account.id,
    sortOrder: 0,
  })
  const insight = await MonthlyInsight.create({
    householdId: household.household.id,
    month: transaction.date.slice(0, 7),
    locale: 'en',
    headline: 'Victim headline',
    bodyMarkdown: 'Victim body',
    highlights: [],
    inputJson: {
      month: transaction.date.slice(0, 7),
      currencyCode: 'AUD',
      totals: { incomeCents: 0, expenseCents: 0, netCents: 0 },
      byCategory: [],
    },
    model: 'fake',
    generatedAt: DateTime.now(),
  })
  const { batch, row } = await stagedBatch(household.household.id, account.id)
  const rule = await MerchantRule.create({
    householdId: household.household.id,
    matchType: 'contains',
    pattern: 'VICTIM',
    categoryId: category.id,
    origin: 'user',
  })
  const recurringItem = await RecurringItem.create({
    householdId: household.household.id,
    merchantKey: 'victim lettings',
    payee: 'Victim lettings',
    cadence: 'weekly',
    amountCents: 50_000,
    nextExpectedDate: '2026-10-20',
    categoryId: category.id,
    accountId: account.id,
  })
  const systemRule = await MerchantRule.query()
    .where('household_id', household.household.id)
    .where('origin', 'system')
    .orderBy('id')
    .firstOrFail()
  return {
    household,
    account,
    card,
    group,
    category,
    invitation,
    transaction,
    transfer,
    payslip,
    goal,
    insight,
    batch,
    row,
    rule,
    recurringItem,
    systemRule,
    receiptKey: receiptKey(household.household.id, randomUUID(), 'image/jpeg'),
    pushDevice: await subscribeDevice(household.owner, household.household),
  }
}

test.group('Tenant isolation', () => {
  test('test_every_resource_returns_404_for_other_household ({$self})')
    .with(cases.map((entry) => ({ ...entry, toString: () => `${entry.method} ${entry.route}` })))
    .run(async ({ client, assert, cleanup }, entry) => {
      const storage = fakeObjectStorage()
      cleanup(() => restoreObjectStorage())
      const victim = await victimHousehold()
      storage.put(victim.receiptKey, Buffer.from('victim photo'), 'image/jpeg')
      const attackerHousehold = await createHousehold({
        taxonomy: true,
        accounts: [{ name: 'Attacker account' }],
      })
      const { batch: attackerBatch } = await stagedBatch(
        attackerHousehold.household.id,
        attackerHousehold.accounts[0].id
      )
      const attacker = {
        household: attackerHousehold,
        account: attackerHousehold.accounts[0],
        batch: attackerBatch,
      }

      const request = client[entry.method](entry.url(victim, attacker))
      if (entry.body)
        request.json(typeof entry.body === 'function' ? entry.body(victim) : entry.body)
      const response = await request.actingAs(attackerHousehold.owner)

      response.assertStatus(entry.status ?? 404)
      assert.notInclude(JSON.stringify(response.body()), 'Victim')

      // Nothing of the victim changed.
      await victim.account.refresh()
      assert.equal(victim.account.name, 'Victim account')
      assert.isNotNull(await AccountCard.find(victim.card.id))
      await victim.group.refresh()
      assert.equal(victim.group.slug, 'food')
      await victim.category.refresh()
      assert.equal(victim.category.slug, 'groceries')
      assert.isTrue(victim.category.isSystem)
      const invitation = await Invitation.find(victim.invitation.id)
      assert.equal(invitation?.tokenHash, victim.invitation.tokenHash)
      assert.lengthOf(await AccountCard.query().where('account_id', victim.account.id), 1)
      await victim.transaction.refresh()
      assert.equal(victim.transaction.payee, 'Victim payee')
      assert.equal(victim.transaction.categoryId, victim.category.id)
      assert.deepEqual(victim.transaction.tags, ['Victim trip'])
      await victim.transfer.refresh()
      assert.equal(victim.transfer.memo, 'Victim memo')
      assert.lengthOf(await Transaction.query().where('transfer_id', victim.transfer.id), 2)
      await victim.payslip.refresh()
      assert.equal(victim.payslip.transferId, victim.transfer.id)
      assert.lengthOf(await Transaction.query().where('payslip_id', victim.payslip.id), 1)
      await victim.goal.refresh()
      assert.include(victim.goal.serialize(), { name: 'Victim goal', status: 'active' })
      await victim.insight.refresh()
      assert.equal(victim.insight.headline, 'Victim headline')
      assert.lengthOf(
        await MonthlyInsight.query().where('household_id', attackerHousehold.household.id),
        0
      )
      await victim.batch.refresh()
      assert.equal(victim.batch.status, 'staged')
      await victim.row.refresh()
      assert.equal(victim.row.resolution, 'new')
      assert.isNull(victim.row.decision)
      await victim.rule.refresh()
      assert.equal(victim.rule.pattern, 'VICTIM')
      await victim.recurringItem.refresh()
      assert.include(victim.recurringItem.serialize(), {
        payee: 'Victim lettings',
        status: 'active',
        amountCents: 50_000,
      })
      const { pattern, origin } = victim.systemRule
      await victim.systemRule.refresh()
      assert.include(victim.systemRule.serialize(), { pattern, origin })
      const victimOwner = await HouseholdMember.query()
        .where('household_id', victim.household.household.id)
        .where('user_id', victim.household.owner.id)
        .firstOrFail()
      assert.equal(victimOwner.role, 'owner')
      assert.isTrue(storage.has(victim.receiptKey), 'the photo was neither read nor deleted')
      const device = await PushSubscription.findOrFail(victim.pushDevice.id)
      assert.include(device.serialize(), {
        userId: victim.household.owner.id,
        householdId: victim.household.household.id,
        auth: victim.pushDevice.auth,
      })
      assert.deepEqual(storage.deleted, [])
    })

  test('test_isolation_dataset_covers_every_route_with_an_id', ({ assert }) => {
    const routes = Object.values(router.toJSON()).flat()
    const withParams = routes
      .filter((route) => route.pattern.startsWith('/api/') && route.pattern.includes('/:'))
      .map((route) => route.name!)
      .filter((name) => !NOT_ID_SCOPED.has(name))

    assert.isNotEmpty(withParams)
    const names = new Set(routes.map((route) => route.name))
    for (const name of BODY_SCOPED) assert.isTrue(names.has(name), `${name} is a route`)
    assert.sameMembers(
      [...new Set([...withParams, ...BODY_SCOPED])].sort(),
      [...new Set(cases.map((entry) => entry.route))].sort(),
      'Every route with an :id needs a tenant isolation case (or a reason in NOT_ID_SCOPED)'
    )
  })

  test('test_export_never_includes_another_households_rows', async ({ client, assert }) => {
    const victim = await victimHousehold()
    await db.table('llm_usage').insert({
      household_id: victim.household.household.id,
      purpose: 'classify',
      provider: 'fake',
      model: 'fake',
      status: 'ok',
      created_at: new Date(),
      updated_at: new Date(),
    })
    await HouseholdOwnershipTransfer.create({
      householdId: victim.household.household.id,
      fromUserId: victim.household.owner.id,
      toUserId: victim.household.owner.id,
    })
    const attacker = await createHousehold({ taxonomy: true, accounts: [{ name: 'Mine' }] })
    await TransactionFactory.merge({
      householdId: attacker.household.id,
      accountId: attacker.accounts[0].id,
      payee: 'Mine',
    }).create()

    const json = await client.get('/api/v1/household/export').actingAs(attacker.owner)
    const { response, archive } = await download(
      client.get('/api/v1/household/export?format=csv').actingAs(attacker.owner)
    )

    json.assertStatus(200)
    response.assertStatus(200)
    // Every victim row is named "Victim ..." (or VICTIM): none of them leaks.
    assert.notMatch(json.text(), /victim/i)
    assert.notInclude(json.text(), victim.household.owner.email)
    for (const [file, text] of unzip(archive)) {
      assert.notMatch(text, /victim/i, file)
      assert.notInclude(text, victim.household.owner.email, file)
    }
    const body = json.body()
    assert.deepEqual(
      body.members.map((member: { userId: number }) => member.userId),
      [attacker.owner.id]
    )
    assert.deepEqual(
      body.accounts.map((account: { id: number }) => account.id),
      [attacker.accounts[0].id]
    )
    assert.deepEqual(body.accountCards, [])
    assert.lengthOf(body.transactions, 1)
    for (const table of [
      'transfers',
      'transactionSplits',
      'payslips',
      'payslipLines',
      'importBatches',
      'importRows',
      'savingsGoals',
      'recurringItems',
      'monthlyInsights',
      'llmUsage',
      'ownershipTransfers',
    ]) {
      assert.deepEqual(body[table], [], table)
    }
    assert.isFalse(body.merchantRules.some((rule: { id: number }) => rule.id === victim.rule.id))
  })

  test('test_lists_only_show_the_current_household', async ({ client, assert }) => {
    const victim = await victimHousehold()
    const attacker = await createHousehold({ taxonomy: true, accounts: [{ name: 'Mine' }] })

    const accounts = await client.get('/api/v1/accounts').actingAs(attacker.owner)
    assert.deepEqual(
      accounts.body().data.map((a: any) => a.name),
      ['Mine']
    )

    const categories = await client.get('/api/v1/categories').actingAs(attacker.owner)
    const victimCategories = await Category.query().where(
      'household_id',
      victim.household.household.id
    )
    const victimIds = new Set(victimCategories.map((c) => c.id))
    assert.isTrue(categories.body().data.every((c: any) => !victimIds.has(c.id)))

    const members = await client.get('/api/v1/household/members').actingAs(attacker.owner)
    assert.deepEqual(
      members.body().data.map((m: any) => m.userId),
      [attacker.owner.id]
    )

    const transactions = await client
      .get(`/api/v1/transactions?accountId=${victim.account.id}`)
      .actingAs(attacker.owner)
    assert.deepEqual(transactions.body().data, [])

    const tagged = await client
      .get('/api/v1/transactions')
      .qs({ tag: victim.transaction.tags[0] })
      .actingAs(attacker.owner)
    assert.deepEqual(tagged.body().data, [])
    const tags = await client.get('/api/v1/tags').actingAs(attacker.owner)
    assert.deepEqual(tags.body().data, [])

    const month = await client
      .get(`/api/v1/reports/month?month=${victim.transaction.date.slice(0, 7)}`)
      .actingAs(attacker.owner)
    assert.equal(month.body().data.transactionCount, 0)

    const imports = await client.get('/api/v1/imports').actingAs(attacker.owner)
    assert.deepEqual(imports.body().data, [])
    const rules = await client.get('/api/v1/rules').actingAs(attacker.owner)
    assert.isFalse(rules.body().data.some((rule: any) => rule.id === victim.rule.id))

    const balances = await client.get('/api/v1/reports/balances').actingAs(attacker.owner)
    assert.deepEqual(
      balances.body().data.accounts.map((row: any) => row.accountId),
      [attacker.accounts[0].id]
    )

    const goals = await client.get('/api/v1/goals').actingAs(attacker.owner)
    assert.deepEqual(goals.body().data, [])
    const projected = await client.get('/api/v1/goals?include=projection').actingAs(attacker.owner)
    assert.deepEqual(projected.body().data, [])

    const recurring = await client.get('/api/v1/recurring').actingAs(attacker.owner)
    assert.deepEqual(recurring.body().data, [])
    assert.deepInclude(month.body().data.committed, { recurringCount: 0, items: [] })
    const detected = await client.post('/api/v1/recurring/detect').actingAs(attacker.owner)
    assert.deepEqual(detected.body().data, { created: 0, updated: 0 })
    await victim.recurringItem.refresh()
    assert.equal(victim.recurringItem.status, 'active')
    const payslips = await client.get('/api/v1/payslips').actingAs(attacker.owner)
    assert.deepEqual(payslips.body().data, [])
    const victimPayslips = await client
      .get(`/api/v1/payslips?accountId=${victim.account.id}`)
      .actingAs(attacker.owner)
    assert.deepEqual(victimPayslips.body().data, [])
    const candidates = await client
      .get(`/api/v1/payslips/candidates?accountId=${victim.account.id}`)
      .actingAs(attacker.owner)
    assert.deepEqual(candidates.body().data, [])
  })

  test('test_foreign_ids_in_ledger_bodies_are_rejected_with_422', async ({ client, assert }) => {
    const victim = await victimHousehold()
    const attacker = await createHousehold({ taxonomy: true, accounts: [{}, {}] })
    const ownCategory = await Category.query()
      .where('household_id', attacker.household.id)
      .firstOrFail()
    const own = await TransactionFactory.merge({
      householdId: attacker.household.id,
      accountId: attacker.accounts[0].id,
    }).create()
    const ownTransfer = await TransferFactory.merge({
      householdId: attacker.household.id,
      fromAccountId: attacker.accounts[0].id,
      toAccountId: attacker.accounts[1].id,
    }).create()
    const entry = { kind: 'expense', date: '2026-10-01', amountCents: 100 }
    const payslip = (overrides: Record<string, unknown>) => ({
      accountId: attacker.accounts[0].id,
      date: '2026-10-01',
      grossCents: ownTransfer.amountCents + 100,
      deductions: [{ categoryId: ownCategory.id, amountCents: 100 }],
      transferId: ownTransfer.id,
      ...overrides,
    })

    const requests: Array<[() => any, string]> = [
      [
        () => client.post('/api/v1/transactions').json({ ...entry, accountId: victim.account.id }),
        'accountId',
      ],
      [
        () =>
          client
            .post('/api/v1/transactions')
            .json({ ...entry, accountId: attacker.accounts[0].id, categoryId: victim.category.id }),
        'categoryId',
      ],
      [
        () =>
          client.post('/api/v1/transactions').json({
            ...entry,
            accountId: attacker.accounts[0].id,
            splits: [
              { categoryId: ownCategory.id, amountCents: 50 },
              { categoryId: victim.category.id, amountCents: 50 },
            ],
          }),
        'splits',
      ],
      [
        () =>
          client.post('/api/v1/transactions').json({
            ...entry,
            accountId: attacker.accounts[0].id,
            paidByUserId: victim.household.owner.id,
          }),
        'paidByUserId',
      ],
      [
        () =>
          client.post('/api/v1/transactions/quick').json({
            amountCents: 100,
            accountId: victim.account.id,
          }),
        'accountId',
      ],
      [
        () => client.patch(`/api/v1/transactions/${own.id}`).json({ accountId: victim.account.id }),
        'accountId',
      ],
      [
        () =>
          client
            .post('/api/v1/transactions/bulk-categorize')
            .json({ ids: [own.id, victim.transaction.id], categoryId: ownCategory.id }),
        'ids',
      ],
      [
        () =>
          client
            .post('/api/v1/transactions/bulk-categorize')
            .json({ ids: [own.id], categoryId: victim.category.id }),
        'categoryId',
      ],
      [
        () =>
          client
            .post('/api/v1/transactions/bulk-tags')
            .json({ ids: [own.id, victim.transaction.id], add: ['Hijacked'] }),
        'ids',
      ],
      [
        () =>
          client.post('/api/v1/transfers').json({
            fromAccountId: attacker.accounts[0].id,
            toAccountId: victim.account.id,
            date: '2026-10-01',
            amountCents: 100,
          }),
        'toAccountId',
      ],
      [
        () =>
          client.patch(`/api/v1/transactions/${own.id}`).json({ categoryId: victim.category.id }),
        'categoryId',
      ],
      [
        () =>
          client
            .patch(`/api/v1/transactions/${own.id}`)
            .json({ paidByUserId: victim.household.owner.id }),
        'paidByUserId',
      ],
      [
        () =>
          client.put(`/api/v1/transactions/${own.id}/splits`).json({
            splits: [
              { categoryId: ownCategory.id, amountCents: Math.abs(own.amountCents) - 1 },
              { categoryId: victim.category.id, amountCents: 1 },
            ],
          }),
        'splits',
      ],
      [
        () =>
          client
            .patch(`/api/v1/transfers/${ownTransfer.id}`)
            .json({ fromAccountId: victim.account.id }),
        'fromAccountId',
      ],
      [
        () =>
          client
            .patch(`/api/v1/transfers/${ownTransfer.id}`)
            .json({ toAccountId: victim.account.id }),
        'toAccountId',
      ],
      [
        () => client.post('/api/v1/payslips').json(payslip({ accountId: victim.account.id })),
        'accountId',
      ],
      [
        () => client.post('/api/v1/payslips').json(payslip({ transferId: victim.transfer.id })),
        'transferId',
      ],
      [
        () =>
          client
            .post('/api/v1/payslips')
            .json(payslip({ transferId: undefined, toAccountId: victim.account.id })),
        'toAccountId',
      ],
      [
        () =>
          client
            .post('/api/v1/payslips')
            .json(payslip({ deductions: [{ categoryId: victim.category.id, amountCents: 100 }] })),
        'deductions',
      ],
      [
        () => client.post('/api/v1/payslips').json(payslip({ userId: victim.household.owner.id })),
        'userId',
      ],
    ]

    for (const [request, field] of requests) {
      const response = await request().actingAs(attacker.owner)
      response.assertStatus(422)
      response.assertBodyContains({ errors: [{ field, rule: 'database.exists' }] })
    }

    await victim.transaction.refresh()
    assert.equal(victim.transaction.categoryId, victim.category.id)
    assert.deepEqual(victim.transaction.tags, ['Victim trip'])
    // The victim's movement, its transfer leg and its payslip's gross row.
    assert.lengthOf(await Transaction.query().where('account_id', victim.account.id), 3)
    assert.lengthOf(await Payslip.query().where('household_id', attacker.household.id), 0)
  })

  test('test_foreign_ids_in_a_body_are_rejected_with_422', async ({ client }) => {
    const victim = await victimHousehold()
    const attacker = await createHousehold({ taxonomy: true, accounts: [{ name: 'Mine' }] })

    const reorder = await client
      .put('/api/v1/accounts/reorder')
      .json({ ids: [attacker.accounts[0].id, victim.account.id] })
      .actingAs(attacker.owner)
    reorder.assertStatus(422)

    const card = await client
      .post(`/api/v1/accounts/${attacker.accounts[0].id}/cards`)
      .json({ cardSuffix: '1234', userId: victim.household.owner.id })
      .actingAs(attacker.owner)
    card.assertStatus(422)
    card.assertBodyContains({ errors: [{ field: 'userId', rule: 'database.exists' }] })

    const ownCategory = await Category.query()
      .where('household_id', attacker.household.id)
      .firstOrFail()
    const move = await client
      .patch(`/api/v1/categories/${ownCategory.id}`)
      .json({ categoryGroupId: victim.group.id })
      .actingAs(attacker.owner)
    move.assertStatus(422)
    move.assertBodyContains({ errors: [{ field: 'categoryGroupId', rule: 'database.exists' }] })

    const goal = await client
      .post('/api/v1/goals')
      .json({ name: 'Mine', targetCents: 1_000, accountId: victim.account.id })
      .actingAs(attacker.owner)
    goal.assertStatus(422)
    goal.assertBodyContains({ errors: [{ field: 'accountId', rule: 'database.exists' }] })

    const goals = await client
      .put('/api/v1/goals/reorder')
      .json({ ids: [victim.goal.id] })
      .actingAs(attacker.owner)
    goals.assertStatus(422)
  })
})
