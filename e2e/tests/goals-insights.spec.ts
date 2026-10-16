import { GoalDetailPage, GoalFormPage, GoalsPage } from '../pages/goals.page.ts'
import { MonthPage } from '../pages/month.page.ts'
import { SettingsPage } from '../pages/settings.page.ts'
import { expect, signUpOwner, test, xsrfToken } from '../support/fixtures.ts'

/** The fake LLM's English fixture (apps/api tests/fixtures/llm/insight.json). */
const FIXTURE_HEADLINE = 'You kept more than a third of your income this month'

/** The first day of the month `back` months before `firstOfMonth` ('YYYY-MM-01'). */
function firstOfMonthsBefore(firstOfMonth: string, back: number): string {
  const [year = 0, month = 1] = firstOfMonth.split('-').map(Number)
  const index = year * 12 + (month - 1) - back
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}-01`
}

test.describe('journey: savings goals and the monthly summary', () => {
  test('a goal with a starting amount and a contribution gets a date, and reaching it moves it to Reached', async ({
    page,
    context,
  }) => {
    await signUpOwner(context)

    // More → Savings goals: nothing yet, one action.
    const settings = new SettingsPage(page)
    await settings.goto()
    await settings.goals.click()
    const goals = new GoalsPage(page)
    await goals.waitReady()
    await expect(goals.empty).toContainText('No savings goals yet')

    // $3,000 target, $500 already saved, $250 a month: 10 months to go.
    await goals.addButton.click()
    await expect(page).toHaveURL(/\/goals\/new$/)
    const form = new GoalFormPage(page)
    await form.name.fill('Holiday')
    await form.amount('target', '3', '0', '0', '0', '00')
    await expect(page.getByTestId('goals.form.target')).toHaveText('$3,000.00')
    await form.amount('starting', '5', '0', '0', '00')
    await form.choose('Monthly contribution', 'Set an amount')
    await form.amount('monthly', '2', '5', '0', '00')
    await form.submit.click()

    await expect(page).toHaveURL(/\/goals\/\d+$/)
    const detail = new GoalDetailPage(page)
    await detail.waitReady()
    await expect(detail.name).toHaveText('Holiday')
    await expect(detail.saved).toHaveText('$500.00')
    await expect(detail.stat('months')).toHaveText('10 months')
    await expect(detail.stat('date')).toHaveText(/^\p{L}+ \d{4}$/u)
    await expect(detail.stat('rate')).toHaveText('$250')
    await expect(detail.chart).toBeVisible()

    // Mark it as reached: the badge says so, and the list files it under Reached.
    await detail.markReached.click()
    await expect(detail.badge).toHaveText('Reached')
    await expect(detail.reachedOn).toHaveText(/^\s*Reached on \d{1,2} \p{L}+\s*$/u)
    await detail.back.click()
    await expect(page).toHaveURL(/\/goals$/)
    await goals.waitReady()
    await expect(goals.card('Holiday')).toHaveCount(0)
    await goals.show('reached')
    await expect(goals.card('Holiday')).toBeVisible()
    await expect(goals.badge('Holiday')).toHaveText('Reached')
    await expect(goals.card('Holiday').getByTestId('goals.card.outlook')).toContainText(
      'Reached on'
    )
  })

  test('a goal tracking an account draws its past months and, at its target, is marked reached and reopened', async ({
    page,
    context,
  }) => {
    await signUpOwner(context)
    const request = context.request
    const headers = { 'X-XSRF-TOKEN': await xsrfToken(context) }

    // A synthetic savings account: $500 in on the 1st of each of the last six
    // months and of this one, so $3,500 by now.
    const account = await request.post('/api/v1/accounts', {
      headers,
      data: { name: 'Trip savings', kind: 'savings' },
    })
    expect(account.status(), await account.text()).toBe(201)
    const accountId = ((await account.json()) as { data: { id: number } }).data.id
    const report = await request.get('/api/v1/reports/month')
    const { from } = ((await report.json()) as { data: { from: string } }).data
    for (let back = 6; back >= 0; back--) {
      const deposit = await request.post('/api/v1/transactions', {
        headers,
        data: {
          accountId,
          kind: 'income',
          date: firstOfMonthsBefore(from, back),
          amountCents: 50_000,
          payee: 'Savings deposit',
        },
      })
      expect(deposit.status(), await deposit.text()).toBe(201)
    }
    // Its goal is exactly what the account holds.
    const goal = await request.post('/api/v1/goals', {
      headers,
      data: { name: 'Bali trip', targetCents: 350_000, accountId },
    })
    expect(goal.status(), await goal.text()).toBe(201)

    // The list reads every projection with the goals, in one request.
    const perGoal: string[] = []
    page.on('request', (sent) => {
      if (/\/api\/v1\/goals\/\d+\/projection/.test(sent.url())) perGoal.push(sent.url())
    })
    const goals = new GoalsPage(page)
    await goals.goto()
    await expect(goals.badge('Bali trip')).toHaveText('Reached')
    await expect(goals.card('Bali trip').getByTestId('goals.card.outlook')).toContainText(
      'Target met'
    )
    expect(perGoal).toEqual([])

    // The detail: the actual line runs through seven month ends, and
    // "Mark as reached" leads.
    await goals.open('Bali trip')
    const detail = new GoalDetailPage(page)
    await detail.waitReady()
    await expect(detail.saved).toHaveText('$3,500.00')
    await expect(detail.actualPoints).toHaveCount(7)
    await expect(detail.atTarget).toContainText('You reached your target')
    await detail.atTarget.getByTestId('goal.markReached').click()

    await expect(detail.badge).toHaveText('Reached')
    await expect(detail.reachedOn).toHaveText(/^\s*Reached on \d{1,2} \p{L}+\s*$/u)
    await expect(detail.atTarget).toHaveCount(0)

    // Filed under Reached with its badge; reopening brings the prompt back.
    await detail.back.click()
    await goals.waitReady()
    await goals.show('reached')
    await expect(goals.badge('Bali trip')).toHaveText('Reached')
    await goals.open('Bali trip')
    await detail.waitReady()
    await detail.reopen.click()
    await expect(detail.badge).toHaveCount(0)
    await expect(detail.reachedOn).toHaveCount(0)
    await expect(detail.atTarget).toBeVisible()
  })

  test('the month summary is written on request and can be regenerated', async ({
    page,
    context,
  }) => {
    await signUpOwner(context)
    // One expense today, so the month has something to summarise.
    const created = await context.request.post('/api/v1/transactions/quick', {
      headers: { 'X-XSRF-TOKEN': await xsrfToken(context) },
      data: { amountCents: 4250, payee: 'Corner Grocer' },
    })
    expect(created.status(), await created.text()).toBe(201)

    const month = new MonthPage(page)
    await month.goto()
    await expect(month.summary).toContainText('Get your summary for')

    await month.summary.getByTestId('month.summary.generate').click()
    await expect(month.summaryHeadline).toHaveText(FIXTURE_HEADLINE)
    await expect(month.summary.getByTestId('month.summary.updated')).toContainText('Written by AI')
    await expect(month.summary.getByTestId('month.summary.highlight')).toHaveCount(3)

    // Regenerate asks the model again (201, fresh) and the card keeps working.
    const regenerated = page.waitForResponse(
      (response) =>
        response.url().includes('/api/v1/insights/') &&
        response.url().endsWith('/generate') &&
        response.request().method() === 'POST'
    )
    await month.regenerateSummary()
    const response = await regenerated
    expect(response.status()).toBe(201)
    expect(((await response.json()) as { data: { fresh: boolean } }).data.fresh).toBe(true)
    await expect(month.summaryHeadline).toHaveText(FIXTURE_HEADLINE)

    // A reload reads the stored summary instead of offering to generate one.
    await page.reload()
    await month.waitReady()
    await expect(month.summaryHeadline).toHaveText(FIXTURE_HEADLINE)
  })
})
