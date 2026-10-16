import type { Reconciliation } from '#domain/importing/review'
import type { ImportBatchStatus, ImportDecision, ImportRowDecision } from '@monkimoney/shared'

/**
 * Inputs and results of the import services. Amounts are integer cents,
 * dates `YYYY-MM-DD`.
 */

/** One uploaded bank export (already read into memory, at most 2 MB). */
export interface StageInput {
  buffer: Buffer
  fileName: string | null
  /** The account the file belongs to, when its number is not mapped yet. */
  accountId?: number
}

/**
 * `PATCH /imports/:id/rows/:rowId`: what a person decided for one row.
 * `reset` drops the person's decision first: the row goes back to the
 * importer's proposal (resolution included) and counts as undecided
 * unless the change sets something else. Never sent inline with confirm.
 */
export interface DecideInput extends ImportRowDecision {
  resolution?: ImportDecision
  reset?: boolean
}

/** A decision sent inline with confirm. */
export interface InlineDecision extends DecideInput {
  rowId: number
}

/** One change of `PATCH /imports/:id/rows` (the same fields as one row, plus its id). */
export type RowChange = InlineDecision

export interface ConfirmInput {
  decisions?: InlineDecision[]
}

/**
 * `all` (review screen): every open row must be decidable, and the batch
 * closes. `ready` (unattended backfill): confirms what needs no person and
 * leaves the rest staged.
 */
export type ConfirmMode = 'all' | 'ready'

export interface ConfirmResult {
  batchId: number
  status: ImportBatchStatus
  created: number
  matched: number
  ignored: number
  transfers: number
  /** Rows still waiting for a decision (only in `ready` mode). */
  remaining: number
  reconciliation: Reconciliation
}

export interface ImportListFilters {
  status?: ImportBatchStatus
  page?: number
  perPage?: number
}
