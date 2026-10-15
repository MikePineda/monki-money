import type { DialogRef } from '@angular/cdk/dialog'
import { Component, DestroyRef, Injector, effect, inject, input, untracked } from '@angular/core'
import { Router } from '@angular/router'
import { BottomSheetService } from '../../../shared/ui/bottom-sheet/bottom-sheet.service'
import { EditSheetComponent, type EditSheetData } from './edit.sheet'

/**
 * `/transactions/:id`: renders nothing itself and opens the transaction
 * sheet over the list (it lives in the list's outlet, so the sheet shares
 * the list's store and translations). Closing the sheet goes back to
 * `/transactions`; leaving the route closes the sheet.
 */
@Component({
  selector: 'app-transaction-route',
  template: '',
})
export default class TransactionRoute {
  private readonly sheets = inject(BottomSheetService)
  private readonly router = inject(Router)
  private readonly injector = inject(Injector)

  /** The `:id` route parameter (component input binding). */
  readonly id = input.required<string>()

  private sheet: DialogRef<unknown, EditSheetComponent> | null = null

  constructor() {
    effect(() => {
      const id = Number(this.id())
      untracked(() => this.open(id))
    })
    inject(DestroyRef).onDestroy(() => {
      const sheet = this.sheet
      this.sheet = null
      sheet?.close()
    })
  }

  private open(id: number): void {
    const previous = this.sheet
    this.sheet = null
    previous?.close()
    if (!Number.isInteger(id) || id <= 0) {
      void this.router.navigateByUrl('/transactions')
      return
    }
    const sheet = this.sheets.open<unknown, EditSheetData, EditSheetComponent>(EditSheetComponent, {
      data: { id },
      injector: this.injector,
    })
    this.sheet = sheet
    sheet.closed.subscribe(() => {
      if (this.sheet === sheet) {
        this.sheet = null
        void this.router.navigateByUrl('/transactions')
      }
    })
  }
}
