import { Component } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { i18nTesting, i18nTestingProviders } from '../../../testing/i18n-testing'
import { BottomSheetService } from '../ui/bottom-sheet/bottom-sheet.service'
import { RowTriageComponent, type TriageStatus } from './row-triage.component'

@Component({
  imports: [RowTriageComponent],
  template: `
    <app-row-triage
      title="Review row"
      heading="Corner Grocer"
      closeLabel="Close"
      kind="expense"
      [amountCents]="-4250"
      [meta]="['Mon 29 Sep', '', 'Card 1111']"
      [status]="status"
    >
      <p triageSummary class="bank">POS 29/09 CORNER GROCER</p>
      <button type="button" class="decision">Change category</button>
      <button triageFooter type="button" class="done">Done</button>
    </app-row-triage>
  `,
})
class SheetContent {
  readonly status: TriageStatus = { icon: 'triangle-alert', label: 'Review', tone: 'warning' }
}

describe('RowTriageComponent', () => {
  async function open() {
    TestBed.configureTestingModule({
      imports: [i18nTesting()],
      providers: [i18nTestingProviders()],
    })
    const sheets = TestBed.inject(BottomSheetService)
    sheets.open(SheetContent)
    await new Promise((resolve) => setTimeout(resolve))
    const root = document.querySelector('.mm-sheet-panel') as HTMLElement
    return { root, sheets }
  }

  afterEach(() => TestBed.inject(BottomSheetService).closeAll())

  it('test_summarises_the_row_with_its_amount_facts_and_status', async () => {
    const { root } = await open()

    expect(root.querySelector('h2')?.textContent?.trim()).toBe('Review row')
    expect(root.querySelector('[data-testid="triage.heading"]')?.textContent?.trim()).toBe(
      'Corner Grocer'
    )
    expect(root.textContent).toContain('Mon 29 Sep · Card 1111')
    expect(root.textContent).toContain('−$42.50')
    const status = root.querySelector('[data-testid="triage.status"]') as HTMLElement
    expect(status.textContent?.trim()).toBe('Review')
    expect(status.querySelector('app-icon')?.className).toContain('text-status-warning')
  })

  it('test_projects_the_summary_extras_the_decisions_and_the_footer', async () => {
    const { root } = await open()

    expect(root.querySelector('[data-testid="triage.summary"] .bank')).not.toBeNull()
    expect(root.querySelector('.decision')).not.toBeNull()
    expect(root.querySelector('[sheetFooter] .done')).not.toBeNull()
  })
})
