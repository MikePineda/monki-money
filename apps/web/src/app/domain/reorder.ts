/**
 * Reordering a flat list (drag and drop, or the accessible ▲▼ buttons).
 * Pure: a new array, or the same one when nothing moves.
 */

/** Moves the item at `from` to `to` (clamped to the end). */
export function moveItem<T>(items: readonly T[], from: number, to: number): readonly T[] {
  const target = Math.min(Math.max(to, 0), items.length - 1)
  if (from < 0 || from >= items.length || from === target) {
    return items
  }
  const next = [...items]
  const [moved] = next.splice(from, 1) as [T]
  next.splice(target, 0, moved)
  return next
}

/** ▲ (-1) / ▼ (+1) for the item with this id. */
export function stepItem<T extends { id: number }>(
  items: readonly T[],
  id: number,
  direction: -1 | 1
): readonly T[] {
  const from = items.findIndex((item) => item.id === id)
  const to = from + direction
  if (from === -1 || to < 0 || to >= items.length) {
    return items
  }
  return moveItem(items, from, to)
}
