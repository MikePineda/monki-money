import { TestBed } from '@angular/core/testing'
import {
  Router,
  UrlTree,
  provideRouter,
  type ActivatedRouteSnapshot,
  type CanActivateFn,
  type CanMatchFn,
  type GuardResult,
  type MaybeAsync,
  type RouterStateSnapshot,
} from '@angular/router'
import { firstValueFrom, isObservable } from 'rxjs'
import { aMe, anAccount, httpError, type SessionKind } from '../../../testing/session-fixtures'
import { AccountsApi } from '../household/accounts.api'
import { LangStore } from '../i18n/lang.store'
import { ThemeStore } from '../theme/theme.store'
import { AuthApi } from './auth.api'
import {
  authGuard,
  flagGuard,
  guestGuard,
  householdGuard,
  noHouseholdGuard,
  onboardedGuard,
  onboardingPendingGuard,
  pendingDeletionGuard,
  registrationOpenGuard,
  roleGuard,
  verifiedGuard,
} from './guards'
import { ONBOARDING_KEY } from './onboarding-progress'
import { SessionStore } from './session.store'

type State = SessionKind | 'guest'

describe('route guards', () => {
  let accounts: { list: ReturnType<typeof vi.fn> }
  let config: { config: ReturnType<typeof vi.fn> }

  async function signIn(state: State, flags: string[] = []): Promise<void> {
    accounts = { list: vi.fn(async () => [anAccount()]) }
    config = { config: vi.fn(async () => ({ registrationOpen: true })) }
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: AuthApi,
          useValue: {
            me: async () => {
              if (state === 'guest') {
                throw httpError(401)
              }
              return aMe(state, flags)
            },
            config: config.config,
          },
        },
        { provide: AccountsApi, useValue: accounts },
        { provide: ThemeStore, useValue: { hydrate: () => undefined } },
        { provide: LangStore, useValue: { hydrate: () => undefined } },
      ],
    })
    await TestBed.inject(SessionStore).load()
  }

  /** Runs a guard and answers `true` or the URL it redirects to. */
  async function run(
    guard: CanActivateFn | CanMatchFn,
    url = '/somewhere'
  ): Promise<true | string> {
    const call = guard as (route: unknown, state: unknown) => MaybeAsync<GuardResult>
    const result = TestBed.runInInjectionContext(() =>
      call({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot)
    )
    const value = isObservable(result) ? await firstValueFrom(result) : await result
    if (value instanceof UrlTree) {
      return TestBed.inject(Router).serializeUrl(value)
    }
    expect(value).toBe(true)
    return true
  }

  afterEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  const matrix: [string, CanActivateFn, Record<State, true | string>][] = [
    [
      'authGuard',
      authGuard,
      {
        guest: '/login?returnUrl=%2Fsomewhere',
        unverified: true,
        noHousehold: true,
        pendingDeletion: true,
        member: true,
        owner: true,
      },
    ],
    [
      'guestGuard',
      guestGuard,
      {
        guest: true,
        unverified: '/verify-email',
        noHousehold: '/household/new',
        pendingDeletion: '/household-deleted',
        member: '/month',
        owner: '/month',
      },
    ],
    [
      'verifiedGuard',
      verifiedGuard,
      {
        guest: '/verify-email',
        unverified: '/verify-email',
        noHousehold: true,
        pendingDeletion: true,
        member: true,
        owner: true,
      },
    ],
    [
      'householdGuard',
      householdGuard,
      {
        guest: '/login',
        // Verification is verifiedGuard's job, which runs first in the chain.
        unverified: true,
        noHousehold: '/household/new',
        pendingDeletion: '/household-deleted',
        member: true,
        owner: true,
      },
    ],
    [
      'noHouseholdGuard',
      noHouseholdGuard,
      {
        guest: true,
        unverified: '/verify-email',
        noHousehold: true,
        pendingDeletion: '/household-deleted',
        member: '/month',
        owner: '/month',
      },
    ],
    [
      'pendingDeletionGuard',
      pendingDeletionGuard,
      {
        guest: '/login',
        unverified: '/verify-email',
        noHousehold: '/household/new',
        pendingDeletion: true,
        member: '/month',
        owner: '/month',
      },
    ],
    [
      "roleGuard('owner')",
      roleGuard('owner'),
      {
        guest: '/settings',
        unverified: true,
        noHousehold: '/settings',
        pendingDeletion: true,
        member: '/settings',
        owner: true,
      },
    ],
  ]

  for (const [name, guard, expected] of matrix) {
    for (const [state, outcome] of Object.entries(expected) as [State, true | string][]) {
      it(`test_${name}_for_${state}_${outcome === true ? 'lets_through' : 'redirects'}`, async () => {
        await signIn(state)

        expect(await run(guard)).toBe(outcome)
      })
    }
  }

  it('test_flag_guard_follows_the_flags_from_the_api', async () => {
    await signIn('owner', ['billing'])
    expect(await run(flagGuard('billing'))).toBe(true)
    expect(await run(flagGuard('beta'))).toBe('/month')
  })

  it('test_without_a_household_a_pending_invitation_comes_before_creating_one', async () => {
    await signIn('noHousehold')
    sessionStorage.setItem('mm:invite', 'invite-token-123')

    expect(await run(noHouseholdGuard)).toBe('/invite/invite-token-123')
  })

  it('test_sign_up_matches_while_registration_is_open', async () => {
    await signIn('guest')

    expect(await run(registrationOpenGuard)).toBe(true)
  })

  it('test_sign_up_sends_to_login_while_registration_is_closed', async () => {
    await signIn('guest')
    config.config.mockResolvedValue({ registrationOpen: false })

    expect(await run(registrationOpenGuard)).toBe('/login')
  })

  describe('onboarding', () => {
    it('test_an_owner_without_accounts_is_sent_to_onboarding', async () => {
      await signIn('owner')
      accounts.list.mockResolvedValue([])

      expect(await run(onboardedGuard)).toBe('/onboarding')
      expect(await run(onboardingPendingGuard)).toBe(true)
    })

    it('test_an_owner_with_accounts_uses_the_app', async () => {
      await signIn('owner')

      expect(await run(onboardedGuard)).toBe(true)
      expect(await run(onboardingPendingGuard)).toBe('/month')
    })

    it('test_a_wizard_left_halfway_resumes_even_with_accounts', async () => {
      await signIn('owner')
      localStorage.setItem(ONBOARDING_KEY, JSON.stringify({ householdId: 10, step: 3 }))

      expect(await run(onboardedGuard)).toBe('/onboarding')
    })

    it('test_a_member_never_sees_the_wizard', async () => {
      await signIn('member')
      accounts.list.mockResolvedValue([])

      expect(await run(onboardedGuard)).toBe(true)
      expect(accounts.list).not.toHaveBeenCalled()
    })

    it('test_when_accounts_cannot_be_read_the_app_stays_usable', async () => {
      await signIn('owner')
      accounts.list.mockRejectedValue(httpError(500))

      expect(await run(onboardedGuard)).toBe(true)
    })
  })
})
