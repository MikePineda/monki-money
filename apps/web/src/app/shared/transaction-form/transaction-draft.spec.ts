import { addTag, draftErrors } from './transaction-draft'

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
    expect(addTag(['trip'], '  trip ')).toEqual(['trip', 'trip'])
    expect(addTag(['trip'], 'trip')).toEqual(['trip'])
    expect(addTag(['trip'], '   ')).toEqual(['trip'])
  })
})
