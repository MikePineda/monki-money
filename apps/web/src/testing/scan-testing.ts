import { signal, type Provider } from '@angular/core'
import type { Mock } from 'vitest'
import { SessionStore } from '../app/core/auth/session.store'
import { AccountsApi } from '../app/core/household/accounts.api'
import { CategoriesApi } from '../app/core/household/categories.api'
import { MonthStore } from '../app/core/month/month.store'
import { tagsStoreStub } from './tag-fixtures'
import { ImageOptimizer } from '../app/core/platform/image-optimizer'
import { OBJECT_URLS } from '../app/core/platform/object-urls'
import { HOUSEHOLD_TIME_ZONE } from '../app/core/platform/time-zone.token'
import type { ReceiptDraft } from '../app/domain/receipt-draft'
import { ReceiptsApi } from '../app/features/scan/data-access/receipts.api'
import { APP_LOCALE } from '../app/shared/ui/app-locale.token'
import { aCategoryTree, aTransaction } from './ledger-fixtures'
import { aHousehold, aSessionStub, anAccount } from './session-fixtures'

/** A scanned receipt like the fake model's (Groceries is category 20 in aCategoryTree). */
export function aReceipt(overrides: Partial<ReceiptDraft> = {}): ReceiptDraft {
  return {
    merchant: 'Corner Grocer',
    date: '2026-09-14',
    totalCents: 2345,
    currencyCode: 'AUD',
    categoryId: 20,
    categorySlug: 'groceries',
    items: [
      { description: 'Bananas 1kg', amountCents: 390, quantity: 1 },
      { description: 'Coffee beans 500g', amountCents: 1655, quantity: 1 },
      { description: 'Sourdough loaf', amountCents: 300, quantity: null },
    ],
    confidence: 0.9,
    key: 'receipts/1/abc.webp',
    ...overrides,
  }
}

export type ReceiptsApiMock = Record<'presign' | 'put' | 'scan' | 'save', Mock>

/** A ReceiptsApi whose scan answers `receipt` and whose save echoes a transaction. */
export function receiptsApiMock(receipt: ReceiptDraft = aReceipt()): ReceiptsApiMock {
  return {
    presign: vi.fn(async () => ({
      key: 'receipts/1/abc.webp',
      url: 'https://bucket.example.test/receipts/1/abc.webp?X-Amz-Signature=sig',
      headers: { 'Content-Type': 'image/webp' },
      expiresAt: '2026-10-16T00:05:00.000Z',
    })),
    put: vi.fn(async () => ({ status: 200, body: null })),
    scan: vi.fn(async () => receipt),
    save: vi.fn(async (body: { date: string; amountCents: number }) =>
      aTransaction({ id: 501, date: body.date, amountCents: -body.amountCents })
    ),
  }
}

export interface ScanTestingOptions {
  api: ReceiptsApiMock
  months?: { invalidate: Mock }
}

/**
 * What the scanner needs around it in a spec: the household (NAB Everyday
 * 1, NAB Savings 2, the category tree, two members, AUD), the session, the time
 * zone and locale, a MonthStore stand-in, an optimiser that answers a small
 * WebP and object URLs that are only counted.
 */
export function scanTestingProviders(options: ScanTestingOptions): Provider[] {
  return [
    { provide: ReceiptsApi, useValue: options.api },
    { provide: MonthStore, useValue: options.months ?? { invalidate: vi.fn() } },
    tagsStoreStub(),
    {
      provide: AccountsApi,
      useValue: {
        list: vi.fn(async () => [
          anAccount({ id: 1, name: 'NAB Everyday' }),
          anAccount({ id: 2, name: 'NAB Savings', kind: 'savings' }),
        ]),
      },
    },
    { provide: CategoriesApi, useValue: { tree: vi.fn(async () => aCategoryTree()) } },
    {
      provide: SessionStore,
      useValue: { ...aSessionStub(), household: signal(aHousehold()) },
    },
    {
      provide: ImageOptimizer,
      useValue: {
        optimize: vi.fn(async () => ({
          blob: new Blob(['webp'], { type: 'image/webp' }),
          contentType: 'image/webp',
          width: 1200,
          height: 1600,
        })),
      },
    },
    { provide: OBJECT_URLS, useValue: { create: vi.fn(() => 'blob:preview'), revoke: vi.fn() } },
    { provide: HOUSEHOLD_TIME_ZONE, useValue: () => 'Australia/Brisbane' },
    { provide: APP_LOCALE, useValue: signal('en-AU') },
  ]
}
