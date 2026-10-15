import { LANG_STORAGE_KEY } from '../i18n/lang.store'
import { THEME_STORAGE_KEY } from '../theme/theme.store'

/** Prefixes of every key this app writes to Web Storage. */
const APP_PREFIXES = ['mm:', 'qa:']

/**
 * Device preferences that survive a logout: they are not personal data and
 * keeping them avoids a theme or language flash on the login screen.
 */
const DEVICE_KEYS = new Set([THEME_STORAGE_KEY, LANG_STORAGE_KEY])

function appKeys(storage: Storage): string[] {
  const keys: string[] = []
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index)
    if (key && APP_PREFIXES.some((prefix) => key.startsWith(prefix))) {
      keys.push(key)
    }
  }
  return keys
}

/** Logout: forget everything the app stored for the user (drafts, wizard progress, invites). */
export function clearAppStorage(view: Window): void {
  try {
    for (const key of appKeys(view.localStorage)) {
      if (!DEVICE_KEYS.has(key)) {
        view.localStorage.removeItem(key)
      }
    }
    for (const key of appKeys(view.sessionStorage)) {
      view.sessionStorage.removeItem(key)
    }
  } catch {
    // Storage blocked: nothing was stored either.
  }
}
