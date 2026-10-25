/**
 * Changes to the free labels of a ledger row (`transactions.tags`). Tags
 * match exactly, case included, and a row never carries one twice.
 */

/** At most this many tags on one row (the form's limit, `tags()` in the validators). */
export const MAX_TAGS = 20

/** Labels in their first order, each once. */
function distinct(tags: readonly string[]): string[] {
  return [...new Set(tags)]
}

/**
 * `tags` with `from` renamed to `to`. When the row already carries `to`
 * the two fold into one, at the place of whichever came first; a rename
 * that only changes the case works the same way.
 */
export function renameTag(tags: readonly string[], from: string, to: string): string[] {
  return distinct(tags.map((tag) => (tag === from ? to : tag)))
}

export interface TagChanges {
  add: readonly string[]
  remove: readonly string[]
}

/**
 * `tags` without `remove` and with `add` after the existing ones (a tag
 * both added and removed is removed). `fits` is false when the result
 * would pass {@link MAX_TAGS}: the caller leaves that row as it was.
 */
export function editTags(
  tags: readonly string[],
  changes: TagChanges
): { tags: string[]; fits: boolean } {
  const removed = new Set(changes.remove)
  const next = distinct([...tags, ...changes.add]).filter((tag) => !removed.has(tag))
  return { tags: next, fits: next.length <= MAX_TAGS }
}
