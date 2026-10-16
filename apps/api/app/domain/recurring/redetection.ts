import type { RecurringCadence, RecurringSource, RecurringStatus } from '@monkimoney/shared'
import type { DetectedItem } from '#domain/recurring/detection'
import { nextDueOnOrAfter } from '#domain/recurring/cadence'

/**
 * How a new detection run lands on the items a household already tracks.
 * Pure and idempotent: running it again on the same ledger plans nothing.
 *
 * - A merchant nobody tracks yet becomes a new item.
 * - A `dismissed` item is left alone: detection never brings it back.
 * - Otherwise the observations always refresh (`occurrences`,
 *   `lastPaidDate`); the fields a person may edit refresh only on detected
 *   items and only while that person never changed them (`editedFields`);
 *   the status never changes (a paused item stays paused).
 * - The next due date follows the latest payment with the item's own
 *   cadence. When a person set it (or typed the item), it holds until a
 *   payment reaches it.
 */

/** Fields a person can change on an item (PATCH); detection never overwrites them afterwards. */
export const EDITABLE_FIELDS = [
  'payee',
  'cadence',
  'amountCents',
  'amountTolerancePct',
  'categoryId',
  'accountId',
  'paidByUserId',
  'nextExpectedDate',
] as const
export type EditableField = (typeof EDITABLE_FIELDS)[number]

/** Detected values that refresh an item nobody edited. */
const DETECTED_FIELDS = [
  'payee',
  'cadence',
  'amountCents',
  'categoryId',
  'accountId',
  'paidByUserId',
] as const satisfies readonly (EditableField & keyof DetectedItem)[]

/** An item as the household tracks it. */
export type TrackedItem = {
  id: number
  merchantKey: string
  payee: string
  cadence: RecurringCadence
  amountCents: number
  categoryId: number | null
  accountId: number | null
  paidByUserId: number | null
  lastPaidDate: string | null
  nextExpectedDate: string
  occurrences: number
  status: RecurringStatus
  source: RecurringSource
  editedFields: readonly string[]
}

export type ItemChanges = Partial<
  Pick<
    TrackedItem,
    (typeof DETECTED_FIELDS)[number] | 'occurrences' | 'lastPaidDate' | 'nextExpectedDate'
  >
>

export type RedetectionPlan = {
  create: DetectedItem[]
  update: Array<{ id: number; changes: ItemChanges }>
}

function changesFor(item: TrackedItem, found: DetectedItem, today: string): ItemChanges {
  const edited = new Set(item.editedFields)
  const manual = item.source === 'manual'
  const changes: ItemChanges = {}
  const set = <Key extends keyof ItemChanges>(key: Key, value: TrackedItem[Key]) => {
    if (item[key] !== value) changes[key] = value
  }

  if (!manual) {
    for (const field of DETECTED_FIELDS) {
      if (!edited.has(field)) set(field, found[field])
    }
  }
  set('occurrences', found.occurrences)
  set('lastPaidDate', found.lastPaidDate)

  const cadence = changes.cadence ?? item.cadence
  const personsDate = manual || edited.has('nextExpectedDate')
  if (!personsDate || found.lastPaidDate >= item.nextExpectedDate) {
    set('nextExpectedDate', nextDueOnOrAfter(found.lastPaidDate, cadence, today))
  }
  return changes
}

export function planRedetection(
  tracked: TrackedItem[],
  detected: DetectedItem[],
  today: string
): RedetectionPlan {
  const byKey = new Map(tracked.map((item) => [item.merchantKey, item]))
  const plan: RedetectionPlan = { create: [], update: [] }

  for (const found of detected) {
    const item = byKey.get(found.merchantKey)
    if (!item) {
      plan.create.push(found)
      continue
    }
    if (item.status === 'dismissed') continue

    const changes = changesFor(item, found, today)
    if (Object.keys(changes).length > 0) plan.update.push({ id: item.id, changes })
  }
  return plan
}
