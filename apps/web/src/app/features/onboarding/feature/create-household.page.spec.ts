import { Component, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed'
import { Router, provideRouter } from '@angular/router'
import { RouterTestingHarness } from '@angular/router/testing'
import { i18nTesting, i18nTestingProviders } from '../../../../testing/i18n-testing'
import {
  aHousehold,
  aMembership,
  aUser,
  httpError,
  validationError,
} from '../../../../testing/session-fixtures'
import { ONBOARDING_KEY } from '../../../core/auth/onboarding-progress'
import { SessionStore } from '../../../core/auth/session.store'
import { AccountsApi } from '../../../core/household/accounts.api'
import { HouseholdApi } from '../../../core/household/household.api'
import { deviceTimeZone } from '../../../domain/time-zones'
import { ButtonHarness } from '../../../shared/ui/button/button.harness'
import { TextFieldHarness } from '../../../shared/ui/text-field/text-field.harness'
import CreateHouseholdPage from './create-household.page'

@Component({ template: '<p>landed</p>' })
class Landing {}

const TOKEN = 'q3J9xV_2b-Lm8pQ4rS6tU0wY1zA5cE7gH9jK2nP4sT6' // gitleaks:allow

describe('CreateHouseholdPage', () => {
  let households: { create: ReturnType<typeof vi.fn> }
  let session: Record<string, unknown> & {
    load: ReturnType<typeof vi.fn>
    logout: ReturnType<typeof vi.fn>
  }

  async function open() {
    households = {
      create: vi.fn(async (body: { name: string }) => ({
        household: aHousehold({ id: 11, name: body.name }),
        membership: aMembership({ householdId: 11 }),
      })),
    }
    session = {
      user: signal(aUser({ fullName: 'Sam Rivera', currentHouseholdId: null })),
      household: signal(null),
      role: signal(null),
      homePath: signal('/month'),
      load: vi.fn(async () => undefined),
      logout: vi.fn(async () => undefined),
      onClear: () => undefined,
    }
    TestBed.configureTestingModule({
      imports: [i18nTesting()],
      providers: [
        i18nTestingProviders(),
        provideRouter([
          { path: 'household/new', component: CreateHouseholdPage },
          { path: '**', component: Landing },
        ]),
        { provide: SessionStore, useValue: session },
        { provide: HouseholdApi, useValue: households },
        { provide: AccountsApi, useValue: {} },
      ],
    })
    const harness = await RouterTestingHarness.create('/household/new')
    const root = harness.fixture.nativeElement as HTMLElement
    const loader = TestbedHarnessEnvironment.loader(harness.fixture)
    await vi.waitFor(() => expect(root.querySelector('h1')?.textContent).toContain('household'))
    const button = (text: string) => loader.getHarness(ButtonHarness.with({ text }))
    const field = (label: string) => loader.getHarness(TextFieldHarness.with({ label }))
    return { harness, root, button, field }
  }

  afterEach(() => localStorage.clear())

  it('test_prefills_the_name_language_and_device_time_zone_with_aud_as_the_currency', async () => {
    const { root, field } = await open()

    expect(await (await field('Household name')).getValue()).toBe('Sam’s home')
    expect(root.querySelector('[data-testid="onboarding.currency"]')?.textContent).toContain('AUD')
    expect(root.querySelector('[data-testid="onboarding.timezone"]')?.textContent).toContain(
      deviceTimeZone()
    )
    expect(
      root.querySelector('[data-testid="onboarding.language"] [aria-checked="true"]')?.textContent
    ).toContain('English')
  })

  it('test_creating_saves_it_refreshes_the_session_and_continues_with_its_accounts', async () => {
    const { button, field } = await open()

    await (await field('Household name')).setValue('Casa Rivera')
    await (await button('Create household')).click()

    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/onboarding'))
    expect(households.create).toHaveBeenCalledWith({
      name: 'Casa Rivera',
      locale: 'en',
      timezone: deviceTimeZone(),
      currencyCode: 'AUD',
    })
    expect(session.load).toHaveBeenCalled()
    // The name and the region are set: the wizard resumes on the accounts step.
    expect(JSON.parse(localStorage.getItem(ONBOARDING_KEY) ?? '{}')).toEqual({
      householdId: 11,
      step: 2,
    })
  })

  it('test_an_empty_name_keeps_the_button_disabled', async () => {
    const { button, field } = await open()

    await (await field('Household name')).setValue('')

    expect(await (await button('Create household')).isDisabled()).toBe(true)
  })

  it('test_api_field_errors_show_under_the_name', async () => {
    const { root, button } = await open()
    households.create.mockRejectedValueOnce(validationError({ name: 'The name is too long' }))

    await (await button('Create household')).click()

    await vi.waitFor(() =>
      expect(root.querySelector('[data-testid="createHousehold.name"]')?.textContent).toContain(
        'The name is too long'
      )
    )
  })

  it('test_already_in_a_household_says_so_and_offers_the_way_back', async () => {
    const { root, button } = await open()
    households.create.mockRejectedValueOnce(httpError(409, { code: 'E_ALREADY_IN_HOUSEHOLD' }))

    await (await button('Create household')).click()

    await vi.waitFor(() =>
      expect(root.querySelector('[data-testid="createHousehold.error"]')?.textContent).toContain(
        'You already have a household.'
      )
    )
    root.querySelector<HTMLButtonElement>('[data-testid="createHousehold.error"] button')?.click()
    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/month'))
    expect(session.load).toHaveBeenCalled()
  })

  it('test_an_invitation_link_opens_the_invitation_screen', async () => {
    const { harness, button, field } = await open()

    await (await button('I have an invite link')).click()
    await harness.fixture.whenStable()
    await (
      await field('Invitation link or code')
    ).setValue(`https://app.example.test/invite/${TOKEN}`)
    await (await button('Open invitation')).click()

    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe(`/invite/${TOKEN}`))
    expect(households.create).not.toHaveBeenCalled()
  })

  it('test_text_that_is_not_an_invitation_is_explained', async () => {
    const { harness, button, field } = await open()
    await (await button('I have an invite link')).click()
    await harness.fixture.whenStable()
    const link = await field('Invitation link or code')

    await link.setValue('see you at home')
    await (await button('Open invitation')).click()

    await vi.waitFor(async () =>
      expect(await link.getMessage()).toContain('That is not an invitation link.')
    )
    expect(TestBed.inject(Router).url).toBe('/household/new')
  })

  it('test_log_out_is_always_at_hand', async () => {
    const { button } = await open()

    await (await button('Log out')).click()

    expect(session.logout).toHaveBeenCalled()
  })
})
