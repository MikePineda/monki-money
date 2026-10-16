import type { RecurringCadence, RecurringSource, RecurringStatus } from '@monkimoney/shared'
import { addDays } from '#domain/importing/iso_days'
import { STALE_GRACE_DAYS, type DetectedItem } from '#domain/recurring/detection'
import { addCadence, nextDueOnOrAfter } from '#domain/recurring/cadence'

/**
 * How a new detection run lands on the items a household already tracks.
 * Pure and idempotent: running it again on the same ledger plans nothing.
 *
 * - A found pattern lands on the item with its merchant key, else on an
 *   item typed by hand under one of its payee keys (a "Rent" item and the
 *   imported transfers the person named "Rent"); otherwise it becomes a
 *   new item.
 * - A `dismissed` item is left alone: detection never brings it back.
 * - Otherwise the observations always refresh (`occurrences`,
 *   `lastPaidDate`); the fields a person may edit refresh only on detected
 *   items and only while that person never changed them (`editedFields`).
 * - The next due date follows the latest payment with the item's own
 *   cadence. When a person set it (or typed the item), it holds until a
 *   payment reaches it.
 * - Status: a detected item whose status no person chose is paused when
 *   its merchant has not been paid for two steps plus STALE_GRACE_DAYS (a
 *   cancelled subscription stops counting as committed, even after a person
 *   set its category), and resumed when its payments come back. A status a
 *   person chose is never changed.
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
  'status',
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
    | (typeof DETECTED_FIELDS)[number]
    | 'occurrences'
    | 'lastPaidDate'
    | 'nextExpectedDate'
    | 'status'
  >
>

export type RedetectionPlan = {
  create: DetectedItem[]
  update: Array<{ id: number; changes: ItemChanges }>
}

/** True when detection may change a detected item's status: no person chose it. */
function statusIsDetections(item: TrackedItem): boolean {
  return item.source === 'detected' && !item.editedFields.includes('status')
}

/** True for an item detection paused (not a person). */
export function pausedByDetection(item: Pick<TrackedItem, 'status' | 'editedFields'>): boolean {
  return item.status === 'paused' && !item.editedFields.includes('status')
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
  if (pausedByDetection(item) && item.source === 'detected') set('status', 'active')
  return changes
}

/** No payment for two steps plus the grace: a detected subscription that ended. */
function lapsed(item: TrackedItem, lastSeen: string | undefined, today: string): boolean {
  const last = [item.lastPaidDate, lastSeen]
    .filter((date): date is string => !!date)
    .sort()
    .at(-1)
  return last !== undefined && addDays(addCadence(last, item.cadence, 2), STALE_GRACE_DAYS) < today
}

/**
 * @param lastSeen The latest payment date of each merchant or payee key in
 *   the ledger, so an item whose pattern broke (a new price) but is still
 *   being paid is not taken for a cancelled one.
 */
export function planRedetection(
  tracked: TrackedItem[],
  detected: DetectedItem[],
  today: string,
  lastSeen: ReadonlyMap<string, string> = new Map()
): RedetectionPlan {
  const byKey = new Map(tracked.map((item) => [item.merchantKey, item]))
  const plan: RedetectionPlan = { create: [], update: [] }
  const matched = new Set<number>()

  const landing = (found: DetectedItem) =>
    byKey.get(found.merchantKey) ??
    found.payeeKeys
      .map((key) => byKey.get(key))
      .find((item) => item !== undefined && item.source === 'manual' && !matched.has(item.id))

  for (const found of detected) {
    const item = landing(found)
    if (!item) {
      plan.create.push(found)
      continue
    }
    matched.add(item.id)
    if (item.status === 'dismissed') continue

    const changes = changesFor(item, found, today)
    if (Object.keys(changes).length > 0) plan.update.push({ id: item.id, changes })
  }

  for (const item of tracked) {
    if (matched.has(item.id) || item.status !== 'active' || !statusIsDetections(item)) continue
    if (lapsed(item, lastSeen.get(item.merchantKey), today)) {
      plan.update.push({ id: item.id, changes: { status: 'paused' } })
    }
  }
  return plan
}
