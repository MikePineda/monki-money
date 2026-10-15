import { CdkDialogContainer, DialogRef } from '@angular/cdk/dialog'
import { Component, DestroyRef, inject, input, output } from '@angular/core'
import { IconButtonComponent } from '../icon-button/icon-button.component'

let nextId = 0

/**
 * The frame of a bottom sheet's content: drag handle, title in `heading`,
 * an optional close button, a body that scrolls inside the 90%-height sheet,
 * and a footer for the primary action (project `[sheetFooter]`).
 * Open the component that uses it with BottomSheetService; the title names
 * the dialog (aria-labelledby) unless an explicit aria-label was given.
 */
@Component({
  selector: 'app-bottom-sheet',
  imports: [IconButtonComponent],
  template: `
    <div
      class="mx-auto mt-2 mb-2 h-1 w-8 shrink-0 rounded-full bg-line-strong"
      aria-hidden="true"
    ></div>
    <header class="flex h-12 shrink-0 items-center justify-between gap-2 pr-1 pl-4">
      <h2 [id]="titleId" class="truncate text-heading text-ink-1">{{ title() }}</h2>
      @if (closeLabel()) {
        <button
          appIconButton
          type="button"
          icon="x"
          [label]="closeLabel()"
          (click)="close()"
        ></button>
      }
    </header>
    <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      <ng-content />
    </div>
    <div class="shrink-0 px-4 pt-2 empty:hidden"><ng-content select="[sheetFooter]" /></div>
  `,
  host: {
    class:
      'flex max-h-[90dvh] flex-col rounded-t-xl bg-surface-1 pb-[max(16px,var(--safe-bottom))] text-ink-1 shadow-2',
  },
})
export class BottomSheetComponent {
  private readonly dialogRef = inject(DialogRef, { optional: true })

  readonly title = input.required<string>()
  /** Accessible name of the close button; the button only shows when set. */
  readonly closeLabel = input('')
  readonly closed = output<void>()

  readonly titleId = `app-bottom-sheet-title-${nextId++}`

  constructor() {
    const container = inject(CdkDialogContainer, { optional: true })
    if (container) {
      container._addAriaLabelledBy(this.titleId)
      inject(DestroyRef).onDestroy(() => container._removeAriaLabelledBy(this.titleId))
    }
  }

  close(): void {
    this.closed.emit()
    this.dialogRef?.close()
  }
}
