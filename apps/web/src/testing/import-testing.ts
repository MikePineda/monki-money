import { signal, type Provider } from '@angular/core'
import type { Mock } from 'vitest'
import type { ImportRow } from '../app/core/api/api-types'
import { SessionStore } from '../app/core/auth/session.store'
import { AccountsApi } from '../app/core/household/accounts.api'
import { CategoriesApi } from '../app/core/household/categories.api'
import { HouseholdApi } from '../app/core/household/household.api'
import { MonthStore } from '../app/core/month/month.store'
import { HOUSEHOLD_TIME_ZONE } from '../app/core/platform/time-zone.token'
import { ImportsApi } from '../app/features/import/data-access/imports.api'
import { APP_LOCALE } from '../app/shared/ui/app-locale.token'
import { anImportBatch, anImportDetail } from './import-fixtures'
import { aCategoryTree } from './ledger-fixtures'
import { aMember, aUser, anAccount } from './session-fixtures'

export type ImportsApiMock = Record<
  | 'upload'
  | 'staged'
  | 'show'
  | 'batch'
  | 'decide'
  | 'decideMany'
  | 'classify'
  | 'confirm'
  | 'cancel',
  Mock
>

/** `row` with a change applied the way the API stores it (a reset goes back to `proposal`). */
export function echoChange(
  row: ImportRow,
  change: Record<string, unknown>,
  proposal: ImportRow = row
): ImportRow {
  const keys = { ...change }
  const { resolution, reset } = change
  for (const key of ['resolution', 'reset', 'rowId']) {
    delete keys[key]
  }
  const base = reset
    ? { ...row, resolution: row.proposedResolution ?? proposal.resolution, decision: null }
    : row
  if (reset && resolution === undefined && Object.keys(keys).length === 0) {
    return { ...base, decidedAt: null } as ImportRow
  }
  return {
    ...base,
    resolution: (resolution as ImportRow['resolution']) ?? base.resolution,
    decision: { ...(base.decision ?? {}), ...keys },
    decidedAt: '2026-10-16T00:00:00.000Z',
  } as ImportRow
}

/**
 * An ImportsApi whose `show` serves `rows` and whose `decide` / `decideMany`
 * echo the changes (a reset brings back the row as `rows` had it).
 */
export function importsApiMock(rows: ImportRow[] = []): ImportsApiMock {
  const current = new Map(rows.map((row) => [row.id, row]))
  return {
    upload: vi.fn(async () => ({ kind: 'staged', batches: [anImportBatch()] })),
    staged: vi.fn(async () => []),
    show: vi.fn(async () => anImportDetail(rows)),
    batch: vi.fn(async () => anImportBatch()),
    decide: vi.fn(async (_id: number, rowId: number, change: Record<string, unknown>) => {
      const row = echoChange(current.get(rowId) as ImportRow, change)
      current.set(rowId, row)
      return row
    }),
    decideMany: vi.fn(async (_id: number, changes: Record<string, unknown>[]) =>
      changes.map((change) => {
        const rowId = change['rowId'] as number
        const proposal = rows.find((item) => item.id === rowId) as ImportRow
        const row = echoChange(current.get(rowId) as ImportRow, change, proposal)
        current.set(rowId, row)
        return row
      })
    ),
    classify: vi.fn(async () => anImportBatch()),
    confirm: vi.fn(async () => ({
      batchId: 7,
      status: 'completed',
      created: 3,
      matched: 1,
      ignored: 1,
      transfers: 0,
      remaining: 0,
      reconciliation: anImportBatch().reconciliation,
    })),
    cancel: vi.fn(async () => anImportBatch({ status: 'cancelled' })),
  }
}

export interface ImportTestingOptions {
  api: ImportsApiMock
  months?: { invalidate: Mock; select: Mock }
  accounts?: Partial<Record<'list' | 'create' | 'update', Mock>>
}

/**
 * What the import screens need around them in a spec: the household
 * (NAB Everyday 1, NAB Savings 2, the category tree, two members), the
 * session, the time zone and locale, and a MonthStore stand-in.
 */
export function importTestingProviders(options: ImportTestingOptions): Provider[] {
  return [
    { provide: ImportsApi, useValue: options.api },
    {
      provide: MonthStore,
      useValue: options.months ?? { invalidate: vi.fn(), select: vi.fn() },
    },
    {
      provide: AccountsApi,
      useValue: {
        list: vi.fn(async () => [
          anAccount({ id: 1, name: 'NAB Everyday', externalAccountNumber: '123456789' }),
          anAccount({ id: 2, name: 'NAB Savings', kind: 'savings' }),
        ]),
        create: vi.fn(async () => anAccount({ id: 3 })),
        update: vi.fn(async () => anAccount({ id: 1 })),
        ...options.accounts,
      },
    },
    { provide: CategoriesApi, useValue: { tree: vi.fn(async () => aCategoryTree()) } },
    {
      provide: HouseholdApi,
      useValue: {
        members: vi.fn(async () => [
          aMember({ userId: 1 }),
          aMember({ id: 101, userId: 2, fullName: 'Alex Chen', role: 'member' }),
        ]),
      },
    },
    {
      provide: SessionStore,
      useValue: { user: signal(aUser({ id: 1 })), onClear: () => undefined },
    },
    { provide: HOUSEHOLD_TIME_ZONE, useValue: () => 'Australia/Brisbane' },
    { provide: APP_LOCALE, useValue: signal('en-AU') },
  ]
}
