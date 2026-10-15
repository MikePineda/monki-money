/**
 * Small, failure-tolerant access to localStorage for UI preferences (theme,
 * language). Storage can be unavailable (private mode, blocked site data);
 * a preference that cannot be read simply falls back to its default.
 * Never store anything sensitive here: no tokens, no personal data.
 */
export function readPreference(view: Window, key: string): string | null {
  try {
    return view.localStorage.getItem(key)
  } catch {
    return null
  }
}

export function writePreference(view: Window, key: string, value: string | null): void {
  try {
    if (value === null) {
      view.localStorage.removeItem(key)
    } else {
      view.localStorage.setItem(key, value)
    }
  } catch {
    // Storage blocked: the preference lasts for this session only.
  }
}
