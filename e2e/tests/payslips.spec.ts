import { MonthPage } from '../pages/month.page.ts'
import { PayslipFormPage, PayslipsPage } from '../pages/payslips.page.ts'
import { expect, signUpOwner, test, xsrfToken } from '../support/fixtures.ts'

test.describe('journey: a payslip for a payout already imported from the bank', () => {
  test('recording the gross and tax against the transfer raises the month income', async ({
    page,
    context,
  }) => {
    await signUpOwner(context)
    const request = context.request
    const headers = { 'X-XSRF-TOKEN': await xsrfToken(context) }

    // A synthetic umbrella-service wallet of this person, a bank account and
    // the payout the bank import would have recorded: 3,700.00 from the
    // wallet to the bank on the first day of this month.
    const me = await request.get('/api/v1/auth/me')
    const userId = ((await me.json()) as { data: { user: { id: number } } }).data.user.id
    const wallet = await request.post('/api/v1/accounts', {
      headers,
      data: { name: 'Payroll wallet', kind: 'wallet', ownerUserId: userId },
    })
    expect(wallet.status(), await wallet.text()).toBe(201)
    const bank = await request.post('/api/v1/accounts', {
      headers,
      data: { name: 'Everyday', kind: 'transaction' },
    })
    expect(bank.status(), await bank.text()).toBe(201)
    const report = await request.get('/api/v1/reports/month')
    const { from } = ((await report.json()) as { data: { from: string } }).data
    const transfer = await request.post('/api/v1/transfers', {
      headers,
      data: {
        fromAccountId: ((await wallet.json()) as { data: { id: number } }).data.id,
        toAccountId: ((await bank.json()) as { data: { id: number } }).data.id,
        date: from,
        amountCents: 370_000,
      },
    })
    expect(transfer.status(), await transfer.text()).toBe(201)

    // Settings → Accounts → the wallet's Payslips: none yet.
    const payslips = new PayslipsPage(page)
    await payslips.openFromAccounts('Payroll wallet')
    await expect(payslips.empty).toContainText('No payslips yet')

    // New payslip: link the transfer, 5,000.00 gross, 1,250.00 tax; the fee is the rest.
    await payslips.addButton.click()
    await expect(page).toHaveURL(/\/payslips\/new$/)
    const form = new PayslipFormPage(page)
    await form.waitReady()
    await form.candidate('$3,700.00').click()
    await form.amount('gross', '5', '0', '0', '0', '00')
    await form.amount('tax', '1', '2', '5', '0', '00')
    await expect(form.fee).toHaveText('$50.00')
    await form.submit.click()

    // Back on the list: gross, deductions and net of the new payslip.
    await expect(page).toHaveURL(/\/settings\/accounts\/\d+\/payslips$/)
    await payslips.waitReady()
    await expect(payslips.cards).toHaveCount(1)
    await expect(page.getByTestId('payslips.card.gross')).toHaveText('$5,000.00')
    await expect(page.getByTestId('payslips.card.deductions')).toHaveText('$1,300.00')
    await expect(page.getByTestId('payslips.card.net')).toHaveText('$3,700.00')
    await expect(page.getByTestId('payslips.card.meta')).toContainText('To Everyday')

    // The month now counts the gross as income.
    const month = new MonthPage(page)
    await month.goto()
    await expect(month.income).toContainText('$5,000')
  })
})
