import { Component } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed'
import { Router, provideRouter } from '@angular/router'
import { RouterTestingHarness } from '@angular/router/testing'
import { i18nTesting, i18nTestingProviders } from '../../../../testing/i18n-testing'
import { validationError } from '../../../../testing/session-fixtures'
import { clearTurnstile, fakeTurnstile } from '../../../../testing/turnstile-testing'
import { AuthApi } from '../../../core/auth/auth.api'
import { SessionStore } from '../../../core/auth/session.store'
import { TURNSTILE_SCRIPT_URL } from '../../../core/auth/turnstile.service'
import { LANG_STORAGE_KEY, LangStore } from '../../../core/i18n/lang.store'
import { ButtonHarness } from '../../../shared/ui/button/button.harness'
import { TextFieldHarness } from '../../../shared/ui/text-field/text-field.harness'
import SignupPage from './signup.page'

@Component({ template: '<p>landed</p>' })
class Landing {}

describe('SignupPage', () => {
  let api: { signup: ReturnType<typeof vi.fn>; config: ReturnType<typeof vi.fn> }
  let session: { load: ReturnType<typeof vi.fn> }

  async function setup(options: { siteKey?: string } = {}) {
    api = {
      signup: vi.fn(async () => undefined),
      config: vi.fn(async () => ({
        registrationOpen: true,
        turnstileSiteKey: options.siteKey ?? null,
      })),
    }
    session = { load: vi.fn(async () => undefined) }
    TestBed.configureTestingModule({
      imports: [i18nTesting()],
      providers: [
        i18nTestingProviders(),
        provideRouter([
          { path: 'signup', component: SignupPage },
          { path: '**', component: Landing },
        ]),
        { provide: AuthApi, useValue: api },
        { provide: SessionStore, useValue: session },
      ],
    })
    const harness = await RouterTestingHarness.create('/signup')
    const loader = TestbedHarnessEnvironment.loader(harness.fixture)
    const root = harness.fixture.nativeElement as HTMLElement
    await vi.waitFor(() => expect(root.querySelector('h1')?.textContent).toContain('Create'))
    const submit = await loader.getHarness(ButtonHarness.with({ text: 'Create account' }))
    const fillIn = async () => {
      await (
        await loader.getHarness(TextFieldHarness.with({ label: 'Your name' }))
      ).setValue('Sam Rivera')
      await (
        await loader.getHarness(TextFieldHarness.with({ label: 'Email' }))
      ).setValue('Sam@Example.test')
      await (
        await loader.getHarness(TextFieldHarness.with({ label: 'Password' }))
      ).setValue('secret-password')
      root.querySelector<HTMLInputElement>('[data-testid="signup.terms"] input')?.click()
      await harness.fixture.whenStable()
    }
    return { harness, root, submit, fillIn }
  }

  afterEach(() => {
    localStorage.removeItem(LANG_STORAGE_KEY)
    document.documentElement.lang = 'en-AU'
    clearTurnstile()
    document.head.querySelector(`script[src="${TURNSTILE_SCRIPT_URL}"]`)?.remove()
  })

  it('test_success_creates_the_account_in_the_app_language_and_asks_to_confirm_the_email', async () => {
    const { submit, fillIn } = await setup()

    await fillIn()
    await submit.click()

    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/verify-email'))
    expect(api.signup).toHaveBeenCalledWith({
      fullName: 'Sam Rivera',
      email: 'sam@example.test',
      password: 'secret-password',
      locale: 'en',
    })
    expect(session.load).toHaveBeenCalled()
  })

  it('test_the_language_chosen_before_signing_up_becomes_the_accounts_language', async () => {
    const { submit, fillIn } = await setup()
    await fillIn()

    // The auth layout's switch (or a Spanish device) set the language.
    TestBed.inject(LangStore).setLang('es')
    await submit.click()

    await vi.waitFor(() => expect(api.signup).toHaveBeenCalled())
    expect(api.signup).toHaveBeenCalledWith(expect.objectContaining({ locale: 'es' }))
  })

  it('test_with_a_site_key_sign_up_waits_for_the_check_then_sends_its_token', async () => {
    const turnstile = fakeTurnstile()
    const { harness, root, submit, fillIn } = await setup({ siteKey: 'site-key' })
    await vi.waitFor(() => expect(turnstile.render).toHaveBeenCalled())
    expect(root.querySelector('[data-testid="signup.turnstile"]')).not.toBeNull()

    await fillIn()
    expect(await submit.isDisabled()).toBe(true)
    turnstile.solve('token-1')
    await harness.fixture.whenStable()
    await submit.click()

    await vi.waitFor(() =>
      expect(api.signup).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'sam@example.test', turnstileToken: 'token-1' })
      )
    )
  })

  it('test_a_rejected_check_shows_its_message_and_asks_for_a_new_token', async () => {
    const turnstile = fakeTurnstile()
    const { root, submit, fillIn, harness } = await setup({ siteKey: 'site-key' })
    await vi.waitFor(() => expect(turnstile.render).toHaveBeenCalled())
    api.signup.mockRejectedValueOnce(validationError({ turnstileToken: 'Security check failed' }))
    await fillIn()
    turnstile.solve('token-1')
    await harness.fixture.whenStable()

    await submit.click()

    await vi.waitFor(() =>
      expect(root.querySelector('[data-testid="turnstile.rejected"]')).not.toBeNull()
    )
    expect(turnstile.reset).toHaveBeenCalledWith('widget-1')
    expect(session.load).not.toHaveBeenCalled()
  })

  it('test_field_errors_from_the_api_show_under_their_inputs', async () => {
    const { root, submit, fillIn } = await setup()
    api.signup.mockRejectedValueOnce(validationError({ email: 'This email is already taken' }))

    await fillIn()
    await submit.click()

    await vi.waitFor(() =>
      expect(root.querySelector('[data-testid="signup.email"]')?.textContent).toContain(
        'This email is already taken'
      )
    )
  })
})
