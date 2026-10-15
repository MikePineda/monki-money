import { ApplicationInitStatus } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { provideRouter } from '@angular/router'
import { i18nTesting, i18nTestingProviders } from '../../../testing/i18n-testing'
import { aMe, aUser, httpError } from '../../../testing/session-fixtures'
import { LANG_PERSISTENCE } from '../i18n/lang.store'
import { HOUSEHOLD_TIME_ZONE } from '../platform/time-zone.token'
import { THEME_PERSISTENCE } from '../theme/theme.store'
import { AuthApi, type Me } from './auth.api'
import { provideAuth } from './auth.providers'
import { SessionStore } from './session.store'

describe('provideAuth', () => {
  let api: { me: ReturnType<typeof vi.fn>; updateProfile: ReturnType<typeof vi.fn> }

  async function boot(me: () => Promise<Me>): Promise<void> {
    api = {
      me: vi.fn(me),
      updateProfile: vi.fn(async (body: object) => ({ ...aUser(), ...body })),
    }
    TestBed.configureTestingModule({
      imports: [i18nTesting()],
      providers: [
        i18nTestingProviders(),
        provideRouter([]),
        provideAuth(),
        { provide: AuthApi, useValue: api },
      ],
    })
    await TestBed.inject(ApplicationInitStatus).donePromise
  }

  afterEach(() => localStorage.clear())

  it('test_the_session_is_loaded_before_the_app_starts', async () => {
    await boot(async () => aMe())

    expect(api.me).toHaveBeenCalledTimes(1)
    expect(TestBed.inject(SessionStore).isAuthenticated()).toBe(true)
  })

  it('test_theme_and_language_choices_are_saved_on_the_profile_when_signed_in', async () => {
    await boot(async () => aMe())

    await TestBed.inject(THEME_PERSISTENCE).save('dark')
    await TestBed.inject(LANG_PERSISTENCE).save('es')

    expect(api.updateProfile).toHaveBeenCalledWith({ theme: 'dark' })
    expect(api.updateProfile).toHaveBeenCalledWith({ locale: 'es' })
    expect(TestBed.inject(SessionStore).user()?.locale).toBe('es')
  })

  it('test_a_guest_choice_stays_on_the_device', async () => {
    await boot(() => Promise.reject(httpError(401)))

    await TestBed.inject(THEME_PERSISTENCE).save('dark')

    expect(api.updateProfile).not.toHaveBeenCalled()
  })

  it('test_today_follows_the_household_time_zone', async () => {
    const me = aMe()
    me.household = { ...me.household!, timezone: 'Australia/Perth' }
    await boot(async () => me)

    expect(TestBed.inject(HOUSEHOLD_TIME_ZONE)()).toBe('Australia/Perth')
  })
})
