import { fileURLToPath } from 'node:url'
import { defineConfig, devices } from '@playwright/test'

/**
 * E2E suite against the real stack: the production build of the API
 * (apps/api/build) serving the production build of the Angular app, backed
 * by the ephemeral docker-compose.test.yml services. Run it with
 * `npm run e2e` (builds, starts the stack, migrates, runs, tears down).
 *
 * scripts/e2e.sh picks the run's E2E slot and exports what depends on it:
 * the API port (PORT, also the API's own) and the result and report folders,
 * so runs from two checkouts at once never share a port or a folder.
 */
process.loadEnvFile(fileURLToPath(new URL('./e2e.env', import.meta.url)))

if (!process.env.PORT) {
  throw new Error(
    'PORT is not set: run the suite through scripts/e2e.sh (`npm run e2e`), which starts the stack for an E2E slot and exports its ports.'
  )
}
const baseURL = `http://127.0.0.1:${process.env.PORT}`

/** E2E_WORKERS as Playwright takes it: a count, or a share like "50%". */
function workersFromEnv(value: string | undefined): number | string | undefined {
  if (!value) {
    return undefined
  }
  return value.endsWith('%') ? value : Number(value)
}

export default defineConfig({
  testDir: './tests',
  outputDir: process.env.E2E_RESULTS_DIR,
  // Fewer workers while another slot runs (scripts/e2e.sh); unset = Playwright's default.
  workers: workersFromEnv(process.env.E2E_WORKERS),
  globalSetup: './global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never', outputFolder: process.env.E2E_REPORT_DIR }]]
    : [['list']],
  use: {
    baseURL,
    // The app's first language follows the device (navigator.languages): pin it.
    locale: 'en-AU',
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
