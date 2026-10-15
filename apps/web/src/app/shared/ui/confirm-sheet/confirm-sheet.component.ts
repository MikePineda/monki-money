import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { Component, inject } from '@angular/core'
import { map, type Observable } from 'rxjs'
import { BottomSheetComponent } from '../bottom-sheet/bottom-sheet.component'
import type { BottomSheetService } from '../bottom-sheet/bottom-sheet.service'
import { ButtonComponent } from '../button/button.component'

export interface ConfirmSheetData {
  title: string
  /** One or two sentences: what happens and what is kept. */
  body: string
  /** States exactly what happens ("Cancel import", "Delete rule"). */
  confirmLabel: string
  /** Keeps things as they are ("Keep reviewing"). */
  cancelLabel: string
  /** A destructive confirm (red outline and trash icon, never a red fill). */
  destructive?: boolean
}

/**
 * A yes/no question in a bottom sheet (DESIGN.md, Bottom sheet and Button):
 * the fact in one or two sentences, the confirm action (destructive when it
 * removes something) and a way back. Closes with true only when confirmed.
 */
@Component({
  selector: 'app-confirm-sheet',
  imports: [BottomSheetComponent, ButtonComponent],
  template: `
    <app-bottom-sheet [title]="data.title">
      <p class="px-4 pb-4 text-body text-ink-2" data-testid="confirm.body">{{ data.body }}</p>
      <div sheetFooter class="flex flex-col gap-2">
        <button
          appButton
          type="button"
          size="block"
          data-testid="confirm.yes"
          [variant]="data.destructive ? 'destructive' : 'primary'"
          (click)="close(true)"
        >
          {{ data.confirmLabel }}
        </button>
        <button
          appButton
          type="button"
          variant="ghost"
          data-testid="confirm.no"
          (click)="close(false)"
        >
          {{ data.cancelLabel }}
        </button>
      </div>
    </app-bottom-sheet>
  `,
})
export class ConfirmSheetComponent {
  protected readonly data = inject<ConfirmSheetData>(DIALOG_DATA)
  private readonly dialogRef = inject<DialogRef<boolean>>(DialogRef)

  protected close(confirmed: boolean): void {
    this.dialogRef.close(confirmed)
  }
}

/** Asks and emits true when confirmed, false when declined or dismissed. */
export function openConfirmSheet(
  sheets: BottomSheetService,
  data: ConfirmSheetData
): Observable<boolean> {
  return sheets
    .open<boolean, ConfirmSheetData, ConfirmSheetComponent>(ConfirmSheetComponent, { data })
    .closed.pipe(map((answer) => answer === true))
}
