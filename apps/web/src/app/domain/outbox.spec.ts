import {
  BACKOFF_MAX_MS,
  OUTBOX_VERSION,
  backoffMs,
  deserialize,
  discard,
  enqueue,
  markFailed,
  markSynced,
  markSyncing,
  nextToSync,
  queuedAsRecent,
  reconcile,
  replace,
  retry,
  serialize,
  type OutboxEntry,
  type OutboxItem,
  type TransactionPayload,
  type TransferPayload,
} from './outbox'

const NOW = new Date('2026-10-16T09:30:00.000Z')
const LATER = new Date('2026-10-16T09:31:00.000Z')

let counter = 0

function clientId(): string {
  counter += 1
  return `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`
}

function anEntryItem(overrides: Partial<TransactionPayload> = {}): OutboxItem {
  return {
    kind: 'transaction',
    payload: {
      clientId: clientId(),
      kind: 'expense',
      accountId: 1,
      date: '2026-10-16',
      amountCents: 4250,
      categoryId: 10,
      payee: 'Corner Shop',
      description: null,
      paidByUserId: 1,
      isPrivate: false,
      tags: [],
      ...overrides,
    },
  }
}

function aTransferItem(overrides: Partial<TransferPayload> = {}): OutboxItem {
  return {
    kind: 'transfer',
    payload: {
      clientId: clientId(),
      fromAccountId: 1,
      toAccountId: 2,
      date: '2026-09-30',
      amountCents: 50000,
      memo: null,
      tags: [],
      ...overrides,
    },
  }
}

const OFFLINE = { code: 'E_OFFLINE', message: '' }
const INVALID = { code: 'E_VALIDATION', message: 'The selected category does not exist' }

describe('outbox', () => {
  describe('enqueue', () => {
    it('test_enqueue_creates_a_pending_entry_keyed_by_the_client_id', () => {
      const item = anEntryItem()

      const [entry] = enqueue([], item, NOW)

      expect(entry).toEqual({
        id: item.payload.clientId,
        kind: 'transaction',
        payload: item.payload,
        createdAt: '2026-10-16T09:30:00.000Z',
        attempts: 0,
        status: 'pending',
        error: null,
        month: '2026-10',
      })
    })

    it('test_enqueue_keeps_fifo_order', () => {
      const first = anEntryItem()
      const second = aTransferItem()
      const third = anEntryItem({ kind: 'income' })

      const entries = enqueue(enqueue(enqueue([], first, NOW), second, NOW), third, LATER)

      expect(entries.map((entry) => entry.id)).toEqual([
        first.payload.clientId,
        second.payload.clientId,
        third.payload.clientId,
      ])
    })

    it('test_enqueue_takes_the_month_from_the_entry_date', () => {
      const [entry] = enqueue([], aTransferItem({ date: '2026-09-30' }), NOW)

      expect(entry?.month).toBe('2026-09')
    })

    it('test_enqueueing_the_same_client_id_twice_keeps_one_entry', () => {
      const item = anEntryItem()

      const entries = enqueue(enqueue([], item, NOW), item, LATER)

      expect(entries).toHaveLength(1)
      expect(entries[0]?.createdAt).toBe('2026-10-16T09:30:00.000Z')
    })

    it('test_enqueue_never_mutates_the_list_it_was_given', () => {
      const before: OutboxEntry[] = []

      enqueue(before, anEntryItem(), NOW)

      expect(before).toEqual([])
    })
  })

  describe('syncing', () => {
    it('test_mark_syncing_flags_only_that_entry', () => {
      const entries = enqueue(enqueue([], anEntryItem(), NOW), anEntryItem(), NOW)
      const [first, second] = entries

      const next = markSyncing(entries, first?.id ?? '')

      expect(next.map((entry) => entry.status)).toEqual(['syncing', 'pending'])
      expect(next[1]).toBe(second)
    })

    it('test_mark_synced_removes_the_entry', () => {
      const entries = enqueue(enqueue([], anEntryItem(), NOW), anEntryItem(), NOW)

      const next = markSynced(entries, entries[0]?.id ?? '')

      expect(next.map((entry) => entry.id)).toEqual([entries[1]?.id])
    })

    it('test_retryable_failure_keeps_entry_pending_and_counts_attempt', () => {
      const entries = enqueue([], anEntryItem(), NOW)
      const id = entries[0]?.id ?? ''

      const once = markFailed(markSyncing(entries, id), id, OFFLINE, true)
      const twice = markFailed(markSyncing(once, id), id, OFFLINE, true)

      expect(twice[0]).toMatchObject({ status: 'pending', attempts: 2, error: OFFLINE })
    })

    it('test_validation_failure_marks_entry_failed_with_server_message', () => {
      const entries = enqueue([], anEntryItem(), NOW)
      const id = entries[0]?.id ?? ''

      const next = markFailed(markSyncing(entries, id), id, INVALID, false)

      expect(next[0]).toMatchObject({ status: 'failed', attempts: 1, error: INVALID })
    })

    it('test_an_unknown_id_leaves_the_list_as_it_was', () => {
      const entries = enqueue([], anEntryItem(), NOW)

      expect(markSyncing(entries, 'missing')).toEqual(entries)
      expect(markSynced(entries, 'missing')).toEqual(entries)
      expect(markFailed(entries, 'missing', OFFLINE, true)).toEqual(entries)
    })
  })

  describe('nextToSync', () => {
    it('test_next_to_sync_is_the_oldest_pending_entry', () => {
      const entries = enqueue(enqueue([], anEntryItem(), NOW), anEntryItem(), LATER)

      expect(nextToSync(entries)?.id).toBe(entries[0]?.id)
    })

    it('test_next_to_sync_skips_failed_and_syncing_entries', () => {
      let entries = enqueue(
        enqueue(enqueue([], anEntryItem(), NOW), anEntryItem(), NOW),
        anEntryItem(),
        NOW
      )
      const [first, second, third] = entries.map((entry) => entry.id)
      entries = markFailed(entries, first ?? '', INVALID, false)
      entries = markSyncing(entries, second ?? '')

      expect(nextToSync(entries)?.id).toBe(third)
    })

    it('test_next_to_sync_skips_entries_being_edited', () => {
      const entries = enqueue(enqueue([], anEntryItem(), NOW), anEntryItem(), NOW)

      expect(nextToSync(entries, new Set([entries[0]?.id ?? '']))?.id).toBe(entries[1]?.id)
    })

    it('test_nothing_to_sync_when_every_entry_failed', () => {
      const entries = enqueue([], anEntryItem(), NOW)

      expect(nextToSync(markFailed(entries, entries[0]?.id ?? '', INVALID, false))).toBeNull()
      expect(nextToSync([])).toBeNull()
    })
  })

  describe('retry, replace and discard', () => {
    it('test_retry_puts_a_failed_entry_back_in_line_with_a_clean_slate', () => {
      const entries = enqueue([], anEntryItem(), NOW)
      const id = entries[0]?.id ?? ''

      const next = retry(markFailed(entries, id, INVALID, false), id)

      expect(next[0]).toMatchObject({ status: 'pending', attempts: 0, error: null })
    })

    it('test_retry_without_an_id_retries_every_failed_entry', () => {
      let entries = enqueue(enqueue([], anEntryItem(), NOW), anEntryItem(), NOW)
      for (const entry of entries) {
        entries = markFailed(entries, entry.id, INVALID, false)
      }

      expect(retry(entries).map((entry) => entry.status)).toEqual(['pending', 'pending'])
    })

    it('test_replace_swaps_the_payload_in_place_and_keeps_the_client_id', () => {
      let entries = enqueue(enqueue([], anEntryItem(), NOW), anEntryItem(), NOW)
      const id = entries[0]?.id ?? ''
      entries = markFailed(entries, id, INVALID, false)

      const next = replace(entries, id, anEntryItem({ categoryId: 11, date: '2026-11-02' }))

      expect(next.map((entry) => entry.id)).toEqual(entries.map((entry) => entry.id))
      expect(next[0]).toMatchObject({
        id,
        status: 'pending',
        attempts: 0,
        error: null,
        month: '2026-11',
        createdAt: '2026-10-16T09:30:00.000Z',
        payload: { clientId: id, categoryId: 11, date: '2026-11-02' },
      })
    })

    it('test_replace_may_turn_an_entry_into_a_transfer', () => {
      const entries = enqueue([], anEntryItem(), NOW)
      const id = entries[0]?.id ?? ''

      const [entry] = replace(entries, id, aTransferItem())

      expect(entry).toMatchObject({ id, kind: 'transfer', payload: { clientId: id } })
    })

    it('test_discard_removes_the_entry', () => {
      const entries = enqueue([], anEntryItem(), NOW)

      expect(discard(entries, entries[0]?.id ?? '')).toEqual([])
    })
  })

  describe('backoffMs', () => {
    it('test_backoff_doubles_and_caps_at_sixty_seconds', () => {
      expect([0, 1, 2, 3, 4, 5, 6, 7, 20].map(backoffMs)).toEqual([
        1_000, 1_000, 2_000, 4_000, 8_000, 16_000, 32_000, 60_000, 60_000,
      ])
      expect(BACKOFF_MAX_MS).toBe(60_000)
    })
  })

  describe('serialize and deserialize', () => {
    it('test_a_serialized_outbox_reads_back_the_same', () => {
      let entries = enqueue(enqueue([], anEntryItem(), NOW), aTransferItem({ memo: 'Rent' }), NOW)
      entries = markFailed(entries, entries[0]?.id ?? '', INVALID, false)

      const raw = serialize(entries)

      expect(JSON.parse(raw)).toMatchObject({ version: OUTBOX_VERSION })
      expect(deserialize(raw)).toEqual(entries)
    })

    it('test_a_queued_transfer_keeps_its_tags_on_the_device', () => {
      const entries = enqueue([], aTransferItem({ tags: ['Bali 2027', 'savings'] }), NOW)

      const [entry] = deserialize(serialize(entries))

      expect(entry?.kind === 'transfer' && entry.payload.tags).toEqual(['Bali 2027', 'savings'])
    })

    it('test_an_outbox_stored_before_transfers_had_tags_still_reads_back', () => {
      const transfer = enqueue([], aTransferItem(), NOW)[0]!
      const expense = enqueue([], anEntryItem({ tags: ['trip'] }), NOW)[0]!
      const untagged: Partial<TransferPayload> = { ...transfer.payload }
      delete untagged.tags
      const raw = JSON.stringify({
        version: 1,
        entries: [{ ...transfer, payload: untagged }, expense],
      })

      const entries = deserialize(raw)

      expect(entries).toEqual([transfer, expense])
      expect(entries[0]?.kind === 'transfer' && entries[0].payload.tags).toEqual([])
    })

    it('test_the_outbox_is_written_with_the_schema_that_carries_transfer_tags', () => {
      expect(OUTBOX_VERSION).toBe(2)
      expect(JSON.parse(serialize([]))).toEqual({ version: 2, entries: [] })
    })

    it('test_deserialize_of_nothing_or_garbage_is_an_empty_outbox', () => {
      expect(deserialize(null)).toEqual([])
      expect(deserialize('')).toEqual([])
      expect(deserialize('{not json')).toEqual([])
      expect(deserialize('[]')).toEqual([])
      expect(deserialize('{"version":1,"entries":"nope"}')).toEqual([])
    })

    it('test_deserialize_ignores_an_unknown_schema_version', () => {
      const raw = serialize(enqueue([], anEntryItem(), NOW)).replace(
        `"version":${OUTBOX_VERSION}`,
        '"version":99'
      )

      expect(deserialize(raw)).toEqual([])
    })

    it('test_deserialize_drops_corrupt_entries_and_keeps_the_rest', () => {
      const good = enqueue(enqueue([], anEntryItem(), NOW), aTransferItem(), NOW)
      const [entry, transfer] = good
      const corrupt = [
        null,
        'text',
        { ...entry, id: '' },
        { ...entry, kind: 'refund' },
        { ...entry, payload: { ...entry?.payload, amountCents: -5 } },
        { ...entry, payload: { ...entry?.payload, date: '2026-02-30' } },
        { ...entry, payload: { ...entry?.payload, clientId: 'another-id' } },
        { ...entry, payload: { ...entry?.payload, kind: 'transfer' } },
        { ...transfer, payload: { ...transfer?.payload, toAccountId: '2' } },
      ]
      const raw = JSON.stringify({
        version: OUTBOX_VERSION,
        entries: [entry, ...corrupt, transfer],
      })

      expect(deserialize(raw)).toEqual(good)
    })

    it('test_deserialize_turns_an_interrupted_sync_back_into_pending', () => {
      const entries = enqueue([], anEntryItem(), NOW)

      const [entry] = deserialize(serialize(markSyncing(entries, entries[0]?.id ?? '')))

      expect(entry?.status).toBe('pending')
    })

    it('test_deserialize_repairs_bookkeeping_and_drops_unknown_payload_fields', () => {
      const [entry] = enqueue([], anEntryItem(), NOW)
      const raw = JSON.stringify({
        version: OUTBOX_VERSION,
        entries: [
          {
            ...entry,
            attempts: -3,
            status: 'weird',
            error: { code: 42 },
            month: '1999-01',
            payload: { ...entry?.payload, injected: true },
          },
        ],
      })

      expect(deserialize(raw)).toEqual([entry])
    })

    it('test_deserialize_keeps_the_first_of_two_entries_with_the_same_id', () => {
      const [entry] = enqueue([], anEntryItem(), NOW)
      const copy = { ...entry, createdAt: '2026-10-17T00:00:00.000Z' }
      const raw = JSON.stringify({ version: OUTBOX_VERSION, entries: [entry, copy] })

      expect(deserialize(raw)).toEqual([entry])
    })
  })

  describe('reconcile with the device copy', () => {
    it('test_the_device_copy_wins_so_another_tabs_new_entry_shows_up', () => {
      const local = enqueue([], anEntryItem(), NOW)
      const stored = enqueue(local, anEntryItem(), LATER)

      expect(reconcile(stored, local, false)).toEqual(stored)
    })

    it('test_an_entry_another_tab_synced_or_discarded_leaves_this_tab_too', () => {
      const local = enqueue(enqueue([], anEntryItem(), NOW), anEntryItem(), NOW)
      const stored = markSynced(local, local[0]?.id ?? '')

      expect(reconcile(stored, local, false).map((entry) => entry.id)).toEqual([local[1]?.id])
    })

    it('test_an_entry_this_tab_is_sending_stays_syncing', () => {
      const stored = enqueue(enqueue([], anEntryItem(), NOW), anEntryItem(), NOW)
      const local = markSyncing(stored, stored[0]?.id ?? '')

      expect(reconcile(stored, local, false).map((entry) => entry.status)).toEqual([
        'syncing',
        'pending',
      ])
    })

    it('test_entries_this_device_could_not_store_are_kept_after_the_stored_ones', () => {
      const shared = enqueue([], anEntryItem(), NOW)
      const stored = enqueue(shared, anEntryItem(), LATER)
      const local = enqueue(shared, anEntryItem(), LATER)

      expect(reconcile(stored, local, true).map((entry) => entry.id)).toEqual([
        shared[0]?.id,
        stored[1]?.id,
        local[1]?.id,
      ])
      expect(reconcile(stored, local, false).map((entry) => entry.id)).toEqual(
        stored.map((entry) => entry.id)
      )
    })

    it('test_reconcile_never_mutates_its_inputs', () => {
      const stored = enqueue([], anEntryItem(), NOW)
      const local = markSyncing(stored, stored[0]?.id ?? '')
      const before = JSON.stringify({ stored, local })

      reconcile(stored, local, true)

      expect(JSON.stringify({ stored, local })).toBe(before)
    })
  })

  describe('queued entries as recent rows', () => {
    it('test_a_queued_expense_ranks_like_a_ledger_row_with_its_category_and_payee', () => {
      const item = anEntryItem({ categoryId: 12, payee: 'Bakery', amountCents: 700 })
      const entries = enqueue([], item, NOW)

      expect(queuedAsRecent(entries, 1)).toEqual([
        {
          id: expect.any(Number),
          kind: 'expense',
          date: '2026-10-16',
          accountId: 1,
          amountCents: -700,
          categoryId: 12,
          payee: 'Bakery',
          transferId: null,
          createdByUserId: 1,
        },
      ])
    })

    it('test_a_queued_income_is_positive', () => {
      const entries = enqueue([], anEntryItem({ kind: 'income', amountCents: 320000 }), NOW)

      expect(queuedAsRecent(entries, 1)[0]?.amountCents).toBe(320000)
    })

    it('test_a_queued_transfer_counts_as_its_two_legs', () => {
      const entries = enqueue([], aTransferItem({ amountCents: 50000 }), NOW)

      const legs = queuedAsRecent(entries, 1)

      expect(legs.map((leg) => [leg.kind, leg.accountId, leg.amountCents])).toEqual([
        ['transfer', 1, -50000],
        ['transfer', 2, 50000],
      ])
      expect(legs[0]?.transferId).not.toBeNull()
      expect(legs[1]?.transferId).toBe(legs[0]?.transferId)
    })

    it('test_queued_rows_come_newest_first_with_ids_above_any_ledger_row', () => {
      const first = anEntryItem({ payee: 'First' })
      const second = anEntryItem({ payee: 'Second' })
      const entries = enqueue(enqueue([], first, NOW), second, LATER)

      const rows = queuedAsRecent(entries, 1)

      expect(rows.map((row) => row.payee)).toEqual(['Second', 'First'])
      expect(rows[0]?.id).toBeGreaterThan(rows[1]?.id ?? Infinity)
      expect(rows[1]?.id).toBeGreaterThan(2 ** 31)
    })
  })
})
