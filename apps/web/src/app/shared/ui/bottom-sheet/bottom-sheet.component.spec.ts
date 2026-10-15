import { Component, inject } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed'
import { BottomSheetComponent } from './bottom-sheet.component'
import { BottomSheetHarness } from './bottom-sheet.harness'
import { BottomSheetService } from './bottom-sheet.service'

@Component({
  imports: [BottomSheetComponent],
  template: `
    <app-bottom-sheet title="Account" closeLabel="Close">
      <button type="button" class="first">NAB Everyday</button>
      <button sheetFooter type="button">Save</button>
    </app-bottom-sheet>
  `,
})
class DemoSheet {}

@Component({
  template: `<button type="button" class="opener" (click)="open()">Open</button>`,
})
class Host {
  private readonly sheets = inject(BottomSheetService)
  closedWith: unknown = 'not closed'

  open(): void {
    this.sheets.open(DemoSheet, { ariaLabel: 'Account' }).closed.subscribe((result) => {
      this.closedWith = result
    })
  }
}

describe('BottomSheet', () => {
  async function openSheet() {
    const fixture = TestBed.createComponent(Host)
    await fixture.whenStable()
    const opener = fixture.nativeElement.querySelector('.opener') as HTMLButtonElement
    opener.focus()
    opener.click()
    await fixture.whenStable()
    const sheet =
      await TestbedHarnessEnvironment.documentRootLoader(fixture).getHarness(BottomSheetHarness)
    return { fixture, sheet, opener }
  }

  afterEach(() => TestBed.inject(BottomSheetService).closeAll())

  it('test_opens_a_modal_dialog_with_title_and_scrim', async () => {
    const { sheet } = await openSheet()

    expect(await sheet.getTitle()).toBe('Account')
    expect(await sheet.getDialogAttribute('aria-modal')).toBe('true')
    expect(await sheet.getDialogAttribute('aria-label')).toBe('Account')
    expect(document.querySelector('.mm-sheet-backdrop')).not.toBeNull()
    expect(
      document.querySelector('.mm-sheet-panel app-bottom-sheet button[sheetFooter]')
    ).not.toBeNull()
  })

  it('test_moves_focus_into_the_sheet', async () => {
    const { fixture, opener } = await openSheet()
    await fixture.whenStable()

    // jsdom has no layout, so the CDK focuses the dialog container itself
    // rather than its first tabbable child; either way focus left the page.
    expect(document.activeElement).not.toBe(opener)
    expect(document.activeElement?.closest('[role="dialog"]')).not.toBeNull()
  })

  it('test_close_button_closes_and_returns_focus_to_the_opener', async () => {
    const { sheet, fixture, opener } = await openSheet()

    await sheet.close()
    await fixture.whenStable()

    expect(document.querySelector('app-bottom-sheet')).toBeNull()
    expect(fixture.componentInstance.closedWith).toBeUndefined()
    expect(document.activeElement).toBe(opener)
  })

  it('test_escape_closes_the_sheet', async () => {
    const { fixture } = await openSheet()
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement

    dialog.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true })
    )
    await fixture.whenStable()

    expect(document.querySelector('app-bottom-sheet')).toBeNull()
  })
})
