import { test } from '@japa/runner'
import { touchesPayslipTotals } from '#domain/payslips/line_edits'

/** A tax line of a payslip: 1,250.00 out of the wallet (account 7) on 31 August. */
const taxLine = {
  accountId: 7,
  kind: 'expense' as const,
  date: '2026-08-31',
  amountCents: -125_000,
}

test.group('Payslips: line edits', () => {
  test('test_labels_of_a_payslip_line_are_free_to_change', ({ assert }) => {
    // An edit of the category, payee or notes carries none of the money fields.
    assert.isFalse(touchesPayslipTotals(taxLine, {}))
  })

  test('test_resending_the_same_amount_kind_account_and_date_is_not_a_change', ({ assert }) => {
    // Edit forms send every field back; the amount is typed positive.
    assert.isFalse(
      touchesPayslipTotals(taxLine, {
        accountId: 7,
        kind: 'expense',
        date: '2026-08-31',
        amountCents: 125_000,
      })
    )
  })

  test('test_amount_kind_account_or_date_belong_to_the_payslip', ({ assert }) => {
    assert.isTrue(touchesPayslipTotals(taxLine, { amountCents: 120_000 }))
    assert.isTrue(touchesPayslipTotals(taxLine, { kind: 'income' }))
    assert.isTrue(touchesPayslipTotals(taxLine, { accountId: 8 }))
    assert.isTrue(touchesPayslipTotals(taxLine, { date: '2026-09-01' }))
  })
})
