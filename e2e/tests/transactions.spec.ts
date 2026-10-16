import type { BrowserContext } from '@playwright/test'
import { TransactionsPage } from '../pages/transactions.page.ts'
import { expect, signUpOwner, test, xsrfToken } from '../support/fixtures.ts'

interface CategoryLine {
  bucket: string
  categoryId: number | null
  kind: string
  amountCents: number
}

/** Category ids of the household's seeded taxonomy, by slug. */
async function categoryIds(context: BrowserContext): Promise<Record<string, number>> {
  const response = await context.request.get('/api/v1/categories')
  expect(response.ok(), await response.text()).toBe(true)
  const { data } = (await response.json()) as { data: { id: number; slug: string }[] }
  return Object.fromEntries(data.map((category) => [category.slug, category.id]))
}

/** This month's spending per category (`GET /reports/month`), positive cents. */
async function spentByCategory(context: BrowserContext): Promise<Map<number, number>> {
  const response = await context.request.get('/api/v1/reports/month')
  expect(response.ok(), await response.text()).toBe(true)
  const { data } = (await response.json()) as { data: { byCategory: CategoryLine[] } }
  return new Map(
    data.byCategory
      .filter((line) => line.bucket === 'category' && line.kind === 'expense')
      .map((line) => [line.categoryId as number, Math.abs(line.amountCents)])
  )
}

test.describe('journey 4: edit an amount and split it into two categories', () => {
  test('the new amount and the split land in the month report per category', async ({
    page,
    context,
  }) => {
    await signUpOwner(context)
    const ids = await categoryIds(context)
    const groceries = ids['groceries'] as number
    const restaurants = ids['restaurants-takeaway'] as number

    // One grocery expense today (quick add: the household's only account, today).
    const created = await context.request.post('/api/v1/transactions/quick', {
      headers: { 'X-XSRF-TOKEN': await xsrfToken(context) },
      data: { amountCents: 4250, categoryId: groceries, payee: 'Corner Grocer' },
    })
    expect(created.status(), await created.text()).toBe(201)

    const transactions = new TransactionsPage(page)
    await transactions.goto()
    await expect(transactions.row('Corner Grocer')).toContainText('−$42.50')

    // Edit the amount: $42.50 → $60.00.
    await transactions.open('Corner Grocer')
    await transactions.typeAmount('6000')
    await transactions.save()
    await expect(transactions.toast).toContainText('Changes saved.')
    await expect(page).toHaveURL(/\/transactions$/)
    await expect(transactions.row('Corner Grocer')).toContainText('−$60.00')

    // Split it: $40.00 groceries, the rest ($20.00) restaurants.
    await transactions.open('Corner Grocer')
    await transactions.openSplit()
    await transactions.typeSplitAmount('4000')
    await transactions.chooseSplitCategory(1, 'Restaurants & takeaway')
    await expect(transactions.splitStatus).toHaveText('The lines add up to $60.00.')
    await transactions.saveSplit()
    await expect(transactions.toast).toContainText('Split saved.')
    await transactions.closeSheet()
    await expect(transactions.row('Corner Grocer')).toContainText('Split')
    await expect(transactions.row('Corner Grocer')).toContainText('−$60.00')

    // The month report counts each line in its own category.
    await expect
      .poll(async () => Object.fromEntries(await spentByCategory(context)))
      .toEqual({ [groceries]: 4000, [restaurants]: 2000 })
  })
})

test.describe('journey: who paid', () => {
  test('the person chip offers everyone, you and joint, and joint keeps the shared rows', async ({
    page,
    context,
  }) => {
    await signUpOwner(context)
    const headers = { 'X-XSRF-TOKEN': await xsrfToken(context) }
    for (const data of [
      { amountCents: 120_000, payee: 'Shared Rent', paidByUserId: null },
      { amountCents: 1_800, payee: 'Solo Lunch' },
    ]) {
      const created = await context.request.post('/api/v1/transactions/quick', { headers, data })
      expect(created.status(), await created.text()).toBe(201)
    }

    const transactions = new TransactionsPage(page)
    await transactions.goto()
    await expect(transactions.row('Shared Rent')).toBeVisible()
    await expect(transactions.row('Solo Lunch')).toBeVisible()

    await transactions.filterChip('person').click()
    const options = page.getByRole('option')
    // A household of one: no partner between "You" and "Joint".
    await expect(options).toHaveText(['Everyone', 'You', 'Joint'])
    await page.getByRole('option', { name: 'Joint' }).click()

    await expect(transactions.filterChip('person')).toContainText('Joint')
    await expect(transactions.row('Shared Rent')).toBeVisible()
    await expect(transactions.row('Solo Lunch')).toHaveCount(0)

    await transactions.filterChip('person').click()
    await page.getByRole('option', { name: 'You' }).click()
    await expect(transactions.row('Solo Lunch')).toBeVisible()
    await expect(transactions.row('Shared Rent')).toHaveCount(0)
  })
})
