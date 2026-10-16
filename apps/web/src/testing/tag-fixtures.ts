import { computed, signal, type Provider } from '@angular/core'
import type { TagDetail, TagSummary } from '../app/core/ledger/tags.api'
import { TagsStore } from '../app/core/ledger/tags.store'

/**
 * A TagsStore stand-in for screens that only offer tags as suggestions
 * (quick add, the receipt scanner): the given tags, already loaded.
 */
export function tagsStoreStub(tags: TagSummary[] = []): Provider {
  const list = signal(tags)
  return {
    provide: TagsStore,
    useValue: {
      tags: list,
      status: signal('ready'),
      names: computed(() => list().map((tag) => tag.tag)),
      load: async () => undefined,
      refresh: async () => undefined,
    },
  }
}

/** A synthetic tag of `GET /tags`: a trip with spending and money set aside. */
export function aTagSummary(overrides: Partial<TagSummary> = {}): TagSummary {
  return {
    tag: 'Bali 2027',
    count: 4,
    expenseCents: 13_000,
    incomeCents: 0,
    netCents: -13_000,
    setAsideCents: 80_000,
    firstDate: '2026-07-15',
    lastDate: '2027-01-10',
    ...overrides,
  }
}

/** A synthetic `GET /tags/:tag`: two categories, three months, you and joint. */
export function aTagDetail(overrides: Partial<TagDetail> = {}): TagDetail {
  return {
    ...aTagSummary(),
    firstDate: '2026-11-15',
    byCategory: [
      {
        bucket: 'category',
        categoryId: 11,
        groupId: 1,
        kind: 'expense',
        amountCents: 7_000,
        count: 1,
      },
      {
        bucket: 'category',
        categoryId: 12,
        groupId: 1,
        kind: 'expense',
        amountCents: 6_000,
        count: 2,
      },
    ],
    byMonth: [
      { month: '2026-11', expenseCents: 0, incomeCents: 0, setAsideCents: 80_000 },
      { month: '2026-12', expenseCents: 3_000, incomeCents: 0, setAsideCents: 0 },
      { month: '2027-01', expenseCents: 10_000, incomeCents: 0, setAsideCents: 0 },
    ],
    byPerson: [
      { bucket: 'member', userId: 1, incomeCents: 0, expenseCents: 3_000, netCents: -3_000 },
      { bucket: 'joint', userId: null, incomeCents: 0, expenseCents: 10_000, netCents: -10_000 },
    ],
    ...overrides,
  }
}
