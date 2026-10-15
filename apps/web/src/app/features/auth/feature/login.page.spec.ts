import { Component, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed'
import { Router, provideRouter } from '@angular/router'
import { RouterTestingHarness } from '@angular/router/testing'
import { i18nTesting, i18nTestingProviders } from '../../../../testing/i18n-testing'
import { httpError, networkError } from '../../../../testing/session-fixtures'
import { AuthApi } from '../../../core/auth/auth.api'
import { SessionStore } from '../../../core/auth/session.store'
import { ButtonHarness } from '../../../shared/ui/button/button.harness'
import { TextFieldHarness } from '../../../shared/ui/text-field/text-field.harness'
import authEn from '../i18n/en.json'
import LoginPage from './login.page'

@Component({ template: '<p>landed</p>' })
class Landing {}

describe('LoginPage', () => {
  let api: { login: ReturnType<typeof vi.fn>; config: ReturnType<typeof vi.fn> }
  let session: { load: ReturnType<typeof vi.fn>; homePath: ReturnType<typeof signal<string>> }

  async function setup(options: { registrationOpen?: boolean; url?: string } = {}) {
    api = {
      login: vi.fn(async () => undefined),
      config: vi.fn(async () => ({ registrationOpen: options.registrationOpen ?? true })),
    }
    session = { load: vi.fn(async () => undefined), homePath: signal('/month') }
    TestBed.configureTestingModule({
      imports: [i18nTesting({ scopes: { 'auth/en': authEn } })],
      providers: [
        i18nTestingProviders(),
        provideRouter([
          { path: 'login', component: LoginPage },
          { path: '**', component: Landing },
        ]),
        { provide: AuthApi, useValue: api },
        { provide: SessionStore, useValue: session },
      ],
    })
    const harness = await RouterTestingHarness.create(options.url ?? '/login')
    const loader = TestbedHarnessEnvironment.loader(harness.fixture)
    const root = harness.fixture.nativeElement as HTMLElement
    await vi.waitFor(() => expect(root.querySelector('h1')?.textContent).toContain('Log in'))
    const email = await loader.getHarness(TextFieldHarness.with({ label: 'Email' }))
    const password = await loader.getHarness(TextFieldHarness.with({ label: 'Password' }))
    const submit = await loader.getHarness(ButtonHarness.with({ text: 'Log in' }))
    return { harness, root, email, password, submit }
  }

  afterEach(() => sessionStorage.clear())

  it('test_submit_stays_disabled_until_email_and_password_are_valid', async () => {
    const { email, password, submit } = await setup()
    expect(await submit.isDisabled()).toBe(true)

    await email.setValue('not-an-email')
    await password.setValue('secret-password')
    expect(await submit.isDisabled()).toBe(true)

    await email.setValue('sam@example.test')
    expect(await submit.isDisabled()).toBe(false)
  })

  it('test_field_errors_are_translated_global_messages_shown_once_touched', async () => {
    const { email } = await setup()

    await email.setValue('not-an-email')
    await email.blur()

    expect(await email.getMessage()).toBe('Enter a valid email address.')
  })

  it('test_wrong_credentials_show_one_generic_message', async () => {
    const { root, email, password, submit } = await setup()
    api.login.mockRejectedValueOnce(httpError(400, { errors: [{ message: 'Invalid' }] }))

    await email.setValue('sam@example.test')
    await password.setValue('wrong-password')
    await submit.click()

    await vi.waitFor(() =>
      expect(root.querySelector('[data-testid="login.error"]')?.textContent).toContain(
        'Email or password is incorrect.'
      )
    )
    expect(await email.isInvalid()).toBe(false)
    expect(session.load).not.toHaveBeenCalled()
  })

  it('test_a_throttled_login_says_when_to_try_again', async () => {
    const { root, email, password, submit } = await setup()
    api.login.mockRejectedValueOnce(httpError(429, {}, { 'Retry-After': '1200' }))

    await email.setValue('sam@example.test')
    await password.setValue('wrong-password')
    await submit.click()

    await vi.waitFor(() =>
      expect(root.querySelector('[data-testid="login.error"]')?.textContent).toContain(
        'Try again in 20 minutes.'
      )
    )
  })

  it('test_offline_keeps_what_was_typed_and_offers_a_retry', async () => {
    const { root, email, password, submit } = await setup()
    api.login.mockRejectedValueOnce(networkError())

    await email.setValue('sam@example.test')
    await password.setValue('secret-password')
    await submit.click()
    await vi.waitFor(() =>
      expect(root.querySelector('[data-testid="login.error"]')?.textContent).toContain(
        'Can’t reach monkimoney'
      )
    )

    expect(await email.getValue()).toBe('sam@example.test')
    const retry = root.querySelector<HTMLButtonElement>('[data-testid="login.error"] button')
    retry?.click()
    await vi.waitFor(() => expect(api.login).toHaveBeenCalledTimes(2))
  })

  it('test_success_loads_the_session_and_goes_home', async () => {
    const { email, password, submit } = await setup()

    await email.setValue('Sam@Example.test')
    await password.setValue('secret-password')
    await submit.click()

    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/month'))
    expect(api.login).toHaveBeenCalledWith({
      email: 'sam@example.test',
      password: 'secret-password',
    })
    expect(session.load).toHaveBeenCalled()
  })

  it('test_success_returns_to_the_page_that_asked_for_login', async () => {
    const { email, password, submit } = await setup({ url: '/login?returnUrl=%2Fsettings' })

    await email.setValue('sam@example.test')
    await password.setValue('secret-password')
    await submit.click()

    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/settings'))
  })

  it('test_success_follows_a_pending_invitation', async () => {
    sessionStorage.setItem('mm:invite', 'invite-token-123')
    const { email, password, submit } = await setup()

    await email.setValue('sam@example.test')
    await password.setValue('secret-password')
    await submit.click()

    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/invite/invite-token-123'))
  })

  it('test_create_account_shows_only_while_registration_is_open', async () => {
    const open = await setup({ registrationOpen: true })
    await vi.waitFor(() =>
      expect(open.root.querySelector('a[href="/signup"]')?.textContent).toContain('Create account')
    )

    TestBed.resetTestingModule()
    const closed = await setup({ registrationOpen: false })
    await closed.harness.fixture.whenStable()
    expect(closed.root.querySelector('a[href="/signup"]')).toBeNull()
  })
})
