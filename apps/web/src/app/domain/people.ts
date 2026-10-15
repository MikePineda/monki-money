/**
 * Names as the UI uses them. Pure: no Angular. The UI never assumes a name
 * in copy; these only shape the names people typed themselves.
 */
export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? ''
}

/** One letter for an avatar; "?" when there is no name. */
export function initial(fullName: string): string {
  const letter = [...fullName.trim()][0]
  return letter ? letter.toLocaleUpperCase() : '?'
}
