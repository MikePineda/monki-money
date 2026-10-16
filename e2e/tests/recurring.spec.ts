import { LoginPage } from '../pages/login.page.ts'
import { MonthPage } from '../pages/month.page.ts'
import { RecurringPage } from '../pages/recurring.page.ts'
import { SEEDED_OWNER, expect, test } from '../support/fixtures.ts'

/** The synthetic payee the E2E seed pays every week before this month (apps/api e2e_seed.ts). */
const WEEKLY_PAYEE = 'Harbourview Lettings'

test.describe('journey: recurring payments and what is committed this month', () => {
  test('detecting the weekly rent fills the committed card and the recurring list', async ({
    page,
  }) => {
    const login = new LoginPage(page)
    await login.goto()
    await login.logIn(SEEDED_OWNER.email, SEEDED_OWNER.password)
    await expect(page).toHaveURL(/\/month$/)
    const month = new MonthPage(page)
    await month.waitReady()

    // Both device projects share the seeded household: the first run detects
    // the rent, the other one finds it already detected (detection is idempotent).
    await expect(month.committed.or(month.committedHint)).toBeVisible()
    if (await month.committedHint.isVisible()) {
      await month.committedHint.getByRole('button', { name: 'Detect recurring payments' }).click()
    }
    await expect(month.committed).toBeVisible()
    await expect(month.committed).toContainText('Committed this month')
    await expect(month.committed.getByTestId('month.committed.paid')).toContainText('Already paid')
    await expect(month.committed.getByTestId('month.committed.due')).toContainText('Still due')
    await expect(month.committed.getByTestId('month.committed.free')).toContainText(
      'Free after bills'
    )
    // The rent was all paid last month: the month itself stays empty.
    await expect(month.empty).toBeVisible()

    // The card leads to the list, where the rent is a weekly payment.
    await month.committed.getByRole('link', { name: 'Recurring payments' }).click()
    await expect(page).toHaveURL(/\/recurring$/)
    const recurring = new RecurringPage(page)
    await recurring.waitReady()
    await expect(recurring.row(WEEKLY_PAYEE)).toContainText('Weekly')
    await expect(recurring.row(WEEKLY_PAYEE)).toContainText('$450.00')
  })
})
