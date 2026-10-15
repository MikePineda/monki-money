import { APP_LANGS, DEFAULT_LANG, isAppLang, localeFor } from './locale'

describe('locale', () => {
  it('test_spanish_maps_to_mexican_spanish_and_english_to_australian_english', () => {
    expect(localeFor('es')).toBe('es-MX')
    expect(localeFor('en')).toBe('en-AU')
  })

  it('test_english_is_the_default_language', () => {
    expect(DEFAULT_LANG).toBe('en')
    expect(APP_LANGS).toEqual(['en', 'es'])
  })

  it('test_only_supported_languages_are_accepted', () => {
    expect(isAppLang('es')).toBe(true)
    expect(isAppLang('en')).toBe(true)
    expect(isAppLang('fr')).toBe(false)
    expect(isAppLang(null)).toBe(false)
    expect(isAppLang(42)).toBe(false)
  })
})
