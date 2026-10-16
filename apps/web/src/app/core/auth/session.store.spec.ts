import { Component } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { Router, provideRouter } from '@angular/router'
import { aMe, httpError, networkError } from '../../../testing/session-fixtures'
import { SessionExpiry } from '../api/session-expiry'
import { LangStore } from '../i18n/lang.store'
import { ThemeStore } from '../theme/theme.store'
import { ToastStore } from '../ui/toast.store'
import { AuthApi, type Me } from './auth.api'
import { SessionStore } from './session.store'

@Component({ template: '' })
class Blank {}

describe('SessionStore', () => {
  let api: { me: ReturnType<typeof vi.fn>; logout: ReturnType<typeof vi.fn> }
  let theme: { hydrate: ReturnType<typeof vi.fn> }
  let lang: { hydrate: ReturnType<typeof vi.fn> }

  function setup(me: () => Promise<Me>): SessionStore {
    api = { me: vi.fn(me), logout: vi.fn(async () => undefined) }
    theme = { hydrate: vi.fn() }
    lang = { hydrate: vi.fn() }
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: '**', component: Blank }]),
        { provide: AuthApi, useValue: api },
        { provide: ThemeStore, useValue: theme },
        { provide: LangStore, useValue: lang },
      ],
    })
    return TestBed.inject(SessionStore)
  }

  afterEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  it('test_bootstrap_with_a_401_leaves_the_session_anonymous', async () => {
    const store = setup(() => Promise.reject(httpError(401)))

    await store.load()

    expect(store.isAuthenticated()).toBe(false)
    expect(store.unreachable()).toBe(false)
    expect(store.homePath()).toBe('/login')
  })

  it('test_bootstrap_with_a_session_exposes_user_household_role_plan_and_flags', async () => {
    const store = setup(async () => aMe('owner', ['billing']))

    await store.load()

    expect(store.isAuthenticated()).toBe(true)
    expect(store.isVerified()).toBe(true)
    expect(store.hasHousehold()).toBe(true)
    expect(store.role()).toBe('owner')
    expect(store.plan()).toBe('free')
    expect(store.hasFlag('billing')).toBe(true)
    expect(store.hasFlag('beta')).toBe(false)
    expect(store.household()?.timezone).toBe('Australia/Brisbane')
    expect(store.homePath()).toBe('/month')
  })

  it('test_bootstrap_brings_the_members_names_and_the_partner', async () => {
    const store = setup(async () => aMe('member'))

    await store.load()

    expect(store.members().map((member) => [member.id, member.displayName])).toEqual([
      [1, 'Sam Rivera'],
      [2, 'Alex Chen'],
    ])
    expect(store.partner()?.displayName).toBe('Sam Rivera')

    store.clear()
    expect(store.members()).toEqual([])
    expect(store.partner()).toBeNull()
  })

  it('test_bootstrap_applies_the_users_theme_and_language', async () => {
    const me = aMe()
    me.user.theme = 'dark'
    me.user.locale = 'es'
    const store = setup(async () => me)

    await store.load()

    expect(theme.hydrate).toHaveBeenCalledWith('dark')
    expect(lang.hydrate).toHaveBeenCalledWith('es')
  })

  it('test_bootstrap_without_network_is_anonymous_and_marked_unreachable', async () => {
    const store = setup(() => Promise.reject(networkError()))

    await store.load()

    expect(store.isAuthenticated()).toBe(false)
    expect(store.unreachable()).toBe(true)
  })

  it('test_logout_ends_the_session_and_forgets_app_storage_but_keeps_device_preferences', async () => {
    const store = setup(async () => aMe())
    await store.load()
    localStorage.setItem('mm:theme', 'dark')
    localStorage.setItem('mm:lang', 'es')
    localStorage.setItem('mm:onboarding', '{"householdId":10,"step":1}')
    localStorage.setItem('qa:lastAccount', '3')
    localStorage.setItem('unrelated', 'kept')
    sessionStorage.setItem('mm:invite', 'token')
    const cleared = vi.fn()
    store.onClear(cleared)

    await store.logout()

    expect(api.logout).toHaveBeenCalled()
    expect(store.isAuthenticated()).toBe(false)
    expect(cleared).toHaveBeenCalled()
    expect(localStorage.getItem('mm:theme')).toBe('dark')
    expect(localStorage.getItem('mm:lang')).toBe('es')
    expect(localStorage.getItem('mm:onboarding')).toBeNull()
    expect(localStorage.getItem('qa:lastAccount')).toBeNull()
    expect(localStorage.getItem('unrelated')).toBe('kept')
    expect(sessionStorage.getItem('mm:invite')).toBeNull()
    expect(TestBed.inject(Router).url).toBe('/login')
  })

  it('test_logout_still_clears_locally_when_the_api_call_fails', async () => {
    const store = setup(async () => aMe())
    await store.load()
    api.logout.mockRejectedValueOnce(networkError())

    await store.logout()

    expect(store.isAuthenticated()).toBe(false)
  })

  it('test_logout_runs_the_logout_hooks_before_the_session_is_cleared', async () => {
    const store = setup(async () => aMe())
    await store.load()
    const seen: string[] = []
    store.onLogout(() => seen.push(`logout:${store.user()?.id}`))
    store.onClear(() => seen.push('clear'))

    await store.logout()

    expect(seen).toEqual(['logout:1', 'clear'])
  })

  it('test_an_expired_session_clears_without_running_the_logout_hooks', async () => {
    const store = setup(async () => aMe())
    await store.load()
    const loggedOut = vi.fn()
    const cleared = vi.fn()
    store.onLogout(loggedOut)
    store.onClear(cleared)

    TestBed.inject(SessionExpiry).notify()

    expect(cleared).toHaveBeenCalled()
    expect(loggedOut).not.toHaveBeenCalled()
  })

  it('test_a_401_while_signed_in_clears_the_session_and_goes_to_login_without_a_toast', async () => {
    const store = setup(async () => aMe())
    await store.load()
    const router = TestBed.inject(Router)
    await router.navigateByUrl('/settings/profile')
    const toasts = TestBed.inject(ToastStore)

    TestBed.inject(SessionExpiry).notify()
    await vi.waitFor(() => expect(router.url).toBe('/login?returnUrl=%2Fsettings%2Fprofile'))

    expect(store.isAuthenticated()).toBe(false)
    expect(toasts.current()).toBeNull()
  })

  it('test_a_401_while_anonymous_changes_nothing', async () => {
    const store = setup(() => Promise.reject(httpError(401)))
    await store.load()
    const router = TestBed.inject(Router)
    await router.navigateByUrl('/signup')

    TestBed.inject(SessionExpiry).notify()
    await Promise.resolve()

    expect(router.url).toBe('/signup')
  })

  it('test_patch_user_keeps_the_rest_of_the_session', async () => {
    const store = setup(async () => aMe())
    await store.load()

    store.patchUser({ ...aMe().user, fullName: 'Sam R.' })

    expect(store.user()?.fullName).toBe('Sam R.')
    expect(store.household()?.name).toBe('Sam’s home')
  })

  it('test_leaving_or_switching_households_drops_the_cached_household_data', async () => {
    const store = setup(async () => aMe('member'))
    await store.load()
    const dropped = vi.fn()
    store.onClear(dropped)

    api.me.mockResolvedValueOnce(aMe('member'))
    await store.load()
    expect(dropped).not.toHaveBeenCalled()

    api.me.mockResolvedValueOnce(aMe('noHousehold'))
    await store.load()
    expect(dropped).toHaveBeenCalledTimes(1)
    expect(store.isAuthenticated()).toBe(true)
    expect(store.homePath()).toBe('/household/new')

    const fresh = aMe('owner')
    fresh.household = { ...fresh.household!, id: 11 }
    api.me.mockResolvedValueOnce(fresh)
    await store.load()
    expect(dropped).toHaveBeenCalledTimes(2)
  })
})
