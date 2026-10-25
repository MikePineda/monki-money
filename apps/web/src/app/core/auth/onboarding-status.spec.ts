import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import type { MemberRole } from '@monkimoney/shared'
import { aHousehold, anAccount, httpError } from '../../../testing/session-fixtures'
import type { Household } from '../api/api-types'
import { AccountsProbe } from './accounts-probe'
import { ONBOARDING_KEY } from './onboarding-progress'
import { OnboardingStatus } from './onboarding-status'
import { SessionStore } from './session.store'

describe('OnboardingStatus', () => {
  let accounts: { list: ReturnType<typeof vi.fn> }

  function status(household: Household, role: MemberRole = 'owner'): OnboardingStatus {
    accounts = { list: vi.fn(async () => [anAccount()]) }
    TestBed.configureTestingModule({
      providers: [
        {
          provide: SessionStore,
          useValue: {
            household: signal(household),
            role: signal(role),
            onClear: () => undefined,
          },
        },
        { provide: AccountsProbe, useValue: accounts },
      ],
    })
    return TestBed.inject(OnboardingStatus)
  }

  const onboarded = aHousehold({ onboardedAt: '2026-10-02T09:00:00.000Z' })

  afterEach(() => localStorage.clear())

  it('test_a_household_that_finished_the_wizard_opens_the_app_without_reading_accounts', async () => {
    const onboarding = status(onboarded)
    accounts.list.mockResolvedValue([])

    expect(await onboarding.isPending()).toBe(false)
    expect(accounts.list).not.toHaveBeenCalled()
  })

  it('test_a_finished_household_forgets_a_wizard_position_left_on_this_device', async () => {
    localStorage.setItem(ONBOARDING_KEY, JSON.stringify({ householdId: 10, step: 2 }))
    const onboarding = status(onboarded)

    expect(await onboarding.isPending()).toBe(false)
    expect(localStorage.getItem(ONBOARDING_KEY)).toBeNull()
  })

  it('test_a_wizard_under_way_on_this_device_resumes_until_the_household_finishes_it', async () => {
    localStorage.setItem(ONBOARDING_KEY, JSON.stringify({ householdId: 10, step: 2 }))
    const onboarding = status(aHousehold({ onboardedAt: null }))

    expect(await onboarding.isPending()).toBe(true)
    expect(onboarding.savedStep(10)).toBe(2)
  })

  it('test_without_a_finish_on_record_an_owner_without_accounts_gets_the_wizard', async () => {
    const onboarding = status(aHousehold({ onboardedAt: null }))
    accounts.list.mockResolvedValue([])

    expect(await onboarding.isPending()).toBe(true)
  })

  it('test_without_a_finish_on_record_an_owner_with_accounts_opens_the_app', async () => {
    const onboarding = status(aHousehold({ onboardedAt: null }))

    expect(await onboarding.isPending()).toBe(false)
    expect(await onboarding.isPending()).toBe(false)
    // Settled for this app run: one probe, not one per navigation.
    expect(accounts.list).toHaveBeenCalledTimes(1)
  })

  it('test_an_api_without_the_field_falls_back_to_the_accounts_probe', async () => {
    // An older API version during a start-first update answers no `onboardedAt`.
    const older: Partial<Household> = aHousehold()
    delete older.onboardedAt
    const onboarding = status(older as Household)
    accounts.list.mockResolvedValue([])

    expect(await onboarding.isPending()).toBe(true)
  })

  it('test_when_accounts_cannot_be_read_the_app_stays_usable', async () => {
    const onboarding = status(aHousehold({ onboardedAt: null }))
    accounts.list.mockRejectedValue(httpError(500))

    expect(await onboarding.isPending()).toBe(false)
  })

  it('test_a_member_never_sees_the_wizard', async () => {
    const onboarding = status(aHousehold({ onboardedAt: null }), 'member')
    accounts.list.mockResolvedValue([])

    expect(await onboarding.isPending()).toBe(false)
    expect(accounts.list).not.toHaveBeenCalled()
  })
})
