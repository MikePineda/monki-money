import { vi, type Mock } from 'vitest'
import type { TurnstileApi, TurnstileRenderOptions } from '../app/core/auth/turnstile.service'

/**
 * A stand-in for Cloudflare's `window.turnstile` (specs never touch the
 * network). Widgets get ids `widget-1`, `widget-2`...; `solve`, `expire` and
 * `fail` drive the callbacks of the newest widget still on the page.
 */
export interface FakeTurnstile extends TurnstileApi {
  render: Mock<TurnstileApi['render']>
  reset: Mock<TurnstileApi['reset']>
  remove: Mock<TurnstileApi['remove']>
  /** Options of the widgets still rendered, by id. */
  widgets: Map<string, TurnstileRenderOptions>
  solve(token: string): void
  expire(): void
  fail(): void
}

type TurnstileWindow = Window & { turnstile?: TurnstileApi }

export function fakeTurnstile(): FakeTurnstile {
  const widgets = new Map<string, TurnstileRenderOptions>()
  let count = 0
  const newest = (): TurnstileRenderOptions => {
    const options = [...widgets.values()].at(-1)
    if (!options) {
      throw new Error('No Turnstile widget is rendered')
    }
    return options
  }
  const api: FakeTurnstile = {
    widgets,
    render: vi.fn((_host: HTMLElement, options: TurnstileRenderOptions) => {
      count += 1
      const id = `widget-${count}`
      widgets.set(id, options)
      return id
    }),
    reset: vi.fn(),
    remove: vi.fn((id: string) => {
      widgets.delete(id)
    }),
    solve: (token) => newest().callback(token),
    expire: () => newest()['expired-callback'](),
    fail: () => {
      newest()['error-callback']('300030')
    },
  }
  ;(window as TurnstileWindow).turnstile = api
  return api
}

export function clearTurnstile(): void {
  delete (window as TurnstileWindow).turnstile
}
