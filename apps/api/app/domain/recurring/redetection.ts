import type { RecurringCadence, RecurringSource, RecurringStatus } from '@monkimoney/shared'
import { addDays } from '#domain/importing/iso_days'
import { keysNameTheSameMerchant } from '#domain/recurring/merchant_key'
import {
  STALE_GRACE_DAYS,
  withinTolerance,
  type DetectedItem,
  type Payment,
} from '#domain/recurring/detection'
import { addCadence, nextDueOnOrAfter } from '#domain/recurring/cadence'

/**
 * How a new detection run lands on the items a household already tracks.
 * Pure and idempotent: running it again on the same ledger plans nothing.
 *
 * - A found pattern lands on an item with its merchant key, else on an
 *   item typed by hand under one of its payee keys (a "Rent" item and the
 *   imported transfers the person named "Rent") or under a name that is
 *   its merchant once noise words drop (`keysNameTheSameMerchant`: a typed
 *   "StreamFlix" and the bank's STREAMFLIX.COM); otherwise it becomes a
 *   new item. Several items may share a merchant key (two phone lines), so
 *   the amount decides: a pattern lands on the item whose amount it is
 *   within the tolerance of (closest first, the merchant key before a
 *   payee key). A pattern within no item's tolerance still lands on the
 *   only item it could be when that item could be no other pattern (the
 *   same bill at a new price); when it could be several items it changes
 *   nothing (guessing would move one line onto another), and when every
 *   item it could be is taken it is a new item (a second line).
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
 *   person chose is never changed. When other items share its merchant key,
 *   only payments within its tolerance count as its own.
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
  amountTolerancePct: number
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

/** A payment of the ledger, as the pause check needs it. */
export type SeenPayment = Pick<Payment, 'date' | 'amountCents' | 'merchantKey' | 'payeeKey'>

/** No payment for two steps plus the grace: a detected subscription that ended. */
function lapsed(item: TrackedItem, lastSeen: string | undefined, today: string): boolean {
  const last = [item.lastPaidDate, lastSeen]
    .filter((date): date is string => !!date)
    .sort()
    .at(-1)
  return last !== undefined && addDays(addCadence(last, item.cadence, 2), STALE_GRACE_DAYS) < today
}

/**
 * The latest payment under the item's key: any amount when the item is
 * the merchant's only one (a new price is still the same bill), else only
 * within its tolerance (the other line's payments are not its own).
 */
function lastSeenOf(item: TrackedItem, tracked: TrackedItem[], seen: readonly SeenPayment[]) {
  const shared = tracked.some(
    (other) =>
      other.id !== item.id && other.status !== 'dismissed' && other.merchantKey === item.merchantKey
  )
  let last: string | undefined
  for (const payment of seen) {
    if (payment.merchantKey !== item.merchantKey && payment.payeeKey !== item.merchantKey) continue
    if (
      shared &&
      !withinTolerance(payment.amountCents, item.amountCents, item.amountTolerancePct)
    ) {
      continue
    }
    if (last === undefined || payment.date > last) last = payment.date
  }
  return last
}

/**
 * How well a found pattern names an item (0 best), or null when it cannot
 * land on it: its merchant key, else (items typed by hand only) one of its
 * payee keys, else the same merchant once noise words drop.
 */
function landingLevel(item: TrackedItem, found: DetectedItem): 0 | 1 | 2 | null {
  if (item.merchantKey === found.merchantKey) return 0
  if (item.source !== 'manual') return null
  if (found.payeeKeys.includes(item.merchantKey)) return 1
  const keys = [found.merchantKey, ...found.payeeKeys]
  return keys.some((key) => keysNameTheSameMerchant(item.merchantKey, key)) ? 2 : null
}

/**
 * Which item each found pattern lands on (by index of `detected`): first
 * the pairs within the item's tolerance, best key then closest amount;
 * then a pattern and an item left over that could only be each other.
 * `undefined` = a new item; null = changes nothing (ambiguous).
 */
function landings(tracked: TrackedItem[], detected: DetectedItem[]) {
  const pairs = detected.flatMap((found, index) =>
    tracked.flatMap((item) => {
      const level = landingLevel(item, found)
      return level === null ? [] : [{ index, item, level }]
    })
  )
  const landed = new Map<number, TrackedItem | null>()
  const taken = new Set<number>()

  const close = pairs
    .filter(({ index, item }) =>
      withinTolerance(detected[index].amountCents, item.amountCents, item.amountTolerancePct)
    )
    .map((pair) => ({
      ...pair,
      distance: Math.abs(detected[pair.index].amountCents - pair.item.amountCents),
    }))
    .sort((a, b) => a.level - b.level || a.distance - b.distance || a.item.id - b.item.id)
  for (const { index, item } of close) {
    if (landed.has(index) || taken.has(item.id)) continue
    landed.set(index, item)
    taken.add(item.id)
  }

  const open = pairs.filter(({ index, item }) => !landed.has(index) && !taken.has(item.id))
  detected.forEach((_, index) => {
    if (landed.has(index)) return
    const mine = open.filter((pair) => pair.index === index)
    if (mine.length === 0) return
    const [only] = mine
    const rivals = open.filter((pair) => pair.item.id === only.item.id && pair.index !== index)
    landed.set(index, mine.length === 1 && rivals.length === 0 ? only.item : null)
  })
  return landed
}

/**
 * @param seen The household's payments in the detection window, so an
 *   item whose pattern broke (a new price) but is still being paid is not
 *   taken for a cancelled one.
 */
export function planRedetection(
  tracked: TrackedItem[],
  detected: DetectedItem[],
  today: string,
  seen: readonly SeenPayment[] = []
): RedetectionPlan {
  const plan: RedetectionPlan = { create: [], update: [] }
  const matched = new Set<number>()
  const landed = landings(tracked, detected)

  detected.forEach((found, index) => {
    const item = landed.get(index)
    if (item === undefined) {
      plan.create.push(found)
      return
    }
    if (item === null) return
    matched.add(item.id)
    if (item.status === 'dismissed') return

    const changes = changesFor(item, found, today)
    if (Object.keys(changes).length > 0) plan.update.push({ id: item.id, changes })
  })

  for (const item of tracked) {
    if (matched.has(item.id) || item.status !== 'active' || !statusIsDetections(item)) continue
    if (lapsed(item, lastSeenOf(item, tracked, seen), today)) {
      plan.update.push({ id: item.id, changes: { status: 'paused' } })
    }
  }
  return plan
}
