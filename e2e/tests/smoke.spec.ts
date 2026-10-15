import { expect, test } from '@playwright/test'

test.describe('smoke', () => {
  test('the readiness probe reports ok with version and sha', async ({ request }) => {
    const response = await request.get('/api/health')

    expect(response.status()).toBe(200)
    const body = await response.json()
    expect(body.status).toBe('ok')
    expect(body.version).toEqual(expect.any(String))
    expect(body.sha).toEqual(expect.any(String))
    expect(body.checks.database.status).toBe('ok')
  })

  test('the Angular shell renders from the API origin', async ({ page }) => {
    await page.goto('/')

    await expect(page).toHaveURL(/\/month$/)
    await expect(page.getByTestId('app.shell')).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()
    await expect(page.getByTestId('month.empty')).toBeVisible()
  })

  test('the theme is applied before the first paint', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('mm:theme', 'dark'))
    await page.goto('/month')

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  })

  test('index.html and the service worker are never cached', async ({ request }) => {
    for (const path of ['/', '/ngsw-worker.js', '/manifest.webmanifest']) {
      const response = await request.get(path)
      expect(response.status(), path).toBe(200)
      expect(response.headers()['cache-control'], path).toBe('no-cache')
    }
  })
})
