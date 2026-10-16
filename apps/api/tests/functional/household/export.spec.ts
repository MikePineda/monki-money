import { DateTime } from 'luxon'
import { test } from '@japa/runner'
import { parse } from 'csv-parse/sync'
import Payslip from '#models/payslip'
import Transaction from '#models/transaction'
import ImportRow from '#models/import_row'
import db from '@adonisjs/lucid/services/db'
import ImportBatch from '#models/import_batch'
import SavingsGoal from '#models/savings_goal'
import AccountCard from '#models/account_card'
import MerchantRule from '#models/merchant_rule'
import RecurringItem from '#models/recurring_item'
import MonthlyInsight from '#models/monthly_insight'
import limiter from '@adonisjs/limiter/services/main'
import { categoryBySlug } from '#tests/helpers/ledger'
import { csvLines, download, unzip } from '#tests/helpers/zip'
import { createHousehold, type TestHousehold } from '#tests/helpers/household'
import HouseholdOwnershipTransfer from '#models/household_ownership_transfer'
import { TransactionFactory, TransferFactory } from '#database/factories/transaction_factory'

/** JSON key of every table in the export, with its file in the CSV zip. */
const TABLES = {
  members: 'members.csv',
  accounts: 'accounts.csv',
  accountCards: 'account_cards.csv',
  categoryGroups: 'category_groups.csv',
  categories: 'categories.csv',
  transfers: 'transfers.csv',
  transactions: 'transactions.csv',
  transactionSplits: 'transaction_splits.csv',
  payslips: 'payslips.csv',
  payslipLines: 'payslip_lines.csv',
  merchantRules: 'merchant_rules.csv',
  importBatches: 'import_batches.csv',
  importRows: 'import_rows.csv',
  savingsGoals: 'savings_goals.csv',
  recurringItems: 'recurring_items.csv',
  monthlyInsights: 'monthly_insights.csv',
  llmUsage: 'llm_usage.csv',
  ownershipTransfers: 'ownership_transfers.csv',
} as const

type TableName = keyof typeof TABLES

/** Rows of `table` that belong to the household, counted straight from the database. */
async function countIn(table: string, householdId: number, where = (query: any) => query) {
  const row = await where(db.from(table).where(`${table}.household_id`, householdId))
    .count('* as count')
    .first()
  return Number(row.count)
}

/** One row in every table of the export (several in most), plus the bank's raw text. */
async function everything(fixture: TestHousehold) {
  const { household, owner, member } = fixture
  const [everyday, savings, wallet] = fixture.accounts
  await AccountCard.createMany([
    { accountId: everyday.id, cardSuffix: '1111', userId: owner.id, label: 'Visa' },
    { accountId: everyday.id, cardSuffix: '2222', userId: member.id },
  ])
  const groceries = await categoryBySlug(household.id, 'groceries')
  const salary = await categoryBySlug(household.id, 'salary')

  const split = await TransactionFactory.merge({
    householdId: household.id,
    accountId: everyday.id,
    date: '2026-09-20',
    amountCents: -1_000,
    tags: ['weekly', 'Bali 2027'],
  })
    .apply('split')
    .create()
  const plain = await TransactionFactory.merge({
    householdId: household.id,
    accountId: everyday.id,
    date: '2026-09-21',
    amountCents: -2_500,
    categoryId: groceries.id,
    payee: 'Corner shop',
  }).create()
  await TransferFactory.merge({
    householdId: household.id,
    fromAccountId: everyday.id,
    toAccountId: savings.id,
    date: '2026-09-22',
  }).create()

  // A payout: gross income and one deduction in the wallet, net to the bank.
  const payout = await TransferFactory.merge({
    householdId: household.id,
    fromAccountId: wallet.id,
    toAccountId: everyday.id,
    date: '2026-09-25',
    amountCents: 8_000,
  }).create()
  const payslip = await Payslip.create({
    householdId: household.id,
    accountId: wallet.id,
    userId: owner.id,
    date: '2026-09-25',
    grossCents: 10_000,
    netCents: 8_000,
    transferId: payout.id,
    memo: 'September pay',
  })
  await TransactionFactory.apply('income')
    .merge({
      householdId: household.id,
      accountId: wallet.id,
      date: '2026-09-25',
      amountCents: 10_000,
      categoryId: salary.id,
      payslipId: payslip.id,
      payee: null,
    })
    .create()
  await TransactionFactory.merge({
    householdId: household.id,
    accountId: wallet.id,
    date: '2026-09-25',
    amountCents: -2_000,
    payslipId: payslip.id,
    description: 'Tax withheld',
    payee: null,
  }).create()

  await MerchantRule.create({
    householdId: household.id,
    matchType: 'contains',
    pattern: 'CORNER SHOP',
    categoryId: groceries.id,
    origin: 'user',
  })

  const batch = await ImportBatch.create({
    householdId: household.id,
    accountId: everyday.id,
    source: 'nab_csv',
    status: 'completed',
    fileHash: 'c'.repeat(64),
    fileName: 'september.csv',
    filePath: 'imports/secret-object-key.csv',
    rowCount: 2,
    newCount: 1,
    duplicateCount: 1,
  })
  await ImportRow.createMany(
    [0, 1].map((rowIndex) => ({
      importBatchId: batch.id,
      householdId: household.id,
      accountId: everyday.id,
      rowIndex,
      externalHash: `${rowIndex}`.repeat(64),
      raw: { Description: 'RAW BANK CELL' },
      bankDate: '2026-09-21',
      date: '2026-09-21',
      amountCents: -2_500,
      descriptionRaw: 'RAW BANK CELL',
      descriptionNormalized: 'RAW BANK CELL',
      resolution: rowIndex === 0 ? ('new' as const) : ('duplicate' as const),
      proposedResolution: rowIndex === 0 ? ('new' as const) : ('duplicate' as const),
      transactionId: rowIndex === 0 ? plain.id : null,
      confirmedAt: DateTime.fromISO('2026-09-22T10:00:00Z'),
      reasons: [],
    }))
  )

  await SavingsGoal.createMany([
    { householdId: household.id, name: 'Bali', targetCents: 300_000, accountId: savings.id },
    {
      householdId: household.id,
      name: 'Emergency fund',
      targetCents: 100_000,
      status: 'reached',
      reachedAt: DateTime.fromISO('2026-09-30T08:00:00Z'),
      sortOrder: 1,
    },
  ])

  await RecurringItem.createMany([
    {
      householdId: household.id,
      merchantKey: 'CORNER SHOP',
      payee: 'Corner shop',
      categoryId: groceries.id,
      accountId: everyday.id,
      cadence: 'weekly',
      amountCents: 2_500,
      lastPaidDate: '2026-09-21',
      nextExpectedDate: '2026-09-28',
      occurrences: 4,
    },
    {
      householdId: household.id,
      merchantKey: 'GYM',
      payee: 'Gym',
      cadence: 'monthly',
      amountCents: 6_000,
      nextExpectedDate: '2026-10-05',
      status: 'paused',
      source: 'manual',
      editedFields: ['amountCents', 'cadence'],
    },
  ])

  await MonthlyInsight.create({
    householdId: household.id,
    month: '2026-09',
    locale: 'en',
    headline: 'A calm September',
    bodyMarkdown: '## September\n\nGroceries were **steady**.',
    highlights: [{ tone: 'positive', text: 'Spent less on takeaway' }],
    inputJson: {
      month: '2026-09',
      currencyCode: 'AUD',
      totals: { incomeCents: 0, expenseCents: 0, netCents: 0 },
      byCategory: [],
    },
    model: 'fake',
    generatedAt: DateTime.fromISO('2026-10-01T08:00:00Z'),
  })

  const usage = (createdAt: string, purpose: string, status: string, tokens: number) => ({
    household_id: household.id,
    user_id: owner.id,
    purpose,
    provider: 'fake',
    model: 'fake',
    input_tokens: tokens,
    output_tokens: tokens / 10,
    latency_ms: 100,
    status,
    cost_micros: tokens * 2,
    created_at: createdAt,
    updated_at: createdAt,
  })
  await db
    .table('llm_usage')
    .multiInsert([
      usage('2026-09-10T02:00:00Z', 'classify', 'ok', 1_000),
      usage('2026-09-12T02:00:00Z', 'classify', 'error', 500),
      usage('2026-09-12T03:00:00Z', 'insight', 'ok', 4_000),
      usage('2026-10-01T02:00:00Z', 'receipt', 'ok', 2_000),
    ])

  await HouseholdOwnershipTransfer.create({
    householdId: household.id,
    fromUserId: member.id,
    toUserId: owner.id,
  })

  return { split, plain, payslip, batch }
}

async function seeded() {
  const fixture = await createHousehold({
    users: 2,
    taxonomy: true,
    accounts: [
      {
        name: 'Everyday',
        externalAccountNumber: '000111222',
        openingBalanceCents: 12_345,
        openingBalanceDate: '2026-08-31',
      },
      { name: 'Savings', kind: 'savings' },
      { name: 'Wallet', kind: 'wallet', owner: 0 },
    ],
  })
  return { ...fixture, ...(await everything(fixture)) }
}

/** Expected number of rows of each table for the household, from the database. */
async function expectedCounts(householdId: number): Promise<Record<TableName, number>> {
  const months = await db
    .from('llm_usage')
    .where('household_id', householdId)
    .countDistinct({ count: db.raw(`(date_trunc('month', created_at), purpose)`) })
    .first()
  const cards = await db
    .from('account_cards')
    .join('accounts', 'accounts.id', 'account_cards.account_id')
    .where('accounts.household_id', householdId)
    .count('* as count')
    .first()

  return {
    members: await countIn('household_members', householdId),
    accounts: await countIn('accounts', householdId),
    accountCards: Number(cards.count),
    categoryGroups: await countIn('category_groups', householdId),
    categories: await countIn('categories', householdId),
    transfers: await countIn('transfers', householdId),
    transactions: await countIn('transactions', householdId),
    transactionSplits: await countIn('transaction_splits', householdId),
    payslips: await countIn('payslips', householdId),
    payslipLines: await countIn('transactions', householdId, (query) =>
      query.whereNotNull('payslip_id')
    ),
    merchantRules: await countIn('merchant_rules', householdId),
    importBatches: await countIn('import_batches', householdId),
    importRows: await countIn('import_rows', householdId),
    savingsGoals: await countIn('savings_goals', householdId),
    recurringItems: await countIn('recurring_items', householdId),
    monthlyInsights: await countIn('monthly_insights', householdId),
    llmUsage: Number(months.count),
    ownershipTransfers: await countIn('household_ownership_transfers', householdId),
  }
}

test.group('Household / export', (group) => {
  group.each.setup(() => limiter.clear())

  test('test_json_export_has_every_table_with_the_households_row_counts', async ({
    client,
    assert,
  }) => {
    const fixture = await seeded()
    // Another household's rows never count (nor appear).
    const other = await seeded()

    const response = await client.get('/api/v1/household/export').actingAs(fixture.owner)

    response.assertStatus(200)
    assert.include(response.header('content-type'), 'application/json')
    assert.include(response.header('content-disposition'), 'attachment')
    assert.equal(response.header('cache-control'), 'no-store')
    const body = response.body()
    assert.include(body, { format: 'monkimoney-export', version: 2 })
    assert.equal(body.household.id, fixture.household.id)
    assert.sameMembers(Object.keys(body), [
      'format',
      'version',
      'exportedAt',
      'household',
      ...Object.keys(TABLES),
    ])
    const expected = await expectedCounts(fixture.household.id)
    for (const name of Object.keys(TABLES) as TableName[]) {
      assert.isAbove(expected[name], 0, `${name} is seeded`)
      assert.lengthOf(body[name], expected[name], name)
    }
    assert.equal(expected.llmUsage, 3)
    const foreignIds = new Set(other.accounts.map((account) => account.id))
    assert.isFalse(body.accounts.some((account: { id: number }) => foreignIds.has(account.id)))
    assert.notInclude(JSON.stringify(body), '"password"')
  })

  test('test_json_export_carries_the_details_of_each_table', async ({ client, assert }) => {
    const { owner, household, accounts, split, payslip, batch } = await seeded()

    const response = await client.get('/api/v1/household/export').actingAs(owner)
    const body = response.body()

    const everyday = body.accounts.find((row: { id: number }) => row.id === accounts[0].id)
    assert.include(everyday, {
      name: 'Everyday',
      externalAccountNumber: '000111222',
      openingBalanceCents: 12_345,
      openingBalanceDate: '2026-08-31',
      ownerUserId: null,
    })
    assert.sameDeepMembers(
      body.accountCards.map((card: any) => ({ suffix: card.cardSuffix, account: card.accountId })),
      [
        { suffix: '1111', account: accounts[0].id },
        { suffix: '2222', account: accounts[0].id },
      ]
    )
    const exported = body.transactions.find((row: { id: number }) => row.id === split.id)
    assert.include(exported, { amountCents: -1_000, isSplit: true, isMasked: false })
    assert.deepEqual(exported.tags, ['weekly', 'Bali 2027'])
    assert.lengthOf(
      body.transactionSplits.filter((line: any) => line.transactionId === split.id),
      2
    )
    assert.sameMembers(
      body.transactions
        .filter((row: any) => row.payslipId === payslip.id)
        .map((row: any) => row.amountCents),
      [10_000, -2_000]
    )
    assert.include(body.payslips[0], {
      id: payslip.id,
      grossCents: 10_000,
      netCents: 8_000,
      deductionsCents: 2_000,
      memo: 'September pay',
    })
    assert.sameDeepMembers(
      body.payslipLines.map((line: any) => ({ kind: line.kind, amount: line.amountCents })),
      [
        { kind: 'income', amount: 10_000 },
        { kind: 'expense', amount: -2_000 },
      ]
    )
    assert.include(body.importBatches[0], {
      id: batch.id,
      fileName: 'september.csv',
      archived: true,
      status: 'completed',
    })
    assert.sameMembers(
      body.importRows.map((row: any) => row.resolution),
      ['new', 'duplicate']
    )
    assert.sameMembers(
      body.importRows.map((row: any) => row.proposedResolution),
      ['new', 'duplicate']
    )
    // Rows' resolutions, never the bank file itself (nor where it is stored).
    assert.notInclude(JSON.stringify(body), 'RAW BANK CELL')
    assert.notInclude(JSON.stringify(body), 'secret-object-key')
    const gym = body.recurringItems.find((item: any) => item.payee === 'Gym')
    assert.include(gym, {
      cadence: 'monthly',
      amountCents: 6_000,
      status: 'paused',
      source: 'manual',
      nextExpectedDate: '2026-10-05',
    })
    assert.deepEqual(gym.editedFields, ['amountCents', 'cadence'])
    const reached = body.savingsGoals.find((goal: any) => goal.name === 'Emergency fund')
    assert.include(reached, { status: 'reached', reachedAt: '2026-09-30T08:00:00.000Z' })
    assert.include(body.monthlyInsights[0], {
      month: '2026-09',
      headline: 'A calm September',
      bodyMarkdown: '## September\n\nGroceries were **steady**.',
    })
    assert.deepEqual(body.monthlyInsights[0].highlights, [
      { tone: 'positive', text: 'Spent less on takeaway' },
    ])
    // Totals per month (household time) and purpose.
    assert.deepEqual(body.llmUsage, [
      {
        month: '2026-09',
        purpose: 'classify',
        calls: 2,
        failedCalls: 1,
        inputTokens: 1_500,
        outputTokens: 150,
        costMicros: 3_000,
      },
      {
        month: '2026-09',
        purpose: 'insight',
        calls: 1,
        failedCalls: 0,
        inputTokens: 4_000,
        outputTokens: 400,
        costMicros: 8_000,
      },
      {
        month: '2026-10',
        purpose: 'receipt',
        calls: 1,
        failedCalls: 0,
        inputTokens: 2_000,
        outputTokens: 200,
        costMicros: 4_000,
      },
    ])
    assert.include(body.ownershipTransfers[0], { toUserId: owner.id })
    assert.equal(body.household.timezone, household.timezone)
  })

  test('test_csv_export_is_a_zip_with_one_csv_per_table_and_the_ledger', async ({
    client,
    assert,
  }) => {
    const { owner, household } = await seeded()
    await seeded()

    const exported = await client.get('/api/v1/household/export').actingAs(owner)
    const json = exported.body()
    const { response, archive } = await download(
      client.get('/api/v1/household/export?format=csv').actingAs(owner)
    )

    response.assertStatus(200)
    assert.include(response.header('content-type'), 'application/zip')
    assert.match(
      response.header('content-disposition') ?? '',
      /^attachment; filename="monkimoney-export-\d{4}-\d{2}-\d{2}\.zip"$/
    )
    const files = unzip(archive)
    assert.sameMembers([...files.keys()], ['ledger.csv', 'household.csv', ...Object.values(TABLES)])
    for (const [name, file] of Object.entries(TABLES)) {
      const text = files.get(file)!
      assert.isTrue(text.startsWith('\uFEFF'), `${file} starts with a BOM`)
      const records: string[][] = parse(text.replace(/^\uFEFF/, ''), { relax_quotes: false })
      // Same columns as the JSON rows, one record per row.
      assert.deepEqual(records[0], Object.keys(json[name][0]), `${file} header`)
      assert.lengthOf(records.slice(1), json[name].length, file)
    }
    const householdCsv: string[][] = parse(files.get('household.csv')!.replace(/^\uFEFF/, ''))
    assert.lengthOf(householdCsv, 2)
    assert.equal(householdCsv[1][householdCsv[0].indexOf('id')], String(household.id))
    // Multi-line text survives as one quoted cell.
    const insights: string[][] = parse(files.get('monthly_insights.csv')!.replace(/^\uFEFF/, ''))
    assert.equal(
      insights[1][insights[0].indexOf('bodyMarkdown')],
      '## September\n\nGroceries were **steady**.'
    )
    // The readable ledger: one row per posting, split lines expanded.
    const ledger = csvLines(files.get('ledger.csv')!)
    assert.isTrue(ledger[0].startsWith('Date,Bank date,Account,Type,Amount'))
    assert.lengthOf(ledger.slice(1), json.transactions.length + 1)
    assert.notInclude([...files.values()].join(''), 'RAW BANK CELL')
  })

  test('test_export_csv_escapes_formula_cells', async ({ client, assert }) => {
    const { owner, household, accounts } = await createHousehold({
      taxonomy: true,
      accounts: [{ name: '=cmd|calc' }],
    })
    const groceries = await categoryBySlug(household.id, 'groceries')
    await TransactionFactory.merge({
      householdId: household.id,
      accountId: accounts[0].id,
      date: '2026-10-02',
      amountCents: -1_234,
      categoryId: groceries.id,
      payee: '=HYPERLINK("http://evil.test","Click")',
      description: '@SUM(1,2)',
      tags: ['+tag', '-5'],
    }).create()
    await MerchantRule.create({
      householdId: household.id,
      matchType: 'contains',
      pattern: '-2+3',
      categoryId: groceries.id,
      origin: 'user',
    })
    await SavingsGoal.create({ householdId: household.id, name: '@goal', targetCents: 100 })

    const { response, archive } = await download(
      client.get('/api/v1/household/export?format=csv').actingAs(owner)
    )

    response.assertStatus(200)
    const files = unzip(archive)
    const ledger = csvLines(files.get('ledger.csv')!)
    assert.lengthOf(ledger, 2)
    const row = ledger[1]
    assert.include(row, `'=cmd|calc`)
    assert.include(row, `"'=HYPERLINK(""http://evil.test"",""Click"")"`)
    assert.include(row, `"'@SUM(1,2)"`)
    assert.include(row, `'+tag; -5`)
    // Amounts stay numbers; system categories are named in the reader's locale.
    assert.include(row, ',-12.34,AUD,Groceries,Food,')
    assert.notInclude(row, `'-12.34`)

    // The same escape on every text cell of every table.
    assert.include(files.get('accounts.csv'), `,'=cmd|calc,`)
    const transactions = files.get('transactions.csv')!
    assert.include(transactions, `"'=HYPERLINK(""http://evil.test"",""Click"")"`)
    assert.include(transactions, `"'@SUM(1,2)"`)
    assert.include(transactions, `,'+tag; -5,`)
    assert.include(transactions, ',-1234,')
    assert.include(files.get('merchant_rules.csv'), `,'-2+3,`)
    assert.include(files.get('savings_goals.csv'), `,'@goal,`)
    for (const [file, text] of files) {
      for (const line of csvLines(text).slice(1)) {
        assert.notMatch(line, /(^|,)[=+@]/, `${file}: ${line}`)
      }
    }
  })

  test('test_export_masks_the_partners_private_transactions', async ({ client, assert }) => {
    const { owner, member, household, accounts } = await createHousehold({
      users: 2,
      taxonomy: true,
      accounts: [{ name: 'Joint' }],
    })
    await TransactionFactory.merge({
      householdId: household.id,
      accountId: accounts[0].id,
      amountCents: -50_000,
      payee: 'Secret jeweller',
      tags: ['anniversary'],
      paidByUserId: member.id,
      createdByUserId: member.id,
    })
      .apply('private', 'split')
      .create()

    const json = await client.get('/api/v1/household/export').actingAs(owner)
    const { archive } = await download(
      client.get('/api/v1/household/export?format=csv').actingAs(owner)
    )

    assert.include(json.body().transactions[0], {
      amountCents: -50_000,
      payee: null,
      categoryId: null,
      isSplit: false,
      isPrivate: true,
      isMasked: true,
    })
    assert.deepEqual(json.body().transactions[0].tags, [])
    // The split lines would tell what the surprise was.
    assert.lengthOf(json.body().transactionSplits, 0)
    assert.notInclude(json.text(), 'Secret jeweller')
    assert.notInclude(json.text(), 'anniversary')
    const files = unzip(archive)
    const allFiles = [...files.values()].join('')
    assert.notInclude(allFiles, 'Secret jeweller')
    assert.notInclude(allFiles, 'anniversary')
    assert.include(files.get('ledger.csv'), ',-500.00,AUD,Private,')
    assert.lengthOf(csvLines(files.get('transaction_splits.csv')!), 1)
  })

  test('test_export_masks_a_partners_private_payslip_wherever_its_memo_was_copied', async ({
    client,
    assert,
  }) => {
    const { owner, member, household, accounts } = await createHousehold({
      users: 2,
      taxonomy: true,
      accounts: [{ name: 'Everyday' }, { name: 'Payroll wallet', kind: 'wallet', owner: 1 }],
    })
    const [everyday, wallet] = accounts
    const tax = await categoryBySlug(household.id, 'taxes')
    // The partner records a payout: its memo lands on the payslip, the gross
    // line, the new transfer and both of its legs.
    const recorded = await client
      .post('/api/v1/payslips')
      .json({
        accountId: wallet.id,
        date: '2026-10-10',
        grossCents: 10_000,
        deductions: [{ categoryId: tax.id, amountCents: 2_000, memo: 'PAYG' }],
        toAccountId: everyday.id,
        memo: 'Secret bonus',
      })
      .actingAs(member)
    recorded.assertStatus(201)
    const payslip = recorded.body().data
    // ...and then makes the gross line private.
    await Transaction.query()
      .where('payslip_id', payslip.id)
      .where('kind', 'income')
      .update({ is_private: true })

    const json = await client.get('/api/v1/household/export').actingAs(owner)
    const { archive } = await download(
      client.get('/api/v1/household/export?format=csv').actingAs(owner)
    )

    const body = json.body()
    assert.include(body.payslips[0], { id: payslip.id, grossCents: 10_000, memo: null })
    const gross = body.payslipLines.find((line: any) => line.kind === 'income')
    assert.include(gross, { amountCents: 10_000, categoryId: null, memo: null, isMasked: true })
    // The deduction is not private: it keeps its category and memo.
    const deduction = body.payslipLines.find((line: any) => line.kind === 'expense')
    assert.include(deduction, { categoryId: tax.id, memo: 'PAYG', isMasked: false })
    assert.include(body.transfers[0], { id: payslip.transferId, memo: null, amountCents: 8_000 })
    const legs = body.transactions.filter((row: any) => row.transferId === payslip.transferId)
    assert.lengthOf(legs, 2)
    for (const leg of legs) assert.isNull(leg.description)
    assert.notInclude(json.text(), 'Secret bonus')
    for (const [file, text] of unzip(archive)) assert.notInclude(text, 'Secret bonus', file)
  })

  test('test_export_masks_import_decisions_linked_to_the_partners_private_rows', async ({
    client,
    assert,
  }) => {
    const { owner, member, household, accounts } = await createHousehold({
      users: 2,
      taxonomy: true,
      accounts: [{ name: 'Joint' }],
    })
    const groceries = await categoryBySlug(household.id, 'groceries')
    const secret = await TransactionFactory.merge({
      householdId: household.id,
      accountId: accounts[0].id,
      amountCents: -50_000,
      paidByUserId: member.id,
      createdByUserId: member.id,
    })
      .apply('private')
      .create()
    const ordinary = await TransactionFactory.merge({
      householdId: household.id,
      accountId: accounts[0].id,
      amountCents: -1_500,
    }).create()
    const batch = await ImportBatch.create({
      householdId: household.id,
      accountId: accounts[0].id,
      source: 'nab_csv',
      status: 'completed',
      fileHash: 'e'.repeat(64),
    })
    const row = (rowIndex: number, linked: { id: number; amountCents: number }, payee: string) =>
      ImportRow.create({
        importBatchId: batch.id,
        householdId: household.id,
        accountId: accounts[0].id,
        rowIndex,
        externalHash: `${rowIndex}`.repeat(64),
        raw: {},
        bankDate: '2026-10-01',
        date: '2026-10-01',
        amountCents: linked.amountCents,
        descriptionRaw: 'CARD PURCHASE',
        descriptionNormalized: 'CARD PURCHASE',
        resolution: 'new',
        reasons: [],
        transactionId: linked.id,
        decision: { categoryId: groceries.id, payee },
        decidedAt: DateTime.now(),
        confirmedAt: DateTime.now(),
      })
    const hidden = await row(0, secret, 'Secret jeweller')
    const visible = await row(1, ordinary, 'Corner shop')

    const json = await client.get('/api/v1/household/export').actingAs(owner)
    const { archive } = await download(
      client.get('/api/v1/household/export?format=csv').actingAs(owner)
    )

    const rows = json.body().importRows
    assert.include(
      rows.find((item: any) => item.id === hidden.id),
      { transactionId: secret.id, resolution: 'new', decision: null }
    )
    assert.deepEqual(rows.find((item: any) => item.id === visible.id).decision, {
      categoryId: groceries.id,
      payee: 'Corner shop',
    })
    assert.notInclude(json.text(), 'Secret jeweller')
    assert.notInclude(unzip(archive).get('import_rows.csv'), 'Secret jeweller')
    assert.include(unzip(archive).get('import_rows.csv'), 'Corner shop')
  })

  test('test_export_keeps_the_owners_own_private_rows_in_full', async ({ client, assert }) => {
    const { owner, household, accounts } = await createHousehold({
      users: 2,
      taxonomy: true,
      accounts: [{ name: 'Joint' }],
    })
    const mine = await TransactionFactory.merge({
      householdId: household.id,
      accountId: accounts[0].id,
      amountCents: -20_000,
      payee: 'Anniversary dinner',
      tags: ['surprise'],
      paidByUserId: owner.id,
      createdByUserId: owner.id,
    })
      .apply('private', 'split')
      .create()

    const json = await client.get('/api/v1/household/export').actingAs(owner)
    const { archive } = await download(
      client.get('/api/v1/household/export?format=csv').actingAs(owner)
    )

    const body = json.body()
    assert.include(body.transactions[0], {
      id: mine.id,
      payee: 'Anniversary dinner',
      isSplit: true,
      isPrivate: true,
      isMasked: false,
    })
    assert.deepEqual(body.transactions[0].tags, ['surprise'])
    assert.lengthOf(body.transactionSplits, 2)
    const files = unzip(archive)
    const ledger = csvLines(files.get('ledger.csv')!).slice(1)
    assert.lengthOf(ledger, 2)
    for (const line of ledger) {
      assert.include(line, 'Anniversary dinner')
      // Its lines keep their categories instead of the "Private" bucket.
      assert.notInclude(line, 'AUD,Private,')
    }
    assert.lengthOf(csvLines(files.get('transaction_splits.csv')!), 3)
  })

  test('test_a_member_cannot_export', async ({ client }) => {
    const { member } = await createHousehold({ users: 2 })

    const json = await client.get('/api/v1/household/export').actingAs(member)
    const csv = await client.get('/api/v1/household/export?format=csv').actingAs(member)

    json.assertStatus(403)
    csv.assertStatus(403)
  })

  test('test_export_rejects_an_unknown_format', async ({ client }) => {
    const { owner } = await createHousehold()

    const response = await client.get('/api/v1/household/export?format=xlsx').actingAs(owner)

    response.assertStatus(422)
  })
})
