import { Dialog, type DialogRef } from '@angular/cdk/dialog'
import { createBlockScrollStrategy, createGlobalPositionStrategy } from '@angular/cdk/overlay'
import type { ComponentType } from '@angular/cdk/portal'
import { Injectable, Injector, inject } from '@angular/core'

export interface BottomSheetConfig<D> {
  data?: D
  /** Prefer `ariaLabelledBy` pointing at the sheet title; use this when there is none. */
  ariaLabel?: string
  ariaLabelledBy?: string
  /**
   * Parent injector for the sheet content. Pass the opener's injector when
   * the content needs providers from it (for example a Transloco scope).
   */
  injector?: Injector
}

/**
 * Opens bottom sheets (DESIGN.md, Bottom sheet) through the CDK Dialog: a
 * modal dialog anchored to the bottom edge, max 480px wide, over the scrim,
 * with page scroll locked, focus trapped inside and returned on close, and
 * closed by Escape, a scrim tap or a navigation. The sheet content uses
 * `<app-bottom-sheet>` for the grabber, title and body.
 */
@Injectable({ providedIn: 'root' })
export class BottomSheetService {
  private readonly dialog = inject(Dialog)
  private readonly injector = inject(Injector)

  open<R = unknown, D = unknown, C = unknown>(
    component: ComponentType<C>,
    config: BottomSheetConfig<D> = {}
  ): DialogRef<R, C> {
    return this.dialog.open<R, D, C>(component, {
      data: config.data,
      injector: config.injector,
      ariaLabel: config.ariaLabel ?? null,
      ariaLabelledBy: config.ariaLabelledBy ?? null,
      ariaModal: true,
      role: 'dialog',
      // Focus the sheet itself: announced as a dialog, no control picked and
      // no on-screen keyboard popping up for a search field.
      autoFocus: 'dialog',
      restoreFocus: true,
      hasBackdrop: true,
      closeOnNavigation: true,
      panelClass: 'mm-sheet-panel',
      backdropClass: 'mm-sheet-backdrop',
      width: '100%',
      maxWidth: '480px',
      positionStrategy: createGlobalPositionStrategy(this.injector)
        .centerHorizontally()
        .bottom('0'),
      scrollStrategy: createBlockScrollStrategy(this.injector),
    })
  }

  closeAll(): void {
    this.dialog.closeAll()
  }
}
