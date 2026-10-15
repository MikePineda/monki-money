/**
 * A controllable `matchMedia` for jsdom (which has none). Queries whose text
 * is in `matching` report `matches: true`; `set()` flips one and notifies the
 * listeners registered through addEventListener('change').
 */
export interface FakeMedia {
  set(query: string, matches: boolean): void
  restore(): void
}

export function installFakeMedia(view: Window, matching: string[] = []): FakeMedia {
  const state = new Map<string, boolean>(matching.map((query) => [query, true]))
  const listeners = new Map<string, Set<(event: MediaQueryListEvent) => void>>()
  const original = view.matchMedia

  view.matchMedia = (query: string): MediaQueryList => {
    const list = {
      media: query,
      get matches() {
        return state.get(query) ?? false
      },
      onchange: null,
      addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
        const set = listeners.get(query) ?? new Set()
        set.add(listener)
        listeners.set(query, set)
      },
      removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
        listeners.get(query)?.delete(listener)
      },
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => true,
    }
    return list as unknown as MediaQueryList
  }

  return {
    set(query, matches) {
      state.set(query, matches)
      for (const listener of listeners.get(query) ?? []) {
        listener({ matches, media: query } as MediaQueryListEvent)
      }
    },
    restore() {
      view.matchMedia = original
    },
  }
}
