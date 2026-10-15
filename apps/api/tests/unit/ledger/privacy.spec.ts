import { test } from '@japa/runner'
import { posting } from '#tests/helpers/postings'
import {
  isHiddenFrom,
  postingsFor,
  postingsForHousehold,
  privateOwnerId,
} from '#domain/ledger/privacy'

const couple = (userId: number) => ({ userId, memberIds: new Set([1, 2]) })

test.group('Ledger: privacy', () => {
  test('test_private_details_belong_to_the_payer_then_the_creator', ({ assert }) => {
    const paid = { isPrivate: true, paidByUserId: 1, createdByUserId: 2 }
    const joint = { isPrivate: true, paidByUserId: null, createdByUserId: 2 }

    assert.equal(privateOwnerId(paid), 1)
    assert.equal(privateOwnerId(joint), 2)
    assert.isFalse(isHiddenFrom(paid, couple(1)))
    assert.isTrue(isHiddenFrom(paid, couple(2)))
    assert.isFalse(isHiddenFrom(joint, couple(2)))
    assert.isTrue(isHiddenFrom(joint, couple(1)))
    assert.isFalse(isHiddenFrom({ ...paid, isPrivate: false }, couple(2)))
  })

  test('test_private_row_without_an_owner_in_the_household_is_visible', ({ assert }) => {
    // Both users deleted: nobody could ever unlock it again.
    assert.isFalse(
      isHiddenFrom({ isPrivate: true, paidByUserId: null, createdByUserId: null }, couple(1))
    )
    // The payer left the household.
    assert.isFalse(
      isHiddenFrom({ isPrivate: true, paidByUserId: 3, createdByUserId: 3 }, couple(1))
    )
  })

  test('test_postings_for_masks_only_hidden_rows', ({ assert }) => {
    const gift = posting({ isPrivate: true, paidByUserId: 1 })
    const orphan = posting({ isPrivate: true, paidByUserId: 9, createdByUserId: 9 })

    const [maskedGift, visibleOrphan] = postingsFor([gift, orphan], couple(2))

    assert.include(maskedGift, { hidden: true, categoryId: null, groupId: null })
    assert.include(visibleOrphan, { hidden: false, categoryId: orphan.categoryId })
  })

  test('test_household_wide_postings_hide_every_private_row_of_a_member', ({ assert }) => {
    // Content every member reads (a stored summary): nobody's private
    // details may shape it, not even the person who asked for it.
    const mine = posting({ isPrivate: true, paidByUserId: 1 })
    const partners = posting({ isPrivate: true, paidByUserId: null, createdByUserId: 2 })
    const orphan = posting({ isPrivate: true, paidByUserId: 9, createdByUserId: 9 })
    const ordinary = posting()

    const [maskedMine, maskedPartners, visibleOrphan, visible] = postingsForHousehold(
      [mine, partners, orphan, ordinary],
      new Set([1, 2])
    )

    assert.include(maskedMine, { hidden: true, categoryId: null, groupId: null })
    assert.include(maskedPartners, { hidden: true, categoryId: null, groupId: null })
    assert.include(maskedMine, { amountCents: mine.amountCents, paidByUserId: 1 })
    assert.include(visibleOrphan, { hidden: false, categoryId: orphan.categoryId })
    assert.deepEqual(visible, ordinary)
  })
})
