import { TagsPage } from '../pages/tags.page.ts'
import { TransactionsPage } from '../pages/transactions.page.ts'
import { expect, signUpOwner, test, xsrfToken } from '../support/fixtures.ts'

const TRIP = 'Bali 2027'

test.describe('journey: tag a trip and see what it cost', () => {
  test('a tag added from the sheet filters the transactions and adds up on its screen', async ({
    page,
    context,
  }) => {
    await signUpOwner(context)
    // Two expenses today (quick add: the household's only account).
    for (const [amountCents, payee] of [
      [4250, 'Warung Pantai'],
      [1999, 'Corner Grocer'],
    ] as const) {
      const created = await context.request.post('/api/v1/transactions/quick', {
        headers: { 'X-XSRF-TOKEN': await xsrfToken(context) },
        data: { amountCents, payee },
      })
      expect(created.status(), await created.text()).toBe(201)
    }

    // Tag one of them from its sheet.
    const transactions = new TransactionsPage(page)
    await transactions.goto()
    await transactions.open('Warung Pantai')
    await transactions.addTag(TRIP)
    await transactions.save()
    await expect(transactions.toast).toContainText('Changes saved.')
    await expect(page).toHaveURL(/\/transactions$/)

    // Filter the list by the tag: only the tagged expense stays.
    await transactions.filterByTag(TRIP)
    await expect(transactions.row('Warung Pantai')).toContainText('−$42.50')
    await expect(transactions.row('Corner Grocer')).toHaveCount(0)

    // More → Tags lists it with its total; its screen adds it up.
    const tags = new TagsPage(page)
    await tags.openFromMore()
    await expect(tags.row(TRIP)).toContainText('Spent $42.50')
    await tags.open(TRIP)
    await expect(page).toHaveURL(/\/tags\/Bali%202027$/)
    await expect(tags.spent).toHaveText('$42.50')
    await expect(tags.meta).toContainText('1 transaction')

    // Straight to /tags/<tag>, then on to the transactions it groups.
    await tags.goto(TRIP)
    await expect(tags.spent).toHaveText('$42.50')
    await tags.seeTransactions()
    await expect(page).toHaveURL(/\/transactions\?tag=Bali%202027$/)
    await expect(transactions.filterChip('tag')).toContainText(TRIP)
    await expect(transactions.row('Warung Pantai')).toBeVisible()
    await expect(transactions.row('Corner Grocer')).toHaveCount(0)
  })
})
test.describe('journey: tag several transactions at once and rename the tag', () => {
  test('a bulk tag lands on every picked row and a rename keeps them together', async ({
    page,
    context,
  }) => {
    await signUpOwner(context)
    for (const [amountCents, payee] of [
      [4250, 'Warung Pantai'],
      [1999, 'Surf School'],
      [500, 'Corner Grocer'],
    ] as const) {
      const created = await context.request.post('/api/v1/transactions/quick', {
        headers: { 'X-XSRF-TOKEN': await xsrfToken(context) },
        data: { amountCents, payee },
      })
      expect(created.status(), await created.text()).toBe(201)
    }

    // Movements → Select two rows → Tag.
    const transactions = new TransactionsPage(page)
    await transactions.goto()
    await transactions.select('Warung Pantai', 'Surf School')
    await transactions.bulkTag('bali')
    await expect(transactions.toast).toContainText('Tags changed on 2 transactions.')
    await expect(page.getByTestId('transactions.bulk')).toHaveCount(0)

    // The tag adds both up; renaming it fixes its case everywhere.
    const tags = new TagsPage(page)
    await tags.goto('bali')
    await expect(tags.spent).toHaveText('$62.49')
    await tags.rename(TRIP)
    await expect(page).toHaveURL(/\/tags\/Bali%202027$/)
    await expect(tags.meta).toContainText('2 transactions')
    await expect(tags.spent).toHaveText('$62.49')

    // Last year has none of it; all time lists it again.
    await tags.openFromMore()
    await expect(tags.row(TRIP)).toContainText('Spent $62.49')
    await tags.choosePeriod('Last year')
    await expect(page).toHaveURL(/\/tags\?period=lastYear$/)
    await expect(page.getByTestId('tags.emptyPeriod')).toBeVisible()
    await tags.choosePeriod('All time')
    await expect(tags.row(TRIP)).toBeVisible()
  })
})
