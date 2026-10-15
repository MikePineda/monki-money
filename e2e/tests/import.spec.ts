import { fileURLToPath } from 'node:url'
import type { BrowserContext } from '@playwright/test'
import { ImportPage } from '../pages/import.page.ts'
import { MonthPage } from '../pages/month.page.ts'
import { expect, signUpOwner, test, xsrfToken } from '../support/fixtures.ts'

/**
 * A synthetic NAB export of account 555000111, September 2026: a $0.00
 * card check (ignored), two rows the bank categorizes (auto), one it calls
 * "Uncategorised" (a guess to review) and one without a category (new).
 */
const FIXTURE = fileURLToPath(new URL('./fixtures/nab/journey.csv', import.meta.url))
const MONTH = '2026-09'

/** The month's spending (`GET /reports/month`), positive cents. */
async function spentIn(context: BrowserContext, month: string): Promise<number> {
  const response = await context.request.get(`/api/v1/reports/month?month=${month}`)
  expect(response.ok(), await response.text()).toBe(true)
  const { data } = (await response.json()) as { data: { expenseCents: number } }
  return data.expenseCents
}

test.describe('journey 5: import a bank CSV', () => {
  test('stage, review, confirm and the month moves with a balanced ledger', async ({
    page,
    context,
  }) => {
    await signUpOwner(context)
    const account = await context.request.post('/api/v1/accounts', {
      headers: { 'X-XSRF-TOKEN': await xsrfToken(context) },
      data: { name: 'NAB Everyday', kind: 'transaction', externalAccountNumber: '555000111' },
    })
    expect(account.status(), await account.text()).toBe(201)
    expect(await spentIn(context, MONTH)).toBe(0)

    // Upload: the file's account number picks the account.
    const imports = new ImportPage(page)
    await imports.goto()
    await imports.upload(FIXTURE)

    // The review shows the three states (and the ignored card check).
    await expect(imports.summary).toContainText('2 auto')
    await expect(imports.summary).toContainText('1 to review')
    await expect(imports.summary).toContainText('1 new')
    await expect(imports.row('FreshCo')).toHaveAttribute('data-tone', 'auto')
    await expect(imports.row('RIVERSIDE DELI')).toHaveAttribute('data-tone', 'doubtful')
    await expect(imports.row('GARDEN NOOK')).toHaveAttribute('data-tone', 'new')
    await expect(imports.row('Translink')).toHaveAttribute('data-tone', 'ignored')

    // Accept the suggestion waiting for review.
    await imports.acceptSuggested(1)
    await expect(imports.row('RIVERSIDE DELI')).toHaveAttribute('data-tone', 'auto')

    // Give the new row a category in its triage sheet.
    await imports.open('GARDEN NOOK')
    await imports.chooseCategory('Gifts')
    await imports.closeSheet()
    await expect(imports.row('GARDEN NOOK')).toHaveAttribute('data-tone', 'auto')
    await expect(imports.row('GARDEN NOOK')).toContainText('Gifts')

    // Confirm: four movements created, the ledger agrees with the bank.
    await imports.confirm()
    await expect(imports.created).toHaveText('4')
    await expect(imports.reconciliation).toHaveAttribute('data-status', 'balanced')
    await expect(imports.reconciliation).toContainText('Balanced with the bank: $1,830.43')

    // The month the file ends in now holds the spending: report and hero agree.
    await expect.poll(() => spentIn(context, MONTH)).toBe(13205)
    await imports.viewMonth()
    const month = new MonthPage(page)
    await month.waitReady()
    await expect(month.hero).toHaveText('$132.05')
  })
})
