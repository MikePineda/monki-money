import { Location } from '@angular/common'
import { Component, computed, inject } from '@angular/core'
import { Router } from '@angular/router'
import { TranslocoPipe } from '@jsverse/transloco'
import { HouseholdDirectory } from '../../core/household/household-directory.store'
import { ToastOutletComponent } from '../../layouts/toast-outlet/toast-outlet.component'
import { IconButtonComponent } from '../../shared/ui/icon-button/icon-button.component'
import { ReceiptReviewComponent } from './review/receipt-review.component'
import { ScanStore } from './scan.store'
import { provideScanScope } from './scan.scope'
import { ScanCaptureComponent } from './ui/scan-capture.component'

/**
 * Scan a receipt `/scan` (full screen, like the bank import): the capture
 * (camera or library, then optimise, upload and read with progress) and,
 * once the draft is back, its review. Saving goes back to where the person
 * came from (quick add, the More menu) or to the month. The household's
 * accounts and categories load while the photo is read, so the review
 * opens at once.
 */
@Component({
  selector: 'app-scan-page',
  imports: [
    IconButtonComponent,
    ReceiptReviewComponent,
    ScanCaptureComponent,
    ToastOutletComponent,
    TranslocoPipe,
  ],
  providers: [ScanStore, provideScanScope()],
  template: `
    <div
      class="mx-auto flex min-h-dvh w-full max-w-app flex-col bg-surface-0 pt-safe text-ink-1"
      data-testid="scan.page"
    >
      <app-toast-outlet class="fixed inset-x-0 top-[calc(var(--safe-top)+56px)] z-20" />
      @if (receipt(); as draft) {
        <app-receipt-review [receipt]="draft" (saved)="leave()" (discarded)="store.reset()" />
      } @else {
        <header class="flex h-14 shrink-0 items-center gap-1 pr-4 pl-1">
          <button
            appIconButton
            type="button"
            icon="arrow-left"
            data-testid="scan.back"
            [label]="'scan.back' | transloco"
            (click)="leave()"
          ></button>
          <h1 class="truncate text-title text-ink-1">{{ 'scan.title' | transloco }}</h1>
        </header>
        <app-scan-capture
          [step]="store.step()"
          [preview]="store.preview()"
          (picked)="store.pick($event)"
          (retried)="store.retry()"
          (cancelled)="store.cancel()"
        />
      }
    </div>
  `,
})
export default class ScanPage {
  protected readonly store = inject(ScanStore)
  private readonly router = inject(Router)
  private readonly location = inject(Location)

  protected readonly receipt = computed(() => {
    const step = this.store.step()
    return step.step === 'review' ? step.receipt : null
  })

  constructor() {
    void inject(HouseholdDirectory)
      .load()
      .catch(() => undefined)
  }

  /** Back to the previous screen, or to the month when /scan was opened directly. */
  protected leave(): void {
    if (this.router.lastSuccessfulNavigation()?.previousNavigation) {
      this.location.back()
    } else {
      void this.router.navigateByUrl('/month')
    }
  }
}
