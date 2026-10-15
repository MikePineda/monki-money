import {
  test as base,
  devices,
  expect,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type TestInfo,
} from '@playwright/test'
import { stubTurnstile } from './turnstile.ts'

/** The synthetic E2E household seeded by `POST /api/test/reset` (apps/api e2e_seed.ts). */
export const SEEDED_OWNER = { email: 'owner@e2e.test', password: 'e2e-password-123' }

export const PASSWORD = 'e2e-password-123'

let counter = 0

/** A unique, synthetic address per call (tests run in parallel on two projects). */
export function uniqueEmail(prefix: string): string {
  counter += 1
  const random = Math.random().toString(36).slice(2, 8)
  return `${prefix}-${process.pid}-${counter}-${random}@e2e.test`
}

/**
 * A distinct client IP per test. The API trusts `CF-Connecting-IP` from a
 * loopback peer (apps/api client_ip.ts), so each test gets its own rate
 * limit buckets (sign-up and login allow 5 attempts per minute per IP).
 */
function clientIpFor(seed: string): string {
  let hash = 0
  for (const char of seed) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  }
  return `10.${(hash >>> 16) & 255}.${(hash >>> 8) & 255}.${hash & 255}`
}

export const test = base.extend({
  extraHTTPHeaders: async ({}, use, testInfo) => {
    await use({ 'CF-Connecting-IP': clientIpFor(`${testInfo.testId}-${testInfo.retry}`) })
  },
  // Cloudflare Turnstile is served by a stand-in (see turnstile.ts).
  context: async ({ context }, use) => {
    await stubTurnstile(context)
    await use(context)
  },
})

export { expect }

/**
 * A second device for the same test (another person, or the same person on
 * another phone): the project's device profile, fresh storage, its own IP.
 */
export async function newDevice(browser: Browser, info: TestInfo): Promise<BrowserContext> {
  const device = info.project.name === 'mobile-webkit' ? devices['iPhone 14'] : devices['Pixel 7']
  const context = await browser.newContext({
    ...device,
    baseURL: info.project.use.baseURL,
    extraHTTPHeaders: { 'CF-Connecting-IP': clientIpFor(`${info.testId}-device-${info.retry}`) },
  })
  await stubTurnstile(context)
  return context
}

/** The XSRF token the API set as a cookie (sent back as X-XSRF-TOKEN on mutations). */
export async function xsrfToken(context: BrowserContext): Promise<string> {
  const cookie = (await context.cookies()).find((item) => item.name === 'XSRF-TOKEN')
  if (!cookie) {
    throw new Error('No XSRF-TOKEN cookie: make a GET request first')
  }
  return decodeURIComponent(cookie.value)
}

interface CapturedMail {
  to: string[]
  subject: string
  links: string[]
  /** The 6-digit verification codes in the body. */
  codes: string[]
  sentAt: string
}

/** The test-only outbox (`GET /api/test/outbox`), newest mail last. */
async function outbox(request: APIRequestContext): Promise<CapturedMail[]> {
  const response = await request.get('/api/test/outbox')
  expect(response.ok(), 'GET /api/test/outbox').toBe(true)
  return ((await response.json()) as { data: CapturedMail[] }).data
}

/**
 * The newest link containing `fragment` mailed to `email`, read from the
 * test-only outbox (`GET /api/test/outbox`). Polls briefly: mails are sent
 * in the request, but the UI may still be waiting for the response.
 */
export async function mailedLink(
  request: APIRequestContext,
  email: string,
  fragment: string
): Promise<string> {
  let found: string | undefined
  await expect
    .poll(
      async () => {
        found = (await outbox(request))
          .filter((mail) => mail.to.includes(email))
          .flatMap((mail) => mail.links)
          .filter((link) => link.includes(fragment))
          .at(-1)
        return found
      },
      { message: `a mail to ${email} with a link containing ${fragment}` }
    )
    .toBeTruthy()
  return new URL(found as string).pathname + new URL(found as string).search
}

/** The newest 6-digit verification code mailed to `email` (polled like {@link mailedLink}). */
export async function mailedCode(request: APIRequestContext, email: string): Promise<string> {
  let found: string | undefined
  await expect
    .poll(
      async () => {
        found = (await outbox(request))
          .filter((mail) => mail.to.includes(email))
          .flatMap((mail) => mail.codes)
          .at(-1)
        return found
      },
      { message: `a mail to ${email} with a verification code` }
    )
    .toBeTruthy()
  return found as string
}

export interface Account {
  email: string
  password: string
  fullName: string
}

/**
 * Signs a new owner up through the API in this browser context (so the
 * page is logged in too), confirms the email through the outbox link and,
 * unless `onboarded` is false, adds an account so the app skips onboarding.
 */
export async function signUpOwner(
  context: BrowserContext,
  options: { fullName?: string; onboarded?: boolean } = {}
): Promise<Account> {
  const request = context.request
  const account = {
    email: uniqueEmail('owner'),
    password: PASSWORD,
    fullName: options.fullName ?? 'Robin Example',
  }
  await request.get('/api/v1/config')
  const signup = await request.post('/api/v1/auth/signup', {
    headers: { 'X-XSRF-TOKEN': await xsrfToken(context) },
    data: { ...account, locale: 'en' },
  })
  expect(signup.status(), await signup.text()).toBe(201)

  const link = await mailedLink(request, account.email, '/verify-email?token=')
  const token = new URL(link, 'http://localhost').searchParams.get('token')
  const verify = await request.post('/api/v1/auth/email/verify', {
    headers: { 'X-XSRF-TOKEN': await xsrfToken(context) },
    data: { token },
  })
  expect(verify.ok(), await verify.text()).toBe(true)

  if (options.onboarded !== false) {
    const created = await request.post('/api/v1/accounts', {
      headers: { 'X-XSRF-TOKEN': await xsrfToken(context) },
      data: { name: 'Cash', kind: 'cash' },
    })
    expect(created.status(), await created.text()).toBe(201)
  }
  return account
}
