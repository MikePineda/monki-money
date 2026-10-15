import { TestBed } from '@angular/core/testing'
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed'
import { provideRouter } from '@angular/router'
import { RouterTestingHarness } from '@angular/router/testing'
import { i18nTesting, i18nTestingProviders } from '../../../../testing/i18n-testing'
import { clearTurnstile, fakeTurnstile } from '../../../../testing/turnstile-testing'
import { AuthApi } from '../../../core/auth/auth.api'
import { TURNSTILE_SCRIPT_URL } from '../../../core/auth/turnstile.service'
import { ButtonHarness } from '../../../shared/ui/button/button.harness'
import { TextFieldHarness } from '../../../shared/ui/text-field/text-field.harness'
import authEn from '../i18n/en.json'
import ForgotPasswordPage from './forgot-password.page'

describe('ForgotPasswordPage', () => {
  let api: { forgotPassword: ReturnType<typeof vi.fn>; config: ReturnType<typeof vi.fn> }

  async function setup(options: { siteKey?: string } = {}) {
    api = {
      forgotPassword: vi.fn(async () => undefined),
      config: vi.fn(async () => ({
        registrationOpen: true,
        turnstileSiteKey: options.siteKey ?? null,
      })),
    }
    TestBed.configureTestingModule({
      imports: [i18nTesting({ scopes: { 'auth/en': authEn } })],
      providers: [
        i18nTestingProviders(),
        provideRouter([{ path: 'forgot-password', component: ForgotPasswordPage }]),
        { provide: AuthApi, useValue: api },
      ],
    })
    const harness = await RouterTestingHarness.create('/forgot-password')
    const loader = TestbedHarnessEnvironment.loader(harness.fixture)
    const root = harness.fixture.nativeElement as HTMLElement
    await vi.waitFor(() => expect(root.querySelector('h1')).not.toBeNull())
    const email = await loader.getHarness(TextFieldHarness.with({ label: 'Email' }))
    const submit = await loader.getHarness(ButtonHarness.with({ text: 'Send link' }))
    return { harness, root, email, submit }
  }

  afterEach(() => {
    clearTurnstile()
    document.head.querySelector(`script[src="${TURNSTILE_SCRIPT_URL}"]`)?.remove()
  })

  it('test_without_a_site_key_the_request_carries_only_the_email', async () => {
    const { root, email, submit } = await setup()

    await email.setValue('Sam@Example.test')
    await submit.click()

    await vi.waitFor(() => expect(root.querySelector('[data-testid="forgot.sent"]')).not.toBeNull())
    expect(api.forgotPassword).toHaveBeenCalledWith({ email: 'sam@example.test' })
  })

  it('test_with_a_site_key_the_request_waits_for_the_check_and_carries_its_token', async () => {
    const turnstile = fakeTurnstile()
    const { harness, email, submit } = await setup({ siteKey: 'site-key' })
    await vi.waitFor(() => expect(turnstile.render).toHaveBeenCalled())

    await email.setValue('sam@example.test')
    expect(await submit.isDisabled()).toBe(true)
    turnstile.solve('token-1')
    await harness.fixture.whenStable()
    await submit.click()

    await vi.waitFor(() =>
      expect(api.forgotPassword).toHaveBeenCalledWith({
        email: 'sam@example.test',
        turnstileToken: 'token-1',
      })
    )
  })

  it('test_when_the_check_cannot_load_it_says_so_and_the_button_stays_disabled', async () => {
    const { harness, root, email, submit } = await setup({ siteKey: 'site-key' })
    await vi.waitFor(() =>
      expect(document.head.querySelector(`script[src="${TURNSTILE_SCRIPT_URL}"]`)).not.toBeNull()
    )

    document.head
      .querySelector(`script[src="${TURNSTILE_SCRIPT_URL}"]`)
      ?.dispatchEvent(new Event('error'))
    await email.setValue('sam@example.test')
    await harness.fixture.whenStable()

    await vi.waitFor(() =>
      expect(root.querySelector('[data-testid="turnstile.unavailable"]')).not.toBeNull()
    )
    expect(await submit.isDisabled()).toBe(true)
    expect(api.forgotPassword).not.toHaveBeenCalled()
  })
})
