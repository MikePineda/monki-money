import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { Component, inject } from '@angular/core'
import { TranslocoPipe } from '@jsverse/transloco'
import { BottomSheetComponent } from '../../../shared/ui/bottom-sheet/bottom-sheet.component'
import { ButtonComponent } from '../../../shared/ui/button/button.component'

export interface DeleteGoalSheetData {
  name: string
}

/**
 * The confirmation before deleting a goal (DESIGN.md, Button: destructive):
 * what goes and what stays, a destructive "Delete goal" and a way out.
 * Closes with true when confirmed. Open it with the page's injector so it
 * reads the `goals` scope.
 */
@Component({
  selector: 'app-delete-goal-sheet',
  imports: [BottomSheetComponent, ButtonComponent, TranslocoPipe],
  template: `
    <app-bottom-sheet
      [title]="'goals.detail.delete.title' | transloco: { name: data.name }"
      [closeLabel]="'ui.sheet.close' | transloco"
    >
      <p class="px-4 pb-2 text-body text-ink-2">{{ 'goals.detail.delete.body' | transloco }}</p>
      <div sheetFooter class="flex flex-col gap-2">
        <button
          appButton
          type="button"
          variant="destructive"
          size="block"
          data-testid="goals.delete.confirm"
          (click)="dialogRef.close(true)"
        >
          {{ 'goals.detail.delete.confirm' | transloco }}
        </button>
        <button appButton type="button" variant="ghost" (click)="dialogRef.close(false)">
          {{ 'goals.detail.delete.cancel' | transloco }}
        </button>
      </div>
    </app-bottom-sheet>
  `,
})
export class DeleteGoalSheetComponent {
  protected readonly dialogRef = inject<DialogRef<boolean>>(DialogRef)
  protected readonly data = inject<DeleteGoalSheetData>(DIALOG_DATA)
}
