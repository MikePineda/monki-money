import { test } from '@japa/runner'
import Payslip from '#models/payslip'
import drive from '@adonisjs/drive/services/main'
import { nabFixture } from '#tests/helpers/importing'
import { freezeClock } from '#tests/helpers/ledger'
import { nabHousehold, uploadCsv } from '#tests/helpers/imports'
import Transfer from '#models/transfer'
import Transaction from '#models/transaction'
import { createHousehold } from '#tests/helpers/household'
import { categoryBySlug } from '#tests/helpers/ledger'
import { TransferFactory } from '#database/factories/transaction_factory'

/**
 * A household with a wallet of the first person (the umbrella service the
 * freelance income arrives through), a joint bank account and a payout
 * already imported from the bank: 3,700.00 left the wallet for the bank.
 */
async function walletWithPayout() {
  const fixture = await createHousehold({
    users: 2,
    taxonomy: true,
    accounts: [
      { name: 'Payroll wallet', kind: 'wallet', owner: 0 },
      { name: 'Everyday', kind: 'transaction' },
    ],
  })
  const [wallet, bank] = fixture.accounts
  const payout = await TransferFactory.merge({
    householdId: fixture.household.id,
    fromAccountId: wallet.id,
    toAccountId: bank.id,
    date: '2026-08-31',
    amountCents: 370_000,
  }).create()
  const salary = await categoryBySlug(fixture.household.id, 'salary')
  const taxes = await categoryBySlug(fixture.household.id, 'taxes')
  const fees = await categoryBySlug(fixture.household.id, 'bank-fees')
  return { ...fixture, wallet, bank, payout, salary, taxes, fees }
}

type Fixture = Awaited<ReturnType<typeof walletWithPayout>>

/** Gross 5,000.00 minus 1,250.00 tax and 50.00 fee: the 3,700.00 payout. */
function payslipBody(fixture: Fixture, overrides: Record<string, unknown> = {}) {
  return {
    accountId: fixture.wallet.id,
    date: '2026-08-31',
    grossCents: 500_000,
    deductions: [
      { categoryId: fixture.taxes.id, amountCents: 125_000 },
      { categoryId: fixture.fees.id, amountCents: 5_000, memo: 'Service fee' },
    ],
    transferId: fixture.payout.id,
    ...overrides,
  }
}

function linesOf(payslipId: number) {
  return Transaction.query().where('payslip_id', payslipId).orderBy('id')
}

test.group('Payslips: create', () => {
  test('test_payslip_records_the_gross_and_its_deductions_and_links_the_transfer', async ({
    client,
    assert,
  }) => {
    const fixture = await walletWithPayout()

    const response = await client
      .post('/api/v1/payslips')
      .json({ ...payslipBody(fixture), memo: 'August invoice' })
      .actingAs(fixture.owner)

    response.assertStatus(201)
    const payslip = response.body().data
    assert.include(payslip, {
      accountId: fixture.wallet.id,
      userId: fixture.owner.id,
      date: '2026-08-31',
      grossCents: 500_000,
      netCents: 370_000,
      deductionsCents: 130_000,
      transferId: fixture.payout.id,
      memo: 'August invoice',
    })
    assert.deepEqual(payslip.transfer, {
      id: fixture.payout.id,
      date: '2026-08-31',
      amountCents: 370_000,
      fromAccountId: fixture.wallet.id,
      toAccountId: fixture.bank.id,
    })
    assert.deepEqual(
      payslip.lines.map((line: any) => [line.kind, line.categoryId, line.amountCents, line.memo]),
      [
        ['income', fixture.salary.id, 500_000, 'August invoice'],
        ['expense', fixture.taxes.id, -125_000, null],
        ['expense', fixture.fees.id, -5_000, 'Service fee'],
      ]
    )

    const rows = await linesOf(payslip.id)
    assert.lengthOf(rows, 3)
    assert.isTrue(
      rows.every(
        (row) =>
          row.accountId === fixture.wallet.id &&
          row.date === '2026-08-31' &&
          row.paidByUserId === fixture.owner.id &&
          row.householdId === fixture.household.id &&
          row.transferId === null &&
          row.status === 'cleared'
      )
    )
    // The bank transfer is untouched: still its two legs, nothing else.
    assert.lengthOf(await Transaction.query().where('transfer_id', fixture.payout.id), 2)
  })

  test('test_payslip_person_defaults_to_the_account_owner_and_null_means_joint', async ({
    client,
    assert,
  }) => {
    const fixture = await walletWithPayout()
    const second = await TransferFactory.merge({
      householdId: fixture.household.id,
      fromAccountId: fixture.wallet.id,
      toAccountId: fixture.bank.id,
      date: '2026-09-30',
      amountCents: 370_000,
    }).create()

    const byDefault = await client
      .post('/api/v1/payslips')
      .json(payslipBody(fixture))
      .actingAs(fixture.member)
    const joint = await client
      .post('/api/v1/payslips')
      .json(payslipBody(fixture, { transferId: second.id, userId: null }))
      .actingAs(fixture.member)

    byDefault.assertStatus(201)
    joint.assertStatus(201)
    assert.equal(byDefault.body().data.userId, fixture.owner.id)
    assert.isNull(joint.body().data.userId)
    const jointRows = await linesOf(joint.body().data.id)
    assert.isTrue(jointRows.every((row) => row.paidByUserId === null))
  })

  test('test_payslip_whose_net_differs_from_the_transfer_is_rejected', async ({
    client,
    assert,
  }) => {
    const fixture = await walletWithPayout()

    // 5,000.00 - 1,250.00 - 40.00 = 3,710.00, but 3,700.00 reached the bank.
    const response = await client
      .post('/api/v1/payslips')
      .json(
        payslipBody(fixture, {
          deductions: [
            { categoryId: fixture.taxes.id, amountCents: 125_000 },
            { categoryId: fixture.fees.id, amountCents: 4_000 },
          ],
        })
      )
      .actingAs(fixture.owner)

    response.assertStatus(422)
    response.assertBodyContains({ errors: [{ field: 'deductions', rule: 'netMismatch' }] })
    assert.lengthOf(await Payslip.query().where('household_id', fixture.household.id), 0)
    assert.lengthOf(await Transaction.query().whereNotNull('payslip_id'), 0)
  })

  test('test_payslip_deductions_cannot_reach_the_gross', async ({ client, assert }) => {
    const fixture = await walletWithPayout()

    const response = await client
      .post('/api/v1/payslips')
      .json(
        payslipBody(fixture, {
          transferId: undefined,
          toAccountId: fixture.bank.id,
          deductions: [{ categoryId: fixture.taxes.id, amountCents: 500_000 }],
        })
      )
      .actingAs(fixture.owner)

    response.assertStatus(422)
    response.assertBodyContains({ errors: [{ field: 'deductions', rule: 'exceedsGross' }] })
    assert.lengthOf(await Payslip.query().where('household_id', fixture.household.id), 0)
  })

  test('test_payslip_without_a_transfer_creates_one_for_the_net_to_the_target_account', async ({
    client,
    assert,
  }) => {
    const fixture = await walletWithPayout()

    const response = await client
      .post('/api/v1/payslips')
      .json(
        payslipBody(fixture, {
          date: '2026-09-30',
          transferId: undefined,
          toAccountId: fixture.bank.id,
          memo: 'September invoice',
        })
      )
      .actingAs(fixture.owner)

    response.assertStatus(201)
    const payslip = response.body().data
    assert.notEqual(payslip.transferId, fixture.payout.id)
    assert.include(payslip.transfer, {
      date: '2026-09-30',
      amountCents: 370_000,
      fromAccountId: fixture.wallet.id,
      toAccountId: fixture.bank.id,
    })
    const legs = await Transaction.query()
      .where('transfer_id', payslip.transferId)
      .orderBy('amount_cents')
    assert.deepEqual(
      legs.map((leg) => [leg.accountId, leg.amountCents, leg.kind]),
      [
        [fixture.wallet.id, -370_000, 'transfer'],
        [fixture.bank.id, 370_000, 'transfer'],
      ]
    )
    const transfer = await Transfer.findOrFail(payslip.transferId)
    assert.equal(transfer.memo, 'September invoice')
  })

  test('test_payslip_needs_a_transfer_or_a_target_account_but_not_both', async ({
    client,
    assert,
  }) => {
    const fixture = await walletWithPayout()

    const neither = await client
      .post('/api/v1/payslips')
      .json(payslipBody(fixture, { transferId: undefined }))
      .actingAs(fixture.owner)
    const both = await client
      .post('/api/v1/payslips')
      .json(payslipBody(fixture, { toAccountId: fixture.bank.id }))
      .actingAs(fixture.owner)
    const sameAccount = await client
      .post('/api/v1/payslips')
      .json(payslipBody(fixture, { transferId: undefined, toAccountId: fixture.wallet.id }))
      .actingAs(fixture.owner)

    neither.assertStatus(422)
    neither.assertBodyContains({ errors: [{ field: 'transferId', rule: 'required' }] })
    both.assertStatus(422)
    both.assertBodyContains({ errors: [{ field: 'toAccountId', rule: 'exclusive' }] })
    sameAccount.assertStatus(422)
    sameAccount.assertBodyContains({ errors: [{ field: 'toAccountId', rule: 'sameAccount' }] })
    assert.lengthOf(await Payslip.query().where('household_id', fixture.household.id), 0)
  })

  test('test_transfer_already_linked_to_a_payslip_cannot_be_linked_again', async ({
    client,
    assert,
  }) => {
    const fixture = await walletWithPayout()
    await client.post('/api/v1/payslips').json(payslipBody(fixture)).actingAs(fixture.owner)

    const again = await client
      .post('/api/v1/payslips')
      .json(payslipBody(fixture))
      .actingAs(fixture.owner)

    again.assertStatus(422)
    again.assertBodyContains({ errors: [{ field: 'transferId', rule: 'linked' }] })
    assert.lengthOf(await Payslip.query().where('household_id', fixture.household.id), 1)
  })

  test('test_linked_transfer_must_leave_the_payslip_account', async ({ client }) => {
    const fixture = await walletWithPayout()
    const incoming = await TransferFactory.merge({
      householdId: fixture.household.id,
      fromAccountId: fixture.bank.id,
      toAccountId: fixture.wallet.id,
      date: '2026-08-31',
      amountCents: 370_000,
    }).create()

    const response = await client
      .post('/api/v1/payslips')
      .json(payslipBody(fixture, { transferId: incoming.id }))
      .actingAs(fixture.owner)

    response.assertStatus(422)
    response.assertBodyContains({ errors: [{ field: 'transferId', rule: 'wrongAccount' }] })
  })

  test('test_payslip_takes_at_most_three_deductions_and_positive_amounts', async ({ client }) => {
    const fixture = await walletWithPayout()
    const line = { categoryId: fixture.taxes.id, amountCents: 1_000 }

    const tooMany = await client
      .post('/api/v1/payslips')
      .json(payslipBody(fixture, { deductions: [line, line, line, line] }))
      .actingAs(fixture.owner)
    const zero = await client
      .post('/api/v1/payslips')
      .json(payslipBody(fixture, { grossCents: 0 }))
      .actingAs(fixture.owner)

    tooMany.assertStatus(422)
    tooMany.assertBodyContains({ errors: [{ field: 'deductions' }] })
    zero.assertStatus(422)
    zero.assertBodyContains({ errors: [{ field: 'grossCents' }] })
  })
})

test.group('Payslips: list, candidates and delete', () => {
  test('test_payslips_are_listed_newest_first_with_lines_and_transfer', async ({
    client,
    assert,
  }) => {
    const fixture = await walletWithPayout()
    await client.post('/api/v1/payslips').json(payslipBody(fixture)).actingAs(fixture.owner)
    await client
      .post('/api/v1/payslips')
      .json(
        payslipBody(fixture, {
          date: '2026-09-30',
          transferId: undefined,
          toAccountId: fixture.bank.id,
        })
      )
      .actingAs(fixture.owner)

    const response = await client
      .get(`/api/v1/payslips?accountId=${fixture.wallet.id}`)
      .actingAs(fixture.member)
    const otherAccount = await client
      .get(`/api/v1/payslips?accountId=${fixture.bank.id}`)
      .actingAs(fixture.member)

    response.assertStatus(200)
    const payslips = response.body().data
    assert.deepEqual(
      payslips.map((payslip: any) => [payslip.date, payslip.grossCents, payslip.netCents]),
      [
        ['2026-09-30', 500_000, 370_000],
        ['2026-08-31', 500_000, 370_000],
      ]
    )
    assert.lengthOf(payslips[0].lines, 3)
    assert.equal(payslips[1].transfer.id, fixture.payout.id)
    assert.deepEqual(otherAccount.body().data, [])
  })

  test('test_candidates_are_unlinked_transfers_leaving_the_account_newest_first', async ({
    client,
    assert,
  }) => {
    const fixture = await walletWithPayout()
    const base = { householdId: fixture.household.id, amountCents: 120_000 }
    const older = await TransferFactory.merge({
      ...base,
      fromAccountId: fixture.wallet.id,
      toAccountId: fixture.bank.id,
      date: '2026-07-31',
    }).create()
    const newer = await TransferFactory.merge({
      ...base,
      fromAccountId: fixture.wallet.id,
      toAccountId: fixture.bank.id,
      date: '2026-09-30',
      memo: 'INV-12',
    }).create()
    // Money coming into the wallet is not a payout.
    await TransferFactory.merge({
      ...base,
      fromAccountId: fixture.bank.id,
      toAccountId: fixture.wallet.id,
      date: '2026-10-01',
    }).create()
    // The August payout already has its payslip.
    await client.post('/api/v1/payslips').json(payslipBody(fixture)).actingAs(fixture.owner)

    const response = await client
      .get(`/api/v1/payslips/candidates?accountId=${fixture.wallet.id}`)
      .actingAs(fixture.owner)

    response.assertStatus(200)
    assert.deepEqual(response.body().data, [
      {
        transferId: newer.id,
        date: '2026-09-30',
        amountCents: 120_000,
        toAccountId: fixture.bank.id,
        memo: 'INV-12',
      },
      {
        transferId: older.id,
        date: '2026-07-31',
        amountCents: 120_000,
        toAccountId: fixture.bank.id,
        memo: null,
      },
    ])
  })

  test('test_candidates_need_an_account', async ({ client }) => {
    const fixture = await walletWithPayout()

    const response = await client.get('/api/v1/payslips/candidates').actingAs(fixture.owner)

    response.assertStatus(422)
    response.assertBodyContains({ errors: [{ field: 'accountId' }] })
  })

  test('test_deleting_a_payslip_removes_its_rows_and_keeps_the_transfer_unlinked', async ({
    client,
    assert,
  }) => {
    const fixture = await walletWithPayout()
    const created = await client
      .post('/api/v1/payslips')
      .json(payslipBody(fixture))
      .actingAs(fixture.owner)
    const id = created.body().data.id

    const response = await client.delete(`/api/v1/payslips/${id}`).actingAs(fixture.member)

    response.assertStatus(204)
    assert.isNull(await Payslip.find(id))
    assert.lengthOf(await Transaction.query().whereNotNull('payslip_id'), 0)
    assert.lengthOf(await Transaction.query().where('transfer_id', fixture.payout.id), 2)
    const candidates = await client
      .get(`/api/v1/payslips/candidates?accountId=${fixture.wallet.id}`)
      .actingAs(fixture.owner)
    assert.deepEqual(
      candidates.body().data.map((candidate: any) => candidate.transferId),
      [fixture.payout.id]
    )
  })

  test('test_deleting_the_linked_transfer_keeps_the_payslip_unlinked', async ({
    client,
    assert,
  }) => {
    const fixture = await walletWithPayout()
    const created = await client
      .post('/api/v1/payslips')
      .json(payslipBody(fixture))
      .actingAs(fixture.owner)

    await client.delete(`/api/v1/transfers/${fixture.payout.id}`).actingAs(fixture.owner)

    const payslip = await Payslip.findOrFail(created.body().data.id)
    assert.isNull(payslip.transferId)
    assert.lengthOf(await linesOf(payslip.id), 3)
  })
})

test.group('Payslips: ledger', () => {
  test('test_payslip_raises_month_income_by_the_gross_and_expenses_by_the_deductions', async ({
    client,
    assert,
  }) => {
    const fixture = await walletWithPayout()
    const before = await client.get('/api/v1/reports/month?month=2026-08').actingAs(fixture.owner)

    await client.post('/api/v1/payslips').json(payslipBody(fixture)).actingAs(fixture.owner)
    const after = await client.get('/api/v1/reports/month?month=2026-08').actingAs(fixture.owner)

    assert.equal(before.body().data.incomeCents, 0)
    assert.equal(before.body().data.expenseCents, 0)
    assert.equal(after.body().data.incomeCents, 500_000)
    assert.equal(after.body().data.expenseCents, 130_000)
    assert.equal(after.body().data.netCents, 370_000)
  })

  test('test_payslip_line_amount_and_existence_belong_to_the_payslip', async ({
    client,
    assert,
  }) => {
    const fixture = await walletWithPayout()
    const created = await client
      .post('/api/v1/payslips')
      .json(payslipBody(fixture))
      .actingAs(fixture.owner)
    const [, tax] = await linesOf(created.body().data.id)

    const amount = await client
      .patch(`/api/v1/transactions/${tax.id}`)
      .json({ amountCents: 1 })
      .actingAs(fixture.owner)
    const destroy = await client.delete(`/api/v1/transactions/${tax.id}`).actingAs(fixture.owner)
    const sameValues = await client
      .patch(`/api/v1/transactions/${tax.id}`)
      .json({
        accountId: fixture.wallet.id,
        kind: 'expense',
        date: '2026-08-31',
        amountCents: 125_000,
        payee: 'Tax office',
        categoryId: fixture.fees.id,
      })
      .actingAs(fixture.owner)

    amount.assertStatus(409)
    amount.assertBodyContains({ code: 'E_PAYSLIP_LINE' })
    destroy.assertStatus(409)
    destroy.assertBodyContains({ code: 'E_PAYSLIP_LINE' })
    // Labels stay editable like any other movement.
    sameValues.assertStatus(200)
    assert.include(sameValues.body().data, {
      payee: 'Tax office',
      categoryId: fixture.fees.id,
      amountCents: -125_000,
      payslipId: created.body().data.id,
    })
  })
})

test.group('Payslips: bank imports', (group) => {
  group.each.setup(() => {
    drive.fake()
    const restoreClock = freezeClock('2026-10-15T09:00:00+10:00')
    return () => {
      drive.restore()
      restoreClock()
    }
  })

  test('test_payslip_rows_are_never_taken_as_the_other_leg_of_an_imported_transfer', async ({
    client,
    assert,
  }) => {
    // The sample export has a 4,350.00 payout from the wallet on 31 July. A
    // payslip that same day withheld exactly 4,350.00 of tax: that row is
    // the payslip's, not the wallet side of the bank's transfer.
    const home = await nabHousehold()
    const taxes = await categoryBySlug(home.household.id, 'taxes')
    const created = await client
      .post('/api/v1/payslips')
      .json({
        accountId: home.hnry.id,
        date: '2026-07-31',
        grossCents: 1_000_000,
        deductions: [{ categoryId: taxes.id, amountCents: 435_000 }],
        toAccountId: home.savings.id,
      })
      .actingAs(home.owner)
    created.assertStatus(201)

    const upload = await uploadCsv(client, home.owner, nabFixture('sample.csv'))
    const batch = upload.body().data[0]
    const confirm = await client.post(`/api/v1/imports/${batch.id}/confirm`).actingAs(home.owner)

    confirm.assertStatus(200)
    const lines = await linesOf(created.body().data.id)
    assert.deepEqual(
      lines.map((line) => [line.kind, line.amountCents, line.transferId]),
      [
        ['income', 1_000_000, null],
        ['expense', -435_000, null],
      ]
    )
    const incoming = await Transaction.query()
      .where('account_id', home.everyday.id)
      .where('amount_cents', 435_000)
      .firstOrFail()
    const walletLeg = await Transaction.query()
      .where('transfer_id', incoming.transferId!)
      .whereNot('id', incoming.id)
      .firstOrFail()
    assert.include(walletLeg.serialize(), {
      accountId: home.hnry.id,
      amountCents: -435_000,
      payslipId: null,
    })
  })
})
