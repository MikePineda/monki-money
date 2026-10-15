import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core'
import { WINDOW } from '../platform/window.token'

export const STANDALONE_QUERY = '(display-mode: standalone)'

/** Chromium's install prompt event (not in the DOM typings). */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

export type InstallOutcome = 'accepted' | 'dismissed' | 'unavailable'

/**
 * Install support. Android/Chromium: the `beforeinstallprompt` event is kept
 * so a settings card or a one-time banner can offer "Install". iOS has no
 * prompt: the UI shows the "Share, then Add to Home Screen" hint instead.
 */
@Injectable({ providedIn: 'root' })
export class InstallService {
  private readonly window = inject(WINDOW)
  private readonly destroyRef = inject(DestroyRef)

  private deferred: BeforeInstallPromptEvent | null = null
  private readonly _canPrompt = signal(false)
  private readonly _installed = signal(false)
  private started = false

  readonly canPrompt = this._canPrompt.asReadonly()
  readonly installed = this._installed.asReadonly()
  readonly isIos = signal(this.detectIos()).asReadonly()
  readonly showIosHint = computed(() => this.isIos() && !this._installed())

  start(): void {
    if (this.started) {
      return
    }
    this.started = true
    this._installed.set(this.runsStandalone())

    const onPrompt = (event: Event): void => {
      event.preventDefault()
      this.deferred = event as BeforeInstallPromptEvent
      this._canPrompt.set(true)
    }
    const onInstalled = (): void => {
      this.deferred = null
      this._canPrompt.set(false)
      this._installed.set(true)
    }
    this.window.addEventListener('beforeinstallprompt', onPrompt)
    this.window.addEventListener('appinstalled', onInstalled)
    this.destroyRef.onDestroy(() => {
      this.window.removeEventListener('beforeinstallprompt', onPrompt)
      this.window.removeEventListener('appinstalled', onInstalled)
    })
  }

  /** Shows the browser's install dialog. The captured event can be used once. */
  async prompt(): Promise<InstallOutcome> {
    const event = this.deferred
    if (!event) {
      return 'unavailable'
    }
    this.deferred = null
    this._canPrompt.set(false)
    await event.prompt()
    const { outcome } = await event.userChoice
    return outcome
  }

  private runsStandalone(): boolean {
    const standalone = this.window.matchMedia?.(STANDALONE_QUERY).matches ?? false
    const iosStandalone = (this.window.navigator as { standalone?: boolean }).standalone === true
    return standalone || iosStandalone
  }

  private detectIos(): boolean {
    const { userAgent, maxTouchPoints } = this.window.navigator
    if (/iPhone|iPad|iPod/i.test(userAgent)) {
      return true
    }
    // iPadOS 13+ reports a desktop Safari user agent; touch support gives it away.
    return /Macintosh/i.test(userAgent) && maxTouchPoints > 1
  }
}
