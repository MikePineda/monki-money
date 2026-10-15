import { Component, inject } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed'
import { i18nTesting, i18nTestingProviders } from '../../../../testing/i18n-testing'
import { BottomSheetService } from '../bottom-sheet/bottom-sheet.service'
import { openSelectSheet, type SelectOption } from './select-sheet.component'
import { SelectSheetHarness } from './select-sheet.harness'

const accounts: SelectOption<string>[] = [
  { value: 'everyday', label: 'NAB Everyday', meta: 'Shared', person: 'joint' },
  { value: 'savings', label: 'NAB Savings', meta: 'Shared' },
  { value: 'hnry', label: 'Hnry', person: 'a' },
]

const categories: SelectOption<string>[] = [
  'Súper',
  'Renta',
  'Servicios',
  'Comida fuera',
  'Transporte',
  'Salud',
  'Teléfono',
  'Café',
  'Otros',
].map((label) => ({ value: label.toLowerCase(), label }))

@Component({ template: '' })
class Host {
  readonly sheets = inject(BottomSheetService)
  result: string | undefined | 'pending' = 'pending'

  open(options: SelectOption<string>[], selected: string | null = null): void {
    openSelectSheet(this.sheets, { title: 'Account', options, selected }).subscribe((value) => {
      this.result = value
    })
  }
}

describe('SelectSheetComponent', () => {
  async function open(options: SelectOption<string>[], selected: string | null = null) {
    TestBed.configureTestingModule({
      imports: [i18nTesting()],
      providers: [i18nTestingProviders()],
    })
    const fixture = TestBed.createComponent(Host)
    fixture.componentInstance.open(options, selected)
    await fixture.whenStable()
    const sheet =
      await TestbedHarnessEnvironment.documentRootLoader(fixture).getHarness(SelectSheetHarness)
    return { fixture, sheet, host: fixture.componentInstance }
  }

  afterEach(() => TestBed.inject(BottomSheetService).closeAll())

  it('test_lists_the_options_and_marks_the_selected_one', async () => {
    const { sheet } = await open(accounts, 'savings')

    expect(await sheet.getOptions()).toEqual(['NAB EverydayShared', 'NAB SavingsShared', 'Hnry'])
    expect(await sheet.getSelected()).toBe('NAB SavingsShared')
    expect(document.querySelector('[aria-selected="true"] [data-icon="check"]')).not.toBeNull()
  })

  it('test_choosing_closes_the_sheet_with_the_value', async () => {
    const { sheet, host, fixture } = await open(accounts)

    await sheet.choose('Hnry')
    await fixture.whenStable()

    expect(host.result).toBe('hnry')
    expect(document.querySelector('app-select-sheet')).toBeNull()
  })

  it('test_short_lists_have_no_search', async () => {
    const { sheet } = await open(accounts)

    expect(await sheet.hasSearch()).toBe(false)
  })

  it('test_long_lists_are_searchable_ignoring_accents', async () => {
    const { sheet } = await open(categories)
    expect(await sheet.hasSearch()).toBe(true)

    await sheet.search('cafe')

    expect(await sheet.getOptions()).toEqual(['Café'])
  })

  it('test_a_search_without_matches_says_so', async () => {
    const { sheet } = await open(categories)

    await sheet.search('zzz')

    expect(document.querySelector('app-select-sheet ul')?.textContent).toContain('No matches')
  })
})
