import { moveItem, stepItem } from './reorder'

const items = [{ id: 1 }, { id: 2 }, { id: 3 }]

describe('moveItem', () => {
  it('test_moves_an_item_to_a_new_position', () => {
    expect(moveItem(items, 0, 2).map((item) => item.id)).toEqual([2, 3, 1])
    expect(moveItem(items, 2, 0).map((item) => item.id)).toEqual([3, 1, 2])
  })

  it('test_the_same_position_or_an_index_out_of_range_returns_the_same_list', () => {
    expect(moveItem(items, 1, 1)).toBe(items)
    expect(moveItem(items, 5, 0)).toBe(items)
  })

  it('test_a_target_past_the_end_lands_last', () => {
    expect(moveItem(items, 0, 9).map((item) => item.id)).toEqual([2, 3, 1])
  })
})

describe('stepItem', () => {
  it('test_steps_an_item_up_or_down_by_id', () => {
    expect(stepItem(items, 2, -1).map((item) => item.id)).toEqual([2, 1, 3])
    expect(stepItem(items, 2, 1).map((item) => item.id)).toEqual([1, 3, 2])
  })

  it('test_the_ends_and_unknown_ids_do_not_move', () => {
    expect(stepItem(items, 1, -1)).toBe(items)
    expect(stepItem(items, 3, 1)).toBe(items)
    expect(stepItem(items, 9, 1)).toBe(items)
  })
})
