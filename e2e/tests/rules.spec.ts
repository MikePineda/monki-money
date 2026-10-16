import { RulesPage } from '../pages/rules.page.ts'
import { expect, signUpOwner, test } from '../support/fixtures.ts'

test.describe('journey: merchant rules', () => {
  test('a rule written on the rules screen is listed and survives a reload', async ({
    page,
    context,
  }) => {
    await signUpOwner(context)
    const rules = new RulesPage(page)
    await rules.goto()

    await rules.startNew()
    await rules.chooseMatchType('Contains')
    await rules.fillPattern('GARDEN NOOK')
    await rules.chooseCategory('Gifts')
    expect(await rules.save()).toBe(201)

    const row = rules.row('GARDEN NOOK')
    await expect(row).toContainText('Gifts')
    await expect(row).toContainText('Contains · No matches yet · Yours')

    await page.reload()
    await expect(rules.row('GARDEN NOOK')).toContainText('Gifts')
  })
})
