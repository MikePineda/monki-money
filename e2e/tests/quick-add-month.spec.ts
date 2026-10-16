import { MonthPage } from '../pages/month.page.ts'
import { QuickAddPage } from '../pages/quick-add.page.ts'
import { expect, signUpOwner, test, xsrfToken } from '../support/fixtures.ts'

/** The calendar month before 'YYYY-MM'. */
function previousMonth(month: string): string {
  const [year, number] = month.split('-').map(Number) as [number, number]
  return number === 1 ? `${year - 1}-12` : `${year}-${String(number - 1).padStart(2, '0')}`
}

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

  test('the month compares with last month, lists its five largest expenses and jumps through the year grid', async ({
    page,
    context,
  }) => {
    await signUpOwner(context)
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Brisbane' }).format(
      new Date()
    )
    const thisMonth = today.slice(0, 7)
    const lastMonth = previousMonth(thisMonth)
    const headers = { 'X-XSRF-TOKEN': await xsrfToken(context) }
    const expenses: [string, number, string][] = [
      [`${lastMonth}-15`, 8_500, 'Old Grocer'],
      [today, 3_000, 'Hardware Barn'],
      [today, 2_000, 'Book Nook'],
      [today, 1_000, 'Cafe Uno'],
      [today, 700, 'Bakery Two'],
      [today, 500, 'Kiosk Three'],
      [today, 100, 'Gum Stand'],
    ]
    for (const [date, amountCents, payee] of expenses) {
      const created = await context.request.post('/api/v1/transactions/quick', {
        headers,
        data: { date, amountCents, payee },
      })
      expect(created.status(), await created.text()).toBe(201)
    }
    const calls: string[] = []
    page.on('request', (request) => {
      const { pathname } = new URL(request.url())
      if (pathname.startsWith('/api/v1/')) {
        calls.push(pathname)
      }
    })

    const month = new MonthPage(page)
    await month.goto()

    // 30 + 20 + 10 + 7 + 5 + 1 = 73.00 this month against 85.00 last month.
    await expect(month.hero).toHaveText('$73.00')
    await expect(month.delta).toHaveText(/^14% less than [A-Z][a-z]+ \(\$85\.00\)$/)
    await expect(month.topRows).toHaveCount(5)
    await expect(month.topRows.first()).toContainText('Hardware Barn')
    await expect(month.top).not.toContainText('Gum Stand')
    // The month report carries the delta, the top five and the summary flag:
    // no ledger page and no summary lookup that could only answer 404.
    expect(calls.filter((path) => path.startsWith('/api/v1/transactions'))).toEqual([])
    expect(calls.filter((path) => path.startsWith('/api/v1/insights'))).toEqual([])
    expect(calls.filter((path) => path.startsWith('/api/v1/reports/'))).toEqual([
      '/api/v1/reports/month',
      '/api/v1/reports/trend',
    ])

    // Tapping the selected month opens the year grid; a month there opens it.
    await month.stripMonth(thisMonth).click()
    await expect(month.yearGrid).toContainText('Choose a month')
    await month.yearGrid.locator(`button[data-month="${lastMonth}"]`).click()
    await expect(page).toHaveURL(new RegExp(`/month/${lastMonth}$`))
    await month.waitReady()
    await expect(month.hero).toHaveText('$85.00')

    // Screens reached from More keep More marked in the tab bar.
    await page.goto('/categories')
    await expect(
      page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'More' })
    ).toHaveAttribute('aria-current', 'page')
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
