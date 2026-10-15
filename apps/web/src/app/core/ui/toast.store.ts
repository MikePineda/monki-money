import { Injectable, signal } from '@angular/core'

export type ToastStatus = 'good' | 'warning' | 'serious' | 'critical'

export interface ToastAction {
  /** Transloco key of the action label ("Deshacer", "Actualizar"). */
  labelKey: string
  run: () => void
}

export interface ToastRequest {
  /** Transloco key of the message; translated where the toast renders. */
  messageKey: string
  params?: Record<string, string | number>
  status?: ToastStatus
  action?: ToastAction
  /** Stays until dismissed or acted on (for example "new version ready"). */
  persistent?: boolean
}

export interface ActiveToast extends ToastRequest {
  id: number
}

export const TOAST_DEFAULT_MS = 5_000
export const TOAST_ACTION_MS = 8_000

/**
 * One toast at a time (DESIGN.md, Toast): a new one replaces the visible one.
 * Auto-dismiss after 5 s, 8 s when it carries an action, never when it is
 * persistent. The layouts render `current()` in an aria-live region.
 */
@Injectable({ providedIn: 'root' })
export class ToastStore {
  private readonly _current = signal<ActiveToast | null>(null)
  private timer: ReturnType<typeof setTimeout> | undefined
  private nextId = 1

  readonly current = this._current.asReadonly()

  show(request: ToastRequest): number {
    this.clearTimer()
    const toast: ActiveToast = { ...request, id: this.nextId++ }
    this._current.set(toast)
    if (!request.persistent) {
      const duration = request.action ? TOAST_ACTION_MS : TOAST_DEFAULT_MS
      this.timer = setTimeout(() => this.dismiss(toast.id), duration)
    }
    return toast.id
  }

  /** Closes the visible toast, or only the given one if it is still visible. */
  dismiss(id?: number): void {
    const current = this._current()
    if (!current || (id !== undefined && current.id !== id)) {
      return
    }
    this.clearTimer()
    this._current.set(null)
  }

  /** Runs the visible toast's action once and closes it. */
  runAction(): void {
    const current = this._current()
    if (!current?.action) {
      return
    }
    this.dismiss(current.id)
    current.action.run()
  }

  private clearTimer(): void {
    if (this.timer !== undefined) {
      clearTimeout(this.timer)
      this.timer = undefined
    }
  }
}
