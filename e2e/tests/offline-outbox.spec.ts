import type { Page } from '@playwright/test'
import { MonthPage } from '../pages/month.page.ts'
import { OutboxPage } from '../pages/outbox.page.ts'
import { QuickAddPage } from '../pages/quick-add.page.ts'
import { expect, signUpOwner, test, xsrfToken } from '../support/fixtures.ts'

interface LedgerRow {
  kind: 'expense' | 'income' | 'transfer'
  amountCents: number
  clientId: string | null
}

const QUICK_ENDPOINT = '/api/v1/transactions/quick'

/** The client ids waiting in this device's outbox (localStorage `outbox:<userId>`). */
async function queuedIds(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Object.keys(localStorage)
      .filter((key) => key.startsWith('outbox:'))
      .flatMap((key) => {
        const stored = JSON.parse(localStorage.getItem(key) ?? '{}') as {
          entries?: { id: string }[]
        }
        return (stored.entries ?? []).map((entry) => entry.id)
      })
  )
}

/** Quick add opened from the month through the tab bar (so the shell is already loaded). */
async function openQuickAdd(page: Page): Promise<QuickAddPage> {
  await new MonthPage(page).goto()
  await page.getByTestId('shell.add').click()
  const quickAdd = new QuickAddPage(page)
  await quickAdd.waitReady()
  return quickAdd
}

test.describe('offline outbox: quick add never loses an entry', () => {
  // page.route() cannot see requests the service worker makes; the outbox
  // must work without it anyway (it never caches /api).
  test.use({ serviceWorkers: 'block' })

  test('an expense saved offline syncs once when the connection is back', async ({
    page,
    context,
  }) => {
    await signUpOwner(context)
    const quickAdd = await openQuickAdd(page)

    await context.setOffline(true)
    await quickAdd.press('4', '2', '5', '0')
    await quickAdd.saveOffline()
    await quickAdd.done.click()
    await expect(page).toHaveURL(/\/month$/)
    const outbox = new OutboxPage(page)
    await expect(outbox.pill).toHaveText('1 pending')

    const [queuedId] = await queuedIds(page)
    expect(queuedId).toBeTruthy()

    // The first sync reaches the API, but its answer never makes it back to
    // the phone: the outbox has to send the entry again, with the same id.
    let attempts = 0
    await page.route(`**${QUICK_ENDPOINT}`, async (route) => {
      attempts += 1
      if (attempts === 1) {
        await route.fetch()
        await route.abort('internetdisconnected')
      } else {
        await route.continue()
      }
    })

    await context.setOffline(false)
    await expect(outbox.pill).toBeHidden()
    expect(attempts).toBeGreaterThanOrEqual(2)

    const response = await context.request.get('/api/v1/transactions?perPage=20')
    expect(response.ok(), await response.text()).toBe(true)
    const { data } = (await response.json()) as { data: LedgerRow[] }
    expect(data.map((row) => `${row.kind}:${row.amountCents}`)).toEqual(['expense:-4250'])
    expect(data[0]?.clientId).toBe(queuedId)
  })

  test('an entry the API refuses shows as failed and can be discarded', async ({
    page,
    context,
  }) => {
    await signUpOwner(context)
    const quickAdd = await openQuickAdd(page)

    // The category on the tile is deleted behind the app's back: the queued
    // entry will point at a category that no longer exists (a 422).
    const categoryId = await quickAdd.categoryId(0)
    await quickAdd.tapCategory(0)
    const removed = await context.request.delete(`/api/v1/categories/${categoryId}`, {
      headers: { 'X-XSRF-TOKEN': await xsrfToken(context) },
    })
    expect(removed.status(), await removed.text()).toBe(204)

    await context.setOffline(true)
    await quickAdd.press('9', '00')
    await quickAdd.saveOffline()
    await quickAdd.done.click()
    await expect(page).toHaveURL(/\/month$/)
    const outbox = new OutboxPage(page)
    await expect(outbox.pill).toHaveText('1 pending')

    await context.setOffline(false)
    await expect(outbox.pill).toHaveText('1 failed')

    await outbox.open()
    await expect(outbox.entries).toHaveCount(1)
    const entry = outbox.entries.first()
    await expect(outbox.status(entry)).toContainText('The selected category does not exist')
    await outbox.discard(entry)
    await expect(outbox.sheet).toBeHidden()
    await expect(outbox.pill).toBeHidden()

    const response = await context.request.get('/api/v1/transactions')
    const { data } = (await response.json()) as { data: LedgerRow[] }
    expect(data).toEqual([])
  })
})
