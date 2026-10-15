/*
 * Applies the stored theme before the first paint, so an explicit light or
 * dark choice never flashes the other theme. External file (not inline) so
 * the CSP can stay `script-src 'self'`. Keep the storage key in sync with
 * src/app/core/theme/theme.store.ts (THEME_STORAGE_KEY).
 *
 * The status-bar colour follows the same choice: each theme-color meta tag is
 * tagged with data-scheme, and an explicit theme pins the matching one.
 */
;(function () {
  var preference = null
  try {
    preference = window.localStorage.getItem('mm:theme')
  } catch (error) {
    preference = null
  }
  if (preference !== 'light' && preference !== 'dark') {
    return
  }
  document.documentElement.setAttribute('data-theme', preference)
  var metas = document.querySelectorAll('meta[name="theme-color"][data-scheme]')
  for (var i = 0; i < metas.length; i++) {
    var matches = metas[i].getAttribute('data-scheme') === preference
    metas[i].setAttribute('media', matches ? 'all' : 'not all')
  }
})()
