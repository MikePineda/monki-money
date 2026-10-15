import { DOCUMENT, DestroyRef, Injectable, inject, signal } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { SwUpdate } from '@angular/service-worker'
import { marker } from '@jsverse/transloco-keys-manager/marker'
import { filter } from 'rxjs'
import { PAGE_RELOAD } from '../platform/window.token'
import { ToastStore } from '../ui/toast.store'

/**
 * New-version handling for the installed PWA. A downloaded version is
 * announced with a persistent toast and only applied when the user taps
 * "Update": the app never reloads by itself (it could be mid quick-add or
 * mid import). Updates are checked whenever the app returns to the
 * foreground, and a broken cache raises a banner that asks for a reload.
 */
@Injectable({ providedIn: 'root' })
export class UpdateService {
  private readonly sw = inject(SwUpdate)
  private readonly toasts = inject(ToastStore)
  private readonly document = inject(DOCUMENT)
  private readonly reload = inject(PAGE_RELOAD)
  private readonly destroyRef = inject(DestroyRef)

  private readonly _unrecoverable = signal(false)
  readonly unrecoverable = this._unrecoverable.asReadonly()

  private started = false

  start(): void {
    if (this.started || !this.sw.isEnabled) {
      return
    }
    this.started = true

    this.sw.versionUpdates
      .pipe(
        filter((event) => event.type === 'VERSION_READY'),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(() =>
        this.toasts.show({
          messageKey: marker('pwa.update.ready'),
          persistent: true,
          action: { labelKey: marker('pwa.update.action'), run: () => void this.applyUpdate() },
        })
      )

    this.sw.unrecoverable
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this._unrecoverable.set(true))

    const onVisibility = (): void => {
      if (this.document.visibilityState === 'visible') {
        void this.sw.checkForUpdate().catch(() => undefined)
      }
    }
    this.document.addEventListener('visibilitychange', onVisibility)
    this.destroyRef.onDestroy(() =>
      this.document.removeEventListener('visibilitychange', onVisibility)
    )
  }

  /** User-initiated: activate the waiting version, then load it. */
  async applyUpdate(): Promise<void> {
    await this.sw.activateUpdate().catch(() => false)
    this.reload()
  }

  /** User-initiated recovery from a broken cache. */
  reloadNow(): void {
    this.reload()
  }
}
