import { TestBed } from '@angular/core/testing'
import { installFakeMedia, type FakeMedia } from '../../../testing/fake-media'
import {
  DARK_SCHEME_QUERY,
  THEME_PERSISTENCE,
  THEME_STORAGE_KEY,
  ThemeStore,
  type ThemePreference,
} from './theme.store'

describe('ThemeStore', () => {
  let media: FakeMedia
  let document: Document

  function addThemeColorMetas(): void {
    for (const scheme of ['light', 'dark']) {
      const meta = document.createElement('meta')
      meta.name = 'theme-color'
      meta.dataset['scheme'] = scheme
      meta.setAttribute('media', `(prefers-color-scheme: ${scheme})`)
      document.head.append(meta)
    }
  }

  function metaMedia(scheme: string): string | null {
    return (
      document.head
        .querySelector(`meta[name="theme-color"][data-scheme="${scheme}"]`)
        ?.getAttribute('media') ?? null
    )
  }

  function createStore(saved: ThemePreference[] = []): ThemeStore {
    TestBed.configureTestingModule({
      providers: [
        { provide: THEME_PERSISTENCE, useValue: { save: (p: ThemePreference) => saved.push(p) } },
      ],
    })
    return TestBed.inject(ThemeStore)
  }

  beforeEach(() => {
    document = window.document
    media = installFakeMedia(window)
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
    document.head.querySelectorAll('meta[name="theme-color"]').forEach((meta) => meta.remove())
    addThemeColorMetas()
  })

  afterEach(() => {
    media.restore()
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
  })

  it('test_defaults_to_the_system_theme_when_nothing_is_stored', () => {
    const store = createStore()

    expect(store.preference()).toBe('system')
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  })

  it('test_resolved_theme_follows_the_system_while_preference_is_system', () => {
    const store = createStore()
    expect(store.resolved()).toBe('light')

    media.set(DARK_SCHEME_QUERY, true)

    expect(store.resolved()).toBe('dark')
  })

  it('test_reads_the_stored_choice_on_start', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark')

    const store = createStore()

    expect(store.preference()).toBe('dark')
    expect(store.resolved()).toBe('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('test_ignores_a_corrupt_stored_value', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'sepia')

    expect(createStore().preference()).toBe('system')
  })

  it('test_explicit_choice_sets_data_theme_and_is_stored', () => {
    const store = createStore()

    store.setPreference('dark')

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
  })

  it('test_explicit_choice_pins_the_matching_status_bar_colour', () => {
    const store = createStore()

    store.setPreference('dark')

    expect(metaMedia('dark')).toBe('all')
    expect(metaMedia('light')).toBe('not all')
  })

  it('test_system_choice_clears_data_theme_and_restores_the_scheme_queries', () => {
    const store = createStore()
    store.setPreference('light')

    store.setPreference('system')

    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull()
    expect(metaMedia('light')).toBe('(prefers-color-scheme: light)')
    expect(metaMedia('dark')).toBe('(prefers-color-scheme: dark)')
  })

  it('test_choice_is_sent_to_the_persistence_hook', () => {
    const saved: ThemePreference[] = []
    const store = createStore(saved)

    store.setPreference('light')

    expect(saved).toEqual(['light'])
  })

  it('test_hydrate_applies_the_server_value_without_saving_it_back', () => {
    const saved: ThemePreference[] = []
    const store = createStore(saved)

    store.hydrate('dark')

    expect(store.preference()).toBe('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
    expect(saved).toEqual([])
  })
})
