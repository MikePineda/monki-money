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
  'upload' | 'staged' | 'show' | 'decide' | 'classify' | 'confirm' | 'cancel',
  Mock
>

/** An ImportsApi whose `show` serves `rows` and whose `decide` echoes the change. */
export function importsApiMock(rows: ImportRow[] = []): ImportsApiMock {
  return {
    upload: vi.fn(async () => ({ kind: 'staged', batches: [anImportBatch()] })),
    staged: vi.fn(async () => []),
    show: vi.fn(async () => anImportDetail(rows)),
    decide: vi.fn(async (_id: number, rowId: number, change: Record<string, unknown>) => {
      const row = rows.find((item) => item.id === rowId) as ImportRow
      const { resolution, ...keys } = change
      return {
        ...row,
        resolution: resolution ?? row.resolution,
        decision: { ...(row.decision ?? {}), ...keys },
        decidedAt: '2026-10-16T00:00:00.000Z',
      }
    }),
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
