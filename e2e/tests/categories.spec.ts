import { CategoriesPage } from '../pages/categories.page.ts'
import { SettingsPage } from '../pages/settings.page.ts'
import { expect, signUpOwner, test } from '../support/fixtures.ts'

test.describe('journey 6: reorder categories', () => {
  test('a new order survives a reload', async ({ page, context }) => {
    await signUpOwner(context)
    const categories = new CategoriesPage(page)
    await categories.goto()

    const before = await categories.names('Housing')
    expect(before.slice(0, 2)).toEqual(['Rent', 'Utilities'])

    await categories.startReordering()
    const saved = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/v1/categories/reorder') &&
        response.request().method() === 'PUT'
    )
    await categories.moveDown('Rent')
    expect((await saved).status()).toBe(204)
    expect((await categories.names('Housing')).slice(0, 2)).toEqual(['Utilities', 'Rent'])

    await page.reload()
    await expect(categories.list).toBeVisible()
    await expect
      .poll(async () => (await categories.names('Housing')).slice(0, 2))
      .toEqual(['Utilities', 'Rent'])
  })

  test('categories are reachable from settings', async ({ page, context }) => {
    await signUpOwner(context)
    const settings = new SettingsPage(page)
    await settings.goto()
    await settings.categories.click()

    await expect(page).toHaveURL(/\/categories$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Categories')
  })
})
