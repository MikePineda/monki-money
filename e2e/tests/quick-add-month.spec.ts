import { MonthPage } from '../pages/month.page.ts'
import { QuickAddPage } from '../pages/quick-add.page.ts'
import { expect, signUpOwner, test, xsrfToken } from '../support/fixtures.ts'

interface LedgerRow {
  kind: 'expense' | 'income' | 'transfer'
  amountCents: number
  accountId: number
  categoryId: number | null
}

test.describe('journey 3: quick add feeds the month', () => {
  test('an expense, an income and a transfer show up in the month and the ledger', async ({
    page,
    context,
  }) => {
    // A fresh household (its own "Cash" account) plus a savings account to transfer into.
    await signUpOwner(context)
    const savings = await context.request.post('/api/v1/accounts', {
      headers: { 'X-XSRF-TOKEN': await xsrfToken(context) },
      data: { name: 'Savings', kind: 'savings' },
    })
    expect(savings.status(), await savings.text()).toBe(201)

    const month = new MonthPage(page)
    await month.goto()
    await expect(month.empty).toBeVisible()
    await expect(month.hero).toHaveText('$0.00')

    // The tab bar's "+" opens quick add.
    await page.getByTestId('shell.add').click()
    await expect(page).toHaveURL(/\/add$/)
    const quickAdd = new QuickAddPage(page)
    await quickAdd.waitReady()
    await expect(quickAdd.save).toBeDisabled()

    // Expense: amount, a category tile, save (3 taps once the amount is in).
    // The budget is "3 taps ≈ 6 s" for a person; the app's share must be far below it.
    const started = Date.now()
    await quickAdd.press('4', '2', '5', '0')
    await quickAdd.tapCategory(0)
    await expect(quickAdd.save).toHaveText('Save −$42.50')
    await quickAdd.saveAndConfirm()
    const elapsed = Date.now() - started
    test.info().annotations.push({ type: 'quick-add-ms', description: String(elapsed) })
    expect(elapsed).toBeLessThan(6_000)
    await expect(page).toHaveURL(/\/add$/)

    // Income, without a category. The first key dismisses the "Saved" toast
    // that docks over the type segment.
    await quickAdd.press('1', '0', '0', '0', '00')
    await quickAdd.chooseKind('Income')
    await expect(quickAdd.save).toHaveText('Save +$1,000.00')
    await quickAdd.saveAndConfirm()

    // Transfer: Cash → Savings is the default route without history.
    await quickAdd.press('2', '5', '00')
    await quickAdd.chooseKind('Transfer')
    await expect(quickAdd.from).toHaveText('Cash')
    await expect(quickAdd.to).toHaveText('Savings')
    await expect(quickAdd.save).toHaveText('Save $25.00')
    await quickAdd.saveAndConfirm()

    // "Done" goes back to the month, which reloaded: transfers never count as spending.
    await quickAdd.done.click()
    await expect(page).toHaveURL(/\/month$/)
    await month.waitReady()
    await expect(month.hero).toHaveText('$42.50')
    await expect(month.income).toContainText('$1,000')
    await expect(month.empty).toHaveCount(0)
    await expect(month.top).toContainText('−$42.50')

    // The ledger holds all three: the expense, the income and both transfer legs.
    const response = await context.request.get('/api/v1/transactions?perPage=20')
    expect(response.ok(), await response.text()).toBe(true)
    const { data } = (await response.json()) as { data: LedgerRow[] }
    const summary = data.map((row) => `${row.kind}:${row.amountCents}`).sort()
    expect(summary).toEqual(['expense:-4250', 'income:100000', 'transfer:-2500', 'transfer:2500'])
    expect(data.find((row) => row.kind === 'expense')?.categoryId).not.toBeNull()
    expect(data.find((row) => row.kind === 'income')?.categoryId).toBeNull()
  })

  test('undo removes what was just saved', async ({ page, context }) => {
    await signUpOwner(context)
    const quickAdd = new QuickAddPage(page)
    await quickAdd.goto('expense')

    await quickAdd.press('9', '00')
    await quickAdd.saveAndConfirm()
    await quickAdd.toast.getByRole('button', { name: 'Undo' }).click()
    await expect(quickAdd.toast).toContainText('Removed')

    const response = await context.request.get('/api/v1/transactions')
    const { data } = (await response.json()) as { data: LedgerRow[] }
    expect(data).toEqual([])
  })
})
