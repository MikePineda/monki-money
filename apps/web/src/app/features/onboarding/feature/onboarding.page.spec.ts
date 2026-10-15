import { Component, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed'
import { Router, provideRouter } from '@angular/router'
import { RouterTestingHarness } from '@angular/router/testing'
import { i18nTesting, i18nTestingProviders } from '../../../../testing/i18n-testing'
import { aHousehold, aMember, aUser, anAccount } from '../../../../testing/session-fixtures'
import type { Account } from '../../../core/api/api-types'
import { ONBOARDING_KEY } from '../../../core/auth/onboarding-progress'
import { SessionStore } from '../../../core/auth/session.store'
import { AccountsApi } from '../../../core/household/accounts.api'
import { HouseholdApi } from '../../../core/household/household.api'
import { TextFieldHarness } from '../../../shared/ui/text-field/text-field.harness'
import onboardingEn from '../i18n/en.json'
import OnboardingPage from './onboarding.page'

@Component({ template: '<p>month</p>' })
class Month {}

describe('OnboardingPage', () => {
  let households: Record<string, ReturnType<typeof vi.fn>>
  let accounts: Record<string, ReturnType<typeof vi.fn>>
  let created: Account[]

  async function open() {
    created = []
    households = {
      update: vi.fn(async (body: object) => ({ ...aHousehold(), ...body })),
      members: vi.fn(async () => [aMember()]),
      invite: vi.fn(async () => ({})),
    }
    accounts = {
      list: vi.fn(async () => created),
      create: vi.fn(async (body: Partial<Account>) => {
        const account = anAccount({ id: created.length + 1, ...body })
        created.push(account)
        return account
      }),
      remove: vi.fn(async () => undefined),
      update: vi.fn(async (id: number, body: Partial<Account>) => anAccount({ id, ...body })),
    }
    const household = signal(aHousehold({ name: 'Sam’s home' }))
    TestBed.configureTestingModule({
      imports: [i18nTesting({ scopes: { 'onboarding/en': onboardingEn } })],
      providers: [
        i18nTestingProviders(),
        provideRouter([
          { path: 'onboarding', component: OnboardingPage },
          { path: 'month', component: Month },
        ]),
        {
          provide: SessionStore,
          useValue: {
            household,
            user: signal(aUser()),
            entitlements: signal(null),
            patchHousehold: (next: ReturnType<typeof aHousehold>) => household.set(next),
            onClear: () => undefined,
          },
        },
        { provide: HouseholdApi, useValue: households },
        { provide: AccountsApi, useValue: accounts },
      ],
    })
    const harness = await RouterTestingHarness.create('/onboarding')
    const root = harness.fixture.nativeElement as HTMLElement
    const loader = TestbedHarnessEnvironment.loader(harness.fixture)
    const stepLabel = () => root.querySelector('[data-testid="onboarding.stepLabel"]')?.textContent
    const click = (testId: string) =>
      root.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`)?.click()
    return { harness, root, loader, stepLabel, click }
  }

  afterEach(() => localStorage.clear())

  it('test_step_one_saves_the_household_name_and_remembers_the_next_step', async () => {
    const { loader, stepLabel, click } = await open()
    await vi.waitFor(() => expect(stepLabel()).toContain('Step 1 of 4'))
    const name = await loader.getHarness(TextFieldHarness.with({ label: 'Household name' }))
    expect(await name.getValue()).toBe('Sam’s home')

    await name.setValue('Casa Rivera')
    click('onboarding.continue')

    await vi.waitFor(() => expect(stepLabel()).toContain('Step 2 of 4'))
    expect(households['update']).toHaveBeenCalledWith({ name: 'Casa Rivera' })
    expect(JSON.parse(localStorage.getItem(ONBOARDING_KEY) ?? '{}')).toEqual({
      householdId: 10,
      step: 1,
    })
  })

  it('test_reopening_the_wizard_resumes_on_the_saved_step', async () => {
    localStorage.setItem(ONBOARDING_KEY, JSON.stringify({ householdId: 10, step: 2 }))

    const { stepLabel, root } = await open()

    await vi.waitFor(() => expect(stepLabel()).toContain('Step 3 of 4'))
    await vi.waitFor(() =>
      expect(root.querySelector('[data-testid="onboarding.preset.nab-everyday"]')).not.toBeNull()
    )
  })

  it('test_progress_saved_for_another_household_is_ignored', async () => {
    localStorage.setItem(ONBOARDING_KEY, JSON.stringify({ householdId: 99, step: 3 }))

    const { stepLabel } = await open()

    await vi.waitFor(() => expect(stepLabel()).toContain('Step 1 of 4'))
  })

  it('test_accounts_step_creates_a_tapped_preset_and_needs_one_to_continue', async () => {
    localStorage.setItem(ONBOARDING_KEY, JSON.stringify({ householdId: 10, step: 2 }))
    const { root, harness, click } = await open()
    const continueButton = () =>
      root.querySelector<HTMLButtonElement>('[data-testid="onboarding.continue"]')
    await vi.waitFor(() =>
      expect(root.querySelector('[data-testid="onboarding.preset.hnry"]')).not.toBeNull()
    )
    expect(continueButton()?.disabled).toBe(true)

    click('onboarding.preset.hnry')
    await vi.waitFor(() => expect(accounts['create']).toHaveBeenCalled())
    await harness.fixture.whenStable()

    expect(accounts['create']).toHaveBeenCalledWith({
      name: 'Hnry',
      kind: 'wallet',
      institution: 'Hnry',
      ownerUserId: 1,
    })
    expect(
      root.querySelector('[data-testid="onboarding.preset.hnry"]')?.getAttribute('aria-pressed')
    ).toBe('true')
    expect(continueButton()?.disabled).toBe(false)
  })

  it('test_finishing_clears_the_progress_and_opens_the_month', async () => {
    localStorage.setItem(ONBOARDING_KEY, JSON.stringify({ householdId: 10, step: 3 }))
    const { click, root } = await open()
    await vi.waitFor(() =>
      expect(root.querySelector('[data-testid="onboarding.later"]')).not.toBeNull()
    )

    click('onboarding.later')

    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/month'))
    expect(localStorage.getItem(ONBOARDING_KEY)).toBeNull()
  })
})
