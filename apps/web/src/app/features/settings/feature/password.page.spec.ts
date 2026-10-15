import { Component } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed'
import { Router, provideRouter } from '@angular/router'
import { RouterTestingHarness } from '@angular/router/testing'
import { i18nTesting, i18nTestingProviders } from '../../../../testing/i18n-testing'
import { aUser, validationError } from '../../../../testing/session-fixtures'
import { AuthApi } from '../../../core/auth/auth.api'
import { SessionStore } from '../../../core/auth/session.store'
import { ToastStore } from '../../../core/ui/toast.store'
import { ButtonHarness } from '../../../shared/ui/button/button.harness'
import { TextFieldHarness } from '../../../shared/ui/text-field/text-field.harness'
import settingsEn from '../i18n/en.json'
import PasswordPage from './password.page'

@Component({ template: '<p>settings</p>' })
class SettingsStub {}

describe('PasswordPage', () => {
  let api: { updateProfile: ReturnType<typeof vi.fn> }
  let session: { patchUser: ReturnType<typeof vi.fn> }

  async function setup() {
    api = { updateProfile: vi.fn(async () => aUser()) }
    session = { patchUser: vi.fn() }
    TestBed.configureTestingModule({
      imports: [i18nTesting({ scopes: { 'settings/en': settingsEn } })],
      providers: [
        i18nTestingProviders(),
        provideRouter([
          { path: 'settings/password', component: PasswordPage },
          { path: 'settings', component: SettingsStub },
        ]),
        { provide: AuthApi, useValue: api },
        { provide: SessionStore, useValue: session },
      ],
    })
    const harness = await RouterTestingHarness.create('/settings/password')
    const loader = TestbedHarnessEnvironment.loader(harness.fixture)
    const current = await loader.getHarness(TextFieldHarness.with({ label: 'Current password' }))
    const next = await loader.getHarness(TextFieldHarness.with({ label: 'New password' }))
    const submit = await loader.getHarness(ButtonHarness.with({ text: 'Change password' }))
    return { current, next, submit }
  }

  it('test_change_password_calls_patch_me_with_the_current_password', async () => {
    const { current, next, submit } = await setup()
    expect(await submit.isDisabled()).toBe(true)

    await current.setValue('temporary-pass-1')
    await next.setValue('a-brand-new-password')
    await submit.click()

    await vi.waitFor(() =>
      expect(api.updateProfile).toHaveBeenCalledWith({
        currentPassword: 'temporary-pass-1',
        password: 'a-brand-new-password',
      })
    )
    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/settings'))
    expect(session.patchUser).toHaveBeenCalled()
    expect(TestBed.inject(ToastStore).current()?.messageKey).toBe('settings.password.changed')
  })

  it('test_a_new_password_shorter_than_10_characters_cannot_be_sent', async () => {
    const { current, next, submit } = await setup()

    await current.setValue('temporary-pass-1')
    await next.setValue('short')

    expect(await submit.isDisabled()).toBe(true)
  })

  it('test_a_wrong_current_password_shows_under_its_field', async () => {
    const { current, next, submit } = await setup()
    api.updateProfile.mockRejectedValueOnce(
      validationError({ currentPassword: 'The current password is not correct' })
    )

    await current.setValue('wrong-password')
    await next.setValue('a-brand-new-password')
    await submit.click()

    await vi.waitFor(async () =>
      expect(await current.getMessage()).toBe('The current password is not correct')
    )
    expect(await current.getValue()).toBe('wrong-password')
  })
})
