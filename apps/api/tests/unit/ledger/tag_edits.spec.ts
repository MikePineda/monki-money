import { test } from '@japa/runner'
import { MAX_TAGS, editTags, renameTag } from '#domain/ledger/tag_edits'

test.group('Ledger: tag edits', () => {
  test('test_rename_replaces_the_tag_in_place', ({ assert }) => {
    assert.deepEqual(renameTag(['camping', 'Bali 2027', 'food'], 'Bali 2027', 'Bali trip'), [
      'camping',
      'Bali trip',
      'food',
    ])
  })

  test('test_rename_merges_into_an_existing_tag_without_duplicates', ({ assert }) => {
    // The first occurrence keeps its place; the renamed copy folds into it.
    assert.deepEqual(renameTag(['bali 2027', 'food', 'Bali 2027'], 'bali 2027', 'Bali 2027'), [
      'Bali 2027',
      'food',
    ])
    assert.deepEqual(renameTag(['food', 'Bali', 'Bali 2027'], 'Bali', 'Bali 2027'), [
      'food',
      'Bali 2027',
    ])
  })

  test('test_rename_matches_exactly_and_leaves_other_tags_alone', ({ assert }) => {
    assert.deepEqual(renameTag(['bali', 'Bali 2027 trip'], 'Bali', 'Trip'), [
      'bali',
      'Bali 2027 trip',
    ])
  })

  test('test_edit_tags_adds_new_ones_after_the_existing_and_removes_exact_matches', ({
    assert,
  }) => {
    assert.deepEqual(
      editTags(['camping', 'food'], { add: ['Bali', 'food'], remove: ['camping'] }),
      {
        tags: ['food', 'Bali'],
        fits: true,
      }
    )
    assert.deepEqual(editTags(['Bali'], { add: [], remove: ['bali'] }), {
      tags: ['Bali'],
      fits: true,
    })
  })

  test('test_edit_tags_removing_wins_over_adding_the_same_tag', ({ assert }) => {
    assert.deepEqual(editTags(['food'], { add: ['Bali'], remove: ['Bali'] }).tags, ['food'])
  })

  test('test_edit_tags_does_not_fit_past_the_limit', ({ assert }) => {
    const full = Array.from({ length: MAX_TAGS }, (_, index) => `tag ${index}`)

    assert.isFalse(editTags(full, { add: ['one more'], remove: [] }).fits)
    assert.isTrue(editTags(full, { add: ['one more'], remove: ['tag 0'] }).fits)
    assert.isTrue(editTags(full, { add: ['tag 3'], remove: [] }).fits)
  })
})
