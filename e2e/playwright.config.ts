import { fileURLToPath } from 'node:url'
import { defineConfig, devices } from '@playwright/test'

/**
 * E2E suite against the real stack: the production build of the API
 * (apps/api/build) serving the production build of the Angular app, backed
 * by the ephemeral docker-compose.test.yml services. Run it with
 * `npm run e2e` (builds, starts the stack, migrates, runs, tears down).
 */
process.loadEnvFile(fileURLToPath(new URL('./e2e.env', import.meta.url)))

const port = Number(process.env.PORT ?? 3334)
const baseURL = `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL,
    testIdAttribute: 'data-testid',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
    { name: 'mobile-webkit', use: { ...devices['iPhone 14'] } },
  ],
  webServer: {
    command: 'node bin/server.js',
    cwd: fileURLToPath(new URL('../apps/api/build', import.meta.url)),
    url: `${baseURL}/api/health/live`,
    reuseExistingServer: false,
    timeout: 60_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
