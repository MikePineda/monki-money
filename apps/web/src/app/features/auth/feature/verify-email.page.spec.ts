import { Component, computed, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { Router, provideRouter } from '@angular/router'
import { RouterTestingHarness } from '@angular/router/testing'
import { i18nTesting, i18nTestingProviders } from '../../../../testing/i18n-testing'
import { aUser, httpError } from '../../../../testing/session-fixtures'
import { AuthApi } from '../../../core/auth/auth.api'
import { SessionStore } from '../../../core/auth/session.store'
import authEn from '../i18n/en.json'
import VerifyEmailPage from './verify-email.page'

@Component({ template: '<p>landed</p>' })
class Landing {}

describe('VerifyEmailPage', () => {
  let api: { verifyEmail: ReturnType<typeof vi.fn>; resendVerification: ReturnType<typeof vi.fn> }
  let verified: ReturnType<typeof signal<boolean>>
  let session: Record<string, unknown>

  interface Options {
    authenticated?: boolean
    tokenValid?: boolean
    /** The next `GET /auth/me` reports the email as verified. */
    loadVerifies?: boolean
  }

  async function setup(url: string, options: Options = {}) {
    api = {
      verifyEmail: vi.fn(async () => {
        if (options.tokenValid === false) {
          throw httpError(400, { code: 'E_INVALID_TOKEN' })
        }
      }),
      resendVerification: vi.fn(async () => undefined),
    }
    verified = signal(false)
    const authenticated = signal(options.authenticated ?? true)
    session = {
      isAuthenticated: authenticated,
      isVerified: verified,
      user: signal(aUser({ emailVerifiedAt: null })),
      homePath: computed(() => {
        if (!authenticated()) {
          return '/login'
        }
        return verified() ? '/month' : '/verify-email'
      }),
      load: vi.fn(async () => {
        if (options.loadVerifies) {
          verified.set(true)
        }
      }),
      logout: vi.fn(async () => undefined),
    }
    TestBed.configureTestingModule({
      imports: [i18nTesting({ scopes: { 'auth/en': authEn } })],
      providers: [
        i18nTestingProviders(),
        provideRouter([
          { path: 'verify-email', component: VerifyEmailPage },
          { path: '**', component: Landing },
        ]),
        { provide: AuthApi, useValue: api },
        { provide: SessionStore, useValue: session },
      ],
    })
    const harness = await RouterTestingHarness.create(url)
    const root = harness.fixture.nativeElement as HTMLElement
    return { harness, root }
  }

  afterEach(() => vi.useRealTimers())

  it('test_pending_shows_the_address_and_resend_waits_60_seconds_between_sends', async () => {
    const { harness, root } = await setup('/verify-email')
    await vi.waitFor(() =>
      expect(root.querySelector('[data-testid="verify.pending"]')).not.toBeNull()
    )
    expect(root.textContent).toContain('sam@example.test')
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const resend = () => root.querySelector<HTMLButtonElement>('[data-testid="verify.resend"]')!

    resend().click()
    await vi.waitFor(() => expect(api.resendVerification).toHaveBeenCalledTimes(1))
    await harness.fixture.whenStable()
    expect(resend().disabled).toBe(true)
    expect(resend().textContent).toContain('Send again in 60 s')

    vi.advanceTimersByTime(59_000)
    await harness.fixture.whenStable()
    expect(resend().textContent).toContain('Send again in 1 s')

    vi.advanceTimersByTime(1_000)
    await harness.fixture.whenStable()
    expect(resend().disabled).toBe(false)
    expect(resend().textContent).toContain('Send the link again')
  })

  it('test_coming_back_to_the_app_refreshes_the_session_and_moves_on_once_verified', async () => {
    await setup('/verify-email', { loadVerifies: true })

    document.dispatchEvent(new Event('visibilitychange'))

    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/month'))
  })

  it('test_the_emailed_link_confirms_the_address_then_continues', async () => {
    const { root } = await setup('/verify-email?token=abc', { loadVerifies: true })

    await vi.waitFor(() =>
      expect(root.querySelector('[data-testid="verify.confirmed"]')).not.toBeNull()
    )
    expect(api.verifyEmail).toHaveBeenCalledWith('abc')
    root.querySelector<HTMLButtonElement>('[data-testid="verify.continue"]')?.click()

    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/month'))
  })

  it('test_an_invalid_link_is_honest', async () => {
    const { root } = await setup('/verify-email?token=bad', {
      authenticated: false,
      tokenValid: false,
    })

    await vi.waitFor(() =>
      expect(root.querySelector('[data-testid="verify.invalid"]')).not.toBeNull()
    )
  })

  it('test_a_guest_without_a_token_is_sent_to_login', async () => {
    await setup('/verify-email', { authenticated: false })

    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/login'))
  })
})
