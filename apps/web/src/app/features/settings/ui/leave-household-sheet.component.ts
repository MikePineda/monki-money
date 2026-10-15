import { DIALOG_DATA } from '@angular/cdk/dialog'
import { Component, inject, signal } from '@angular/core'
import { TranslocoPipe } from '@jsverse/transloco'
import { BottomSheetComponent } from '../../../shared/ui/bottom-sheet/bottom-sheet.component'
import { ButtonComponent } from '../../../shared/ui/button/button.component'

export interface LeaveHouseholdSheetData {
  householdName: string
  /** Leaves the household; resolves to null on success (the opener moves on) or the reason it failed. */
  confirm: () => Promise<string | null>
}

/**
 * The confirmation before a member leaves the household (DESIGN.md, Button:
 * destructive, confirmed in a sheet). It says what happens to their entries
 * (they stay with the household) and what comes next (their own household
 * or an invitation). No password: leaving deletes nothing.
 */
@Component({
  selector: 'app-leave-household-sheet',
  imports: [BottomSheetComponent, ButtonComponent, TranslocoPipe],
  template: `
    <app-bottom-sheet
      [title]="'settings.danger.leaveSheet.title' | transloco: { name: data.householdName }"
      [closeLabel]="'ui.sheet.close' | transloco"
    >
      <div class="flex flex-col gap-3 px-4 pb-2">
        <p class="text-body text-ink-2">
          {{ 'settings.danger.leaveSheet.body' | transloco: { name: data.householdName } }}
        </p>
        <p class="text-body text-ink-2">{{ 'settings.danger.leaveSheet.after' | transloco }}</p>
        @if (error(); as message) {
          <p class="text-label text-status-critical" role="alert">{{ message }}</p>
        }
      </div>
      <button
        sheetFooter
        appButton
        type="button"
        variant="destructive"
        size="block"
        icon="log-out"
        data-testid="leave.confirm"
        [loading]="leaving()"
        (click)="leave()"
      >
        {{ 'settings.danger.leaveSheet.confirm' | transloco }}
      </button>
    </app-bottom-sheet>
  `,
})
export class LeaveHouseholdSheetComponent {
  protected readonly data = inject<LeaveHouseholdSheetData>(DIALOG_DATA)

  protected readonly leaving = signal(false)
  protected readonly error = signal<string | null>(null)

  protected async leave(): Promise<void> {
    if (this.leaving()) {
      return
    }
    this.leaving.set(true)
    this.error.set(null)
    this.error.set(await this.data.confirm())
    this.leaving.set(false)
  }
}
