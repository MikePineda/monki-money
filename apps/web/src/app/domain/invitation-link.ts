/**
 * Invitation links as people paste them. The API mails `<app>/invite/<token>`
 * with a base64url token (43 characters today); the person may paste the
 * whole link, the path or just the code. Pure: no Angular.
 */
const TOKEN = '[A-Za-z0-9_-]{16,}'
const IN_LINK = new RegExp(`/invite/(${TOKEN})(?:[?#]|$)`)
const BARE = new RegExp(`^${TOKEN}$`)

/** The invitation token inside what was pasted, or null when there is none. */
export function invitationToken(text: string): string | null {
  const value = text.trim()
  const fromLink = IN_LINK.exec(value)?.[1]
  if (fromLink) {
    return fromLink
  }
  return BARE.test(value) ? value : null
}
