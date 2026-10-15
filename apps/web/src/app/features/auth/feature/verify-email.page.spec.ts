import { Component, computed, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed'
import { Router, provideRouter } from '@angular/router'
import { RouterTestingHarness } from '@angular/router/testing'
import { i18nTesting, i18nTestingProviders } from '../../../../testing/i18n-testing'
import { aUser, httpError, validationError } from '../../../../testing/session-fixtures'
import { AuthApi } from '../../../core/auth/auth.api'
import { SessionStore } from '../../../core/auth/session.store'
import { TextFieldHarness } from '../../../shared/ui/text-field/text-field.harness'
import authEn from '../i18n/en.json'
import VerifyEmailPage from './verify-email.page'

@Component({ template: '<p>landed</p>' })
class Landing {}

describe('VerifyEmailPage', () => {
  let api: {
    verifyEmail: ReturnType<typeof vi.fn>
    verifyCode: ReturnType<typeof vi.fn>
    resendVerification: ReturnType<typeof vi.fn>
  }
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
      verifyCode: vi.fn(async () => undefined),
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
    expect(resend().textContent).toContain('Send a new email')
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

  describe('the 6-digit code', () => {
    async function codeField(harness: RouterTestingHarness) {
      const root = harness.fixture.nativeElement as HTMLElement
      await vi.waitFor(() =>
        expect(root.querySelector('[data-testid="verify.code"]')).not.toBeNull()
      )
      const loader = TestbedHarnessEnvironment.loader(harness.fixture)
      return loader.getHarness(TextFieldHarness.with({ label: '6-digit code' }))
    }

    it('test_the_field_suits_one_time_codes_on_a_phone', async () => {
      const { root } = await setup('/verify-email')
      await vi.waitFor(() =>
        expect(root.querySelector('[data-testid="verify.code"]')).not.toBeNull()
      )

      const input = root.querySelector<HTMLInputElement>('[data-testid="verify.code"] input')
      expect(input?.getAttribute('inputmode')).toBe('numeric')
      expect(input?.getAttribute('autocomplete')).toBe('one-time-code')
    })

    it('test_six_digits_submit_themselves_and_continue_like_the_link', async () => {
      const { harness } = await setup('/verify-email', { loadVerifies: true })
      const code = await codeField(harness)

      await code.setValue('123456')

      await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/month'))
      expect(api.verifyCode).toHaveBeenCalledTimes(1)
      expect(api.verifyCode).toHaveBeenCalledWith('123456')
      expect(session['load']).toHaveBeenCalled()
    })

    it('test_a_pasted_code_with_spaces_or_dashes_is_read_as_its_digits', async () => {
      const { harness } = await setup('/verify-email', { loadVerifies: true })
      const code = await codeField(harness)

      await code.setValue('123 - 456')

      await vi.waitFor(() => expect(api.verifyCode).toHaveBeenCalledWith('123456'))
    })

    it('test_fewer_than_six_digits_wait_with_the_confirm_button_disabled', async () => {
      const { harness, root } = await setup('/verify-email')
      const code = await codeField(harness)

      await code.setValue('12345')
      await harness.fixture.whenStable()

      expect(api.verifyCode).not.toHaveBeenCalled()
      expect(
        root.querySelector<HTMLButtonElement>('[data-testid="verify.codeSubmit"]')?.disabled
      ).toBe(true)
    })

    it('test_a_wrong_expired_or_locked_code_shows_the_api_message_under_the_field', async () => {
      const { harness } = await setup('/verify-email')
      api.verifyCode.mockRejectedValueOnce(
        validationError({ code: 'This code has expired. Ask for a new email to get another one' })
      )
      const code = await codeField(harness)

      await code.setValue('123456')

      await vi.waitFor(async () =>
        expect(await code.getMessage()).toContain('This code has expired')
      )
      expect(await code.isInvalid()).toBe(true)
      expect(TestBed.inject(Router).url).toBe('/verify-email')
    })

    it('test_a_rejected_code_without_its_own_message_gets_the_generic_wording', async () => {
      const { harness } = await setup('/verify-email')
      api.verifyCode.mockRejectedValueOnce(httpError(422, { errors: [] }))
      const code = await codeField(harness)

      await code.setValue('123456')

      await vi.waitFor(async () =>
        expect(await code.getMessage()).toContain('This code is not right.')
      )
    })

    it('test_typing_again_clears_the_error_and_tries_the_new_code', async () => {
      const { harness } = await setup('/verify-email', { loadVerifies: true })
      api.verifyCode.mockRejectedValueOnce(
        validationError({ code: 'This code is not right. Check the email and try again' })
      )
      const code = await codeField(harness)
      await code.setValue('111111')
      await vi.waitFor(async () => expect(await code.isInvalid()).toBe(true))

      await code.setValue('222222')

      await vi.waitFor(() => expect(api.verifyCode).toHaveBeenLastCalledWith('222222'))
      await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/month'))
    })

    it('test_too_many_wrong_codes_in_a_minute_say_when_to_try_again', async () => {
      const { harness, root } = await setup('/verify-email')
      api.verifyCode.mockRejectedValueOnce(httpError(429, {}, { 'Retry-After': '1200' }))
      const code = await codeField(harness)

      await code.setValue('123456')

      await vi.waitFor(() =>
        expect(root.querySelector('[data-testid="verify.notice"]')?.textContent).toContain(
          'Try again in 20 minutes.'
        )
      )
    })
  })
})
