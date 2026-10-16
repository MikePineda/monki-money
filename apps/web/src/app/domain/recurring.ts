/**
 * Recurring payments on the client: the add/edit draft and the API body it
 * becomes, what each row offers by status, and the three figures of the
 * Month view's "Committed this month" card. Pure: no Angular, and the wire
 * shapes are restated structurally so domain stays free of core.
 */

/** How often a payment falls due, shortest first (the API's `RECURRING_CADENCES`). */
export const RECURRING_CADENCES = [
  'weekly',
  'fortnightly',
  'monthly',
  'quarterly',
  'yearly',
] as const
export type RecurringCadence = (typeof RECURRING_CADENCES)[number]

/** `paused` stops counting as committed; `dismissed` is "not a bill" for good. */
export type RecurringStatus = 'active' | 'paused' | 'dismissed'

/** What a person types or edits (`POST /recurring`, `PATCH /recurring/:id`). Cents, 'YYYY-MM-DD'. */
export interface RecurringFields {
  payee: string
  cadence: RecurringCadence
  amountCents: number
  nextExpectedDate: string
  categoryId: number | null
  /** null = shared ("both of us"). */
  paidByUserId: number | null
}

/** `PATCH /recurring/:id`: only what changed (each field sent becomes a person's edit). */
export type RecurringPatch = Partial<RecurringFields> & { status?: RecurringStatus }

/** What the add/edit sheet edits. */
export type RecurringDraft = RecurringFields

/** A field the draft cannot be saved without. */
export type DraftProblem = 'payee' | 'amountCents' | 'nextExpectedDate'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** A draft from an item, or a new one: monthly, due today, nothing else. */
export function draftFrom(item: RecurringFields | undefined, today: string): RecurringDraft {
  return {
    payee: item?.payee ?? '',
    cadence: item?.cadence ?? 'monthly',
    amountCents: item?.amountCents ?? 0,
    nextExpectedDate: item?.nextExpectedDate ?? today,
    categoryId: item?.categoryId ?? null,
    paidByUserId: item?.paidByUserId ?? null,
  }
}

/** What is missing before the draft can be saved, in form order. */
export function draftProblems(draft: RecurringDraft): DraftProblem[] {
  const problems: DraftProblem[] = []
  if (draft.payee.trim() === '') {
    problems.push('payee')
  }
  if (!(draft.amountCents > 0)) {
    problems.push('amountCents')
  }
  if (!ISO_DATE.test(draft.nextExpectedDate)) {
    problems.push('nextExpectedDate')
  }
  return problems
}

/** The new item's body. */
export function createBody(draft: RecurringDraft): RecurringFields {
  return { ...draft, payee: draft.payee.trim() }
}

/**
 * Only the fields the draft changed: the API remembers every field it
 * receives as a person's edit, which detection then leaves alone.
 */
export function patchOf(item: RecurringFields, draft: RecurringDraft): RecurringPatch {
  const next = createBody(draft)
  const patch: Record<string, unknown> = {}
  for (const key of Object.keys(next) as (keyof RecurringFields)[]) {
    if (next[key] !== item[key]) {
      patch[key] = next[key]
    }
  }
  return patch as RecurringPatch
}

/** What a row's sheet offers. */
export type RecurringAction = 'edit' | 'pause' | 'resume' | 'dismiss' | 'restore'

const ACTIONS: Record<RecurringStatus, RecurringAction[]> = {
  active: ['edit', 'pause', 'dismiss'],
  paused: ['edit', 'resume', 'dismiss'],
  dismissed: ['restore'],
}

export function actionsFor(status: RecurringStatus): RecurringAction[] {
  return ACTIONS[status]
}

/** The status an action leads to; null for an edit. */
export function statusAfter(action: RecurringAction): RecurringStatus | null {
  switch (action) {
    case 'pause':
      return 'paused'
    case 'resume':
    case 'restore':
      return 'active'
    case 'dismiss':
      return 'dismissed'
    default:
      return null
  }
}

export interface RecurringSections<T> {
  active: T[]
  paused: T[]
  dismissed: T[]
}

/** Items by status, each keeping the API's order (next due date first). */
export function sectionsOf<T extends { status: RecurringStatus }>(
  items: readonly T[]
): RecurringSections<T> {
  return {
    active: items.filter((item) => item.status === 'active'),
    paused: items.filter((item) => item.status === 'paused'),
    dismissed: items.filter((item) => item.status === 'dismissed'),
  }
}

/** "Already paid · Still due · Free after bills", in cents. */
export interface CommittedFigures {
  paidCents: number
  dueCents: number
  /** Income − spent − still due: what is left once every bill of the month is paid. */
  freeCents: number
}

export function committedFigures(month: {
  incomeCents: number
  expenseCents: number
  committed: { paidCents: number; upcomingCents: number }
}): CommittedFigures {
  return {
    paidCents: month.committed.paidCents,
    dueCents: month.committed.upcomingCents,
    freeCents: month.incomeCents - month.expenseCents - month.committed.upcomingCents,
  }
}
