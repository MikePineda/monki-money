import { Component, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed'
import { i18nTesting, i18nTestingProviders } from '../../../../testing/i18n-testing'
import { anAccount } from '../../../../testing/session-fixtures'
import type { Account } from '../../../core/api/api-types'
import { EMPTY_GOAL_DRAFT, type GoalDraft } from '../../../domain/goals'
import { AmountKeypadHarness } from '../../../shared/ui/amount-keypad/amount-keypad.harness'
import { APP_LOCALE } from '../../../shared/ui/app-locale.token'
import { SegmentedControlHarness } from '../../../shared/ui/segmented-control/segmented-control.harness'
import { SelectSheetHarness } from '../../../shared/ui/select-sheet/select-sheet.harness'
import { TextFieldHarness } from '../../../shared/ui/text-field/text-field.harness'
import { provideGoalsScope } from '../goals.scope'
import { GoalFormComponent, type GoalKeypad } from './goal-form.component'

@Component({
  imports: [GoalFormComponent],
  providers: [provideGoalsScope()],
  template: `
    <app-goal-form
      submitLabel="Create goal"
      [initial]="initial()"
      [accounts]="accounts"
      [partnerName]="partner()"
      [serverErrors]="errors()"
      [cancellable]="true"
      [startWith]="startWith()"
      (submitted)="submitted.push($event)"
      (cancelled)="cancels = cancels + 1"
    />
  `,
})
class Host {
  readonly initial = signal<GoalDraft>(EMPTY_GOAL_DRAFT)
  readonly accounts: Account[] = [
    anAccount({ id: 3, name: 'Bonus Saver', clearedBalanceCents: 123_450 }),
    anAccount({ id: 4, name: 'NAB Everyday', clearedBalanceCents: 5_000 }),
  ]
  readonly partner = signal<string | null>('Alex')
  readonly errors = signal<Record<string, string>>({})
  readonly startWith = signal<GoalKeypad | null>(null)
  readonly submitted: GoalDraft[] = []
  cancels = 0
}

describe('GoalFormComponent', () => {
  async function render(setup: (host: Host) => void = () => undefined) {
    TestBed.configureTestingModule({
      imports: [i18nTesting()],
      providers: [i18nTestingProviders(), { provide: APP_LOCALE, useValue: signal('en-AU') }],
    })
    const fixture = TestBed.createComponent(Host)
    setup(fixture.componentInstance)
    const root = fixture.nativeElement as HTMLElement
    await vi.waitFor(() => expect(root.textContent).toContain('Target amount'))
    await fixture.whenStable()
    const loader = TestbedHarnessEnvironment.loader(fixture)
    return { fixture, root, host: fixture.componentInstance, loader }
  }

  function text(root: ParentNode, selector: string): string {
    return root.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
  }

  function click(root: ParentNode, selector: string): void {
    const element = root.querySelector<HTMLElement>(selector)
    if (!element) {
      throw new Error(`Nothing matches ${selector}`)
    }
    element.click()
  }

  async function submit(fixture: { whenStable(): Promise<unknown> }, root: HTMLElement) {
    click(root, '[data-testid="goals.form.submit"]')
    await fixture.whenStable()
  }

  it('test_submitting_an_empty_form_names_the_missing_fields', async () => {
    const { fixture, root, host } = await render()

    await submit(fixture, root)

    expect(host.submitted).toEqual([])
    expect(text(root, '[data-testid="goals.form.name"]')).toContain('Give the goal a name.')
    expect(root.textContent).toContain('Enter a target above $0.00.')
  })

  it('test_a_manual_goal_with_a_contribution_is_submitted_as_a_draft', async () => {
    const { fixture, root, host, loader } = await render()

    await (await loader.getHarness(TextFieldHarness)).setValue('Holiday')
    click(root, '[data-testid="goals.form.target"]')
    await fixture.whenStable()
    await (await loader.getHarness(AmountKeypadHarness)).press('3', '0', '0', '0', '00')
    expect(text(root, '[data-testid="goals.form.target"]')).toBe('$3,000.00')

    click(root, '[data-testid="goals.form.starting"]')
    await fixture.whenStable()
    await (await loader.getHarness(AmountKeypadHarness)).press('5', '0', '0', '00')

    const contribution = await loader.getHarness(
      SegmentedControlHarness.with({ label: 'Monthly contribution' })
    )
    await contribution.select('Set an amount')
    await (await loader.getHarness(AmountKeypadHarness)).press('2', '5', '0', '00')
    root.querySelector<HTMLInputElement>('[data-testid="goals.form.targetDate"]')!.value =
      '2027-06-30'
    root.querySelector('[data-testid="goals.form.targetDate"]')?.dispatchEvent(new Event('change'))
    const owner = await loader.getHarness(SegmentedControlHarness.with({ label: 'Whose goal' }))
    expect(await owner.getOptions()).toEqual(['Household', 'You', 'Alex'])
    await owner.select('Alex')

    await submit(fixture, root)

    expect(host.submitted).toEqual([
      {
        ...EMPTY_GOAL_DRAFT,
        name: 'Holiday',
        targetCents: 300_000,
        targetDate: '2027-06-30',
        startingCents: 50_000,
        contribution: 'fixed',
        monthlyContributionCents: 25_000,
        owner: 'partner',
      },
    ])
  })

  it('test_tracking_an_account_picks_one_showing_its_cleared_balance', async () => {
    const { fixture, root, host, loader } = await render((h) =>
      h.initial.set({ ...EMPTY_GOAL_DRAFT, name: 'Emergency fund', targetCents: 500_000 })
    )
    const saved = await loader.getHarness(SegmentedControlHarness.with({ label: 'Saved so far' }))
    await saved.select('Track an account')

    await submit(fixture, root)
    expect(root.textContent).toContain('Choose the account to track.')
    expect(host.submitted).toEqual([])

    click(root, '[data-testid="goals.form.account"]')
    const sheet =
      await TestbedHarnessEnvironment.documentRootLoader(fixture).getHarness(SelectSheetHarness)
    expect(await sheet.getOptions()).toEqual([
      'Bonus SaverBalance $1,234.50',
      'NAB EverydayBalance $50.00',
    ])
    await sheet.choose('Bonus Saver')
    await fixture.whenStable()
    expect(text(root, '[data-testid="goals.form.account"]')).toBe('Bonus Saver')

    await submit(fixture, root)
    expect(host.submitted.at(-1)).toMatchObject({ savedFrom: 'account', accountId: 3 })
  })

  it('test_a_household_of_one_offers_no_partner', async () => {
    const { loader } = await render((h) => h.partner.set(null))

    const owner = await loader.getHarness(SegmentedControlHarness.with({ label: 'Whose goal' }))
    expect(await owner.getOptions()).toEqual(['Household', 'You'])
  })

  it('test_server_field_errors_show_under_their_inputs', async () => {
    const { root } = await render((h) =>
      h.errors.set({ name: 'That name is taken', targetCents: 'Must be at most $10M' })
    )

    expect(text(root, '[data-testid="goals.form.name"]')).toContain('That name is taken')
    expect(root.textContent).toContain('Must be at most $10M')
  })

  it('test_editing_starts_from_the_goal_and_can_be_cancelled', async () => {
    const { fixture, root, host } = await render((h) =>
      h.initial.set({
        ...EMPTY_GOAL_DRAFT,
        name: 'Emergency fund',
        targetCents: 500_000,
        startingCents: 120_000,
      })
    )

    expect(text(root, '[data-testid="goals.form.target"]')).toBe('$5,000.00')
    expect(text(root, '[data-testid="goals.form.starting"]')).toBe('$1,200.00')
    click(root, '[data-testid="goals.form.cancel"]')
    await fixture.whenStable()

    expect(host.cancels).toBe(1)
  })

  it('test_the_contribution_nudge_opens_its_keypad', async () => {
    const { root } = await render((h) => {
      h.initial.set({ ...EMPTY_GOAL_DRAFT, contribution: 'fixed' })
      h.startWith.set('contribution')
    })

    expect(root.querySelector('[data-testid="goals.form.monthlyKeypad"]')).not.toBeNull()
  })
})
