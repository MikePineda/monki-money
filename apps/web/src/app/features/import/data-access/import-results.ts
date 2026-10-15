import { Injectable, inject } from '@angular/core'
import type { ImportBatch } from '../../../core/api/api-types'
import { SessionStore } from '../../../core/auth/session.store'
import type { ConfirmResult } from './imports.api'

/** What the result screen shows: confirm's answer and the batch it closed. */
export interface ImportOutcome {
  result: ConfirmResult
  batch: ImportBatch
}

/**
 * The confirm results of this session, by batch id, so the result screen
 * shows exactly what confirm answered. After a reload it falls back to the
 * completed batch's counts ({@link resultFromBatch}). Forgotten on logout.
 */
@Injectable({ providedIn: 'root' })
export class ImportResults {
  private readonly outcomes = new Map<number, ImportOutcome>()

  constructor() {
    inject(SessionStore).onClear(() => this.outcomes.clear())
  }

  remember(result: ConfirmResult, batch: ImportBatch): void {
    this.outcomes.set(result.batchId, { result, batch })
  }

  get(batchId: number): ImportOutcome | null {
    return this.outcomes.get(batchId) ?? null
  }
}

/** A completed batch read back as a confirm result (its counts are by final resolution). */
export function resultFromBatch(batch: ImportBatch): ConfirmResult {
  return {
    batchId: batch.id,
    status: batch.status,
    created: batch.counts.new,
    matched: batch.counts.autoMatched,
    ignored: batch.counts.ignored,
    transfers: batch.counts.transferLeg,
    remaining: 0,
    reconciliation: batch.reconciliation,
  }
}
