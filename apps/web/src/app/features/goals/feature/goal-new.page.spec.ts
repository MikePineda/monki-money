import { Component, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed'
import { Router, provideRouter } from '@angular/router'
import { RouterTestingHarness } from '@angular/router/testing'
import { aGoal } from '../../../../testing/goal-fixtures'
import { i18nTesting, i18nTestingProviders } from '../../../../testing/i18n-testing'
import { aCategoryTree } from '../../../../testing/ledger-fixtures'
import { anAccount, aSessionStub, validationError } from '../../../../testing/session-fixtures'
import { SessionStore } from '../../../core/auth/session.store'
import { AccountsApi } from '../../../core/household/accounts.api'
import { CategoriesApi } from '../../../core/household/categories.api'
import { AmountKeypadHarness } from '../../../shared/ui/amount-keypad/amount-keypad.harness'
import { APP_LOCALE } from '../../../shared/ui/app-locale.token'
import { SegmentedControlHarness } from '../../../shared/ui/segmented-control/segmented-control.harness'
import { TextFieldHarness } from '../../../shared/ui/text-field/text-field.harness'
import { GoalsApi } from '../data-access/goals.api'
import GoalNewPage from './goal-new.page'

@Component({ template: '<p data-testid="stub">detail</p>' })
class Stub {}

describe('GoalNewPage', () => {
  let api: { create: ReturnType<typeof vi.fn> }

  async function open() {
    api = { create: vi.fn(async () => aGoal({ id: 42 })) }
    TestBed.configureTestingModule({
      imports: [i18nTesting()],
      providers: [
        i18nTestingProviders(),
        provideRouter([
          { path: 'goals/new', component: GoalNewPage },
          { path: 'goals/:id', component: Stub },
          { path: 'goals', component: Stub },
        ]),
        { provide: GoalsApi, useValue: api },
        { provide: AccountsApi, useValue: { list: async () => [anAccount()] } },
        { provide: CategoriesApi, useValue: { tree: async () => aCategoryTree() } },
        { provide: SessionStore, useValue: aSessionStub() },
        { provide: APP_LOCALE, useValue: signal('en-AU') },
      ],
    })
    const harness = await RouterTestingHarness.create()
    await harness.navigateByUrl('/goals/new')
    const root = harness.fixture.nativeElement as HTMLElement
    await vi.waitFor(() => expect(root.querySelector('h1')?.textContent?.trim()).toBe('New goal'))
    await harness.fixture.whenStable()
    return { harness, root, loader: TestbedHarnessEnvironment.loader(harness.fixture) }
  }

  async function fill(
    harness: RouterTestingHarness,
    root: HTMLElement,
    loader: ReturnType<typeof TestbedHarnessEnvironment.loader>
  ) {
    await (await loader.getHarness(TextFieldHarness)).setValue('Holiday')
    root.querySelector<HTMLButtonElement>('[data-testid="goals.form.target"]')?.click()
    await harness.fixture.whenStable()
    await (await loader.getHarness(AmountKeypadHarness)).press('3', '0', '0', '0', '00')
    const owner = await loader.getHarness(SegmentedControlHarness.with({ label: 'Whose goal' }))
    await owner.select('You')
  }

  it('test_creating_a_goal_opens_its_detail', async () => {
    const { harness, root, loader } = await open()
    await fill(harness, root, loader)

    root.querySelector<HTMLButtonElement>('[data-testid="goals.form.submit"]')?.click()

    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/goals/42'))
    expect(api.create).toHaveBeenCalledWith({
      name: 'Holiday',
      targetCents: 300_000,
      targetDate: null,
      startingCents: 0,
      monthlyContributionCents: null,
      accountId: null,
      userId: 1,
    })
  })

  it('test_field_errors_from_the_api_show_under_their_inputs', async () => {
    const { harness, root, loader } = await open()
    await fill(harness, root, loader)
    api.create.mockRejectedValueOnce(validationError({ name: 'That name is too long' }))

    root.querySelector<HTMLButtonElement>('[data-testid="goals.form.submit"]')?.click()

    await vi.waitFor(() =>
      expect(root.querySelector('[data-testid="goals.form.name"]')?.textContent).toContain(
        'That name is too long'
      )
    )
    expect(TestBed.inject(Router).url).toBe('/goals/new')
  })
})
