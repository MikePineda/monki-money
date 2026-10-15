import { TestBed } from '@angular/core/testing'
import { TranslocoService, TranslocoTestingModule } from '@jsverse/transloco'
import type { AppLang } from '../../domain/locale'
import { APP_LOCALE } from '../../shared/ui/app-locale.token'
import { LANG_PERSISTENCE, LANG_STORAGE_KEY, LangStore } from './lang.store'
import { provideAppLocale } from './i18n.providers'

describe('LangStore', () => {
  function createStore(saved: AppLang[] = []): LangStore {
    TestBed.configureTestingModule({
      imports: [
        TranslocoTestingModule.forRoot({
          langs: { en: { hello: 'Hello' }, es: { hello: 'Hola' } },
          translocoConfig: { availableLangs: ['en', 'es'], defaultLang: 'en' },
        }),
      ],
      providers: [
        provideAppLocale(),
        { provide: LANG_PERSISTENCE, useValue: { save: (lang: AppLang) => saved.push(lang) } },
      ],
    })
    return TestBed.inject(LangStore)
  }

  beforeEach(() => localStorage.clear())
  afterEach(() => {
    localStorage.clear()
    document.documentElement.lang = 'en-AU'
  })

  it('test_defaults_to_english_with_the_australian_locale', () => {
    const store = createStore()

    expect(store.lang()).toBe('en')
    expect(store.locale()).toBe('en-AU')
  })

  it('test_reads_the_stored_language_on_start', () => {
    localStorage.setItem(LANG_STORAGE_KEY, 'es')

    const store = createStore()

    expect(store.lang()).toBe('es')
    expect(store.locale()).toBe('es-MX')
  })

  it('test_ignores_an_unsupported_stored_language', () => {
    localStorage.setItem(LANG_STORAGE_KEY, 'fr')

    expect(createStore().lang()).toBe('en')
  })

  it('test_init_activates_and_loads_the_language_before_first_render', async () => {
    localStorage.setItem(LANG_STORAGE_KEY, 'es')
    const store = createStore()

    await store.init()

    const transloco = TestBed.inject(TranslocoService)
    expect(transloco.getActiveLang()).toBe('es')
    const key = 'hello'
    expect(transloco.translate(key)).toBe('Hola')
    expect(document.documentElement.lang).toBe('es-MX')
  })

  it('test_switching_language_updates_transloco_html_lang_storage_and_the_hook', () => {
    const saved: AppLang[] = []
    const store = createStore(saved)

    store.setLang('es')

    expect(TestBed.inject(TranslocoService).getActiveLang()).toBe('es')
    expect(document.documentElement.lang).toBe('es-MX')
    expect(localStorage.getItem(LANG_STORAGE_KEY)).toBe('es')
    expect(saved).toEqual(['es'])
  })

  it('test_hydrate_applies_the_server_language_without_saving_it_back', () => {
    const saved: AppLang[] = []
    const store = createStore(saved)

    store.hydrate('es')

    expect(store.lang()).toBe('es')
    expect(saved).toEqual([])
  })

  it('test_ui_components_read_the_locale_through_the_app_locale_token', () => {
    const store = createStore()
    const locale = TestBed.inject(APP_LOCALE)

    store.setLang('es')

    expect(locale()).toBe('es-MX')
  })
})
