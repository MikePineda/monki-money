import { aTransaction } from '../../../../testing/ledger-fixtures'
import { draftFromTransaction, draftToCreate, draftToPatch } from './transaction-draft'

describe('draftToPatch', () => {
  it('test_only_changed_fields_are_sent_with_a_positive_amount', () => {
    const row = aTransaction({ amountCents: -4820, payee: 'Corner Grocer', tags: ['food'] })
    const draft = { ...draftFromTransaction(row), amountCents: 5000, payee: '  Night Market ' }

    expect(draftToPatch(row, draft)).toEqual({ amountCents: 5000, payee: 'Night Market' })
  })

  it('test_nothing_changed_means_an_empty_patch', () => {
    const row = aTransaction()

    expect(draftToPatch(row, draftFromTransaction(row))).toEqual({})
  })

  it('test_blank_text_clears_the_field', () => {
    const row = aTransaction({ description: 'Weekly shop' })

    expect(draftToPatch(row, { ...draftFromTransaction(row), description: ' ' })).toEqual({
      description: null,
    })
  })

  it('test_a_split_row_never_sends_its_amount_or_category', () => {
    const row = aTransaction({ isSplit: true, categoryId: null, amountCents: -4250 })
    const draft = {
      ...draftFromTransaction(row),
      amountCents: 9999,
      categoryId: 10,
      isPrivate: true,
    }

    expect(draftToPatch(row, draft)).toEqual({ isPrivate: true })
  })
})

describe('draftToCreate', () => {
  it('test_create_body_is_positive_with_the_kind_and_the_client_id', () => {
    const draft = { ...draftFromTransaction(aTransaction({ amountCents: -4820 })), payee: '' }

    expect(draftToCreate(draft, 'id-1')).toEqual(
      expect.objectContaining({ clientId: 'id-1', kind: 'expense', amountCents: 4820, payee: null })
    )
  })
})
