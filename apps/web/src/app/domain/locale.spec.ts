import { APP_LANGS, DEFAULT_LANG, deviceLang, isAppLang, localeFor } from './locale'

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

  it('test_a_spanish_device_speaks_spanish', () => {
    expect(deviceLang(['es-MX', 'en-US'])).toBe('es')
    expect(deviceLang(['es-419'])).toBe('es')
    expect(deviceLang(['ES'])).toBe('es')
  })

  it('test_the_first_device_language_the_app_speaks_decides', () => {
    // French is not offered, so the next preference wins.
    expect(deviceLang(['fr-FR', 'es-MX'])).toBe('es')
    expect(deviceLang(['en-AU', 'es-MX'])).toBe('en')
  })

  it('test_any_other_device_language_is_english', () => {
    expect(deviceLang(['pt-BR', 'fr'])).toBe('en')
    expect(deviceLang([])).toBe('en')
  })
})
