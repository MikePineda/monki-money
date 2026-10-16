import { DialogRef } from '@angular/cdk/dialog'
import { Component, computed, inject, signal } from '@angular/core'
import { TranslocoPipe } from '@jsverse/transloco'
import { provideOutboxI18n } from '../../core/outbox/outbox-i18n'
import { OutboxStore } from '../../core/outbox/outbox.store'
import { BottomSheetComponent } from '../../shared/ui/bottom-sheet/bottom-sheet.component'
import { ButtonComponent } from '../../shared/ui/button/button.component'

/** What the person chose: log out (nothing left to lose, or anyway) or stay signed in. */
export type LogoutChoice = 'logout' | 'stay'

/**
 * Asked before an explicit logout while the outbox still holds entries
 * (logging out deletes them from this device): how many would be lost and
 * three ways out. "Sync now" sends them and, once nothing is left, goes on
 * with the logout; when something stays (offline, refused) the sheet says
 * so and waits. "Log out anyway" drops them; "Cancel" keeps the session.
 * Carries its own `outbox` scope, so any screen can open it.
 */
@Component({
  selector: 'app-logout-warning-sheet',
  imports: [BottomSheetComponent, ButtonComponent, TranslocoPipe],
  providers: [provideOutboxI18n()],
  template: `
    <app-bottom-sheet
      [title]="'outbox.logout.title' | transloco"
      [closeLabel]="'ui.sheet.close' | transloco"
    >
      <div class="flex flex-col gap-2 px-4 pb-4" data-testid="outbox.logout">
        <p class="text-body text-ink-2" data-testid="outbox.logout.body">
          {{ 'outbox.logout.body' | transloco: { count: count() } }}
        </p>
        @if (stuck()) {
          <p class="text-label text-ink-1" role="status" data-testid="outbox.logout.stuck">
            {{ 'outbox.logout.stuck' | transloco }}
          </p>
        }
      </div>
      <div sheetFooter class="flex flex-col gap-2">
        <button
          appButton
          type="button"
          size="block"
          icon="refresh-cw"
          data-testid="outbox.logout.sync"
          [loading]="syncing()"
          (click)="syncNow()"
        >
          {{ 'outbox.logout.sync' | transloco }}
        </button>
        <button
          appButton
          type="button"
          variant="destructive"
          icon="log-out"
          data-testid="outbox.logout.confirm"
          [disabled]="syncing()"
          (click)="close('logout')"
        >
          {{ 'outbox.logout.confirm' | transloco }}
        </button>
        <button
          appButton
          type="button"
          variant="ghost"
          data-testid="outbox.logout.cancel"
          (click)="close('stay')"
        >
          {{ 'outbox.logout.cancel' | transloco }}
        </button>
      </div>
    </app-bottom-sheet>
  `,
})
export class LogoutWarningSheetComponent {
  private readonly outbox = inject(OutboxStore)
  private readonly dialogRef = inject<DialogRef<LogoutChoice>>(DialogRef)

  /** Everything that would be lost: waiting, being sent or refused. */
  protected readonly count = computed(() => this.outbox.entries().length)
  protected readonly syncing = signal(false)
  /** "Sync now" ran and something is still not on the server. */
  protected readonly stuck = signal(false)

  protected async syncNow(): Promise<void> {
    this.syncing.set(true)
    this.stuck.set(false)
    try {
      await this.outbox.retry()
    } finally {
      this.syncing.set(false)
    }
    if (this.outbox.entries().length === 0) {
      this.close('logout')
    } else {
      this.stuck.set(true)
    }
  }

  protected close(choice: LogoutChoice): void {
    this.dialogRef.close(choice)
  }
}
