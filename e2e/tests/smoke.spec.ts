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

    await expect(page.getByTestId('app.shell')).toBeVisible()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('monkimoney')
  })

  test('index.html and the service worker are never cached', async ({ request }) => {
    for (const path of ['/', '/ngsw-worker.js', '/manifest.webmanifest']) {
      const response = await request.get(path)
      expect(response.status(), path).toBe(200)
      expect(response.headers()['cache-control'], path).toBe('no-cache')
    }
  })
})
