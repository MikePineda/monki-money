import { test } from '@japa/runner'
import { resolveLocale } from '#domain/i18n/resolve_locale'

const supported = ['en', 'es'] as const

test.group('resolveLocale', () => {
  test('test_user_locale_wins_over_browser_and_household', ({ assert }) => {
    const locale = resolveLocale({
      userLocale: 'es',
      browserLocale: 'en',
      householdLocale: 'en',
      defaultLocale: 'en',
      supported,
    })
    assert.equal(locale, 'es')
  })

  test('test_guests_get_the_browser_locale', ({ assert }) => {
    assert.equal(resolveLocale({ browserLocale: 'es', defaultLocale: 'en', supported }), 'es')
  })

  test('test_household_locale_is_used_when_user_and_browser_have_none', ({ assert }) => {
    assert.equal(
      resolveLocale({ userLocale: null, householdLocale: 'es', defaultLocale: 'en', supported }),
      'es'
    )
  })

  test('test_unsupported_values_fall_through_to_the_default', ({ assert }) => {
    assert.equal(
      resolveLocale({
        userLocale: 'fr',
        browserLocale: 'de',
        householdLocale: 'it',
        defaultLocale: 'en',
        supported,
      }),
      'en'
    )
  })
})
