import {
  addTag,
  blankToNull,
  draftErrors,
  draftFromCreate,
  draftToCreate,
  transferFromCreate,
  transferToCreate,
  type TransactionDraft,
} from './transaction-draft'
import type { TransferDraft } from './transfer-form.component'

const DRAFT: TransactionDraft = {
  kind: 'expense',
  amountCents: 4820,
  accountId: 3,
  paidByUserId: null,
  categoryId: 12,
  date: '2026-10-15',
  payee: 'Night Market',
  description: 'Dinner',
  isPrivate: true,
  tags: ['trip'],
}

const TRANSFER: TransferDraft = {
  fromAccountId: 1,
  toAccountId: 2,
  amountCents: 50000,
  date: '2026-10-01',
  memo: 'Rent',
  tags: [],
}

describe('draftErrors', () => {
  it('test_api_fields_land_on_their_form_fields', () => {
    expect(
      draftErrors({
        amountCents: 'Too big',
        accountId: 'Unknown account',
        paidByUserId: 'Not a member',
        categoryId: 'Unknown category',
        payee: 'Too long',
      })
    ).toEqual({
      amount: 'Too big',
      account: 'Unknown account',
      person: 'Not a member',
      category: 'Unknown category',
      payee: 'Too long',
    })
  })

  it('test_array_items_and_unknown_fields_are_mapped_too', () => {
    expect(draftErrors({ 'tags.2': 'Tag too long', 'clientId': 'Bad id' })).toEqual({
      tags: 'Tag too long',
      form: 'Bad id',
    })
  })
})

describe('addTag', () => {
  it('test_tags_are_trimmed_and_never_repeated', () => {
    expect(addTag(['trip'], '  beach ')).toEqual(['trip', 'beach'])
    expect(addTag(['trip'], 'trip')).toEqual(['trip'])
    expect(addTag(['trip'], '   ')).toEqual(['trip'])
  })
})

describe('blankToNull', () => {
  it('test_text_is_trimmed_and_blank_becomes_null', () => {
    expect(blankToNull('  Corner Shop ')).toBe('Corner Shop')
    expect(blankToNull('   ')).toBeNull()
  })
})

describe('draftToCreate', () => {
  it('test_create_body_is_positive_with_the_kind_and_the_client_id', () => {
    expect(draftToCreate({ ...DRAFT, payee: ' ' }, 'id-1')).toEqual({
      clientId: 'id-1',
      kind: 'expense',
      accountId: 3,
      date: '2026-10-15',
      amountCents: 4820,
      categoryId: 12,
      payee: null,
      description: 'Dinner',
      paidByUserId: null,
      isPrivate: true,
      tags: ['trip'],
    })
  })

  it('test_a_draft_without_an_account_cannot_become_a_create_body', () => {
    expect(() => draftToCreate({ ...DRAFT, accountId: null }, 'id-1')).toThrow(RangeError)
  })

  it('test_a_draft_survives_a_round_trip_through_its_create_body', () => {
    expect(draftFromCreate(draftToCreate(DRAFT, 'id-1'))).toEqual(DRAFT)
    expect(draftFromCreate(draftToCreate({ ...DRAFT, payee: '' }, 'id-1')).payee).toBe('')
  })
})

describe('transferToCreate', () => {
  it('test_transfer_body_carries_both_accounts_and_the_client_id', () => {
    expect(transferToCreate({ ...TRANSFER, memo: '  ' }, 'id-2')).toEqual({
      clientId: 'id-2',
      fromAccountId: 1,
      toAccountId: 2,
      date: '2026-10-01',
      amountCents: 50000,
      memo: null,
    })
  })

  it('test_a_transfer_draft_without_both_accounts_cannot_become_a_create_body', () => {
    expect(() => transferToCreate({ ...TRANSFER, toAccountId: null }, 'id-2')).toThrow(RangeError)
  })

  it('test_a_transfer_draft_survives_a_round_trip_through_its_create_body', () => {
    expect(transferFromCreate(transferToCreate(TRANSFER, 'id-2'))).toEqual(TRANSFER)
  })
})
