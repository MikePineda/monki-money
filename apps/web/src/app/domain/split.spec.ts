import {
  MAX_SPLIT_LINES,
  addSplitLine,
  canSaveSplit,
  initialSplitLines,
  removeSplitLine,
  splitIssues,
  splitLeftCents,
  toSplitPayload,
  withRemainder,
  type SplitDraftLine,
} from './split'

const line = (categoryId: number | null, amountCents: number): SplitDraftLine => ({
  categoryId,
  amountCents,
})

describe('withRemainder', () => {
  it('test_remainder_fills_the_last_line', () => {
    const lines = withRemainder(4250, [line(1, 3000), line(2, 0)])

    expect(lines.map((item) => item.amountCents)).toEqual([3000, 1250])
  })

  it('test_remainder_ignores_whatever_the_last_line_held', () => {
    const lines = withRemainder(10000, [line(1, 2500), line(2, 2500), line(3, 9999)])

    expect(lines.at(-1)?.amountCents).toBe(5000)
  })

  it('test_remainder_goes_negative_when_the_other_lines_pass_the_total', () => {
    const lines = withRemainder(1000, [line(1, 1500), line(2, 0)])

    expect(lines.at(-1)?.amountCents).toBe(-500)
  })

  it('test_does_not_mutate_its_input', () => {
    const input = [line(1, 100), line(2, 0)]
    withRemainder(500, input)

    expect(input[1]?.amountCents).toBe(0)
  })
})

describe('splitIssues', () => {
  it('test_valid_split_has_no_issues_and_can_be_saved', () => {
    const lines = [line(1, 3000), line(2, 0)]

    expect(splitIssues(4250, lines)).toEqual([])
    expect(canSaveSplit(4250, lines)).toBe(true)
  })

  it('test_a_split_needs_at_least_two_lines', () => {
    expect(splitIssues(4250, [line(1, 4250)])).toContain('tooFewLines')
  })

  it('test_every_line_needs_a_category', () => {
    expect(splitIssues(4250, [line(1, 3000), line(null, 0)])).toContain('missingCategory')
  })

  it('test_a_zero_line_is_rejected_like_the_api_does', () => {
    expect(splitIssues(4250, [line(1, 0), line(2, 0)])).toContain('zeroLine')
    expect(splitIssues(4250, [line(1, 4250), line(2, 0)])).toContain('zeroLine')
  })

  it('test_lines_over_the_total_cannot_be_saved', () => {
    const lines = [line(1, 5000), line(2, 0)]

    expect(splitIssues(4250, lines)).toContain('overTotal')
    expect(canSaveSplit(4250, lines)).toBe(false)
  })
})

describe('splitLeftCents', () => {
  it('test_left_is_what_the_last_line_receives', () => {
    expect(splitLeftCents(4250, [line(1, 3000), line(2, 0)])).toBe(1250)
    expect(splitLeftCents(4250, [line(1, 5000), line(2, 0)])).toBe(-750)
  })
})

describe('initialSplitLines', () => {
  it('test_a_single_transaction_starts_with_its_category_and_an_empty_second_line', () => {
    const lines = initialSplitLines({ amountCents: -4250, categoryId: 7, splits: [] })

    expect(lines).toEqual([line(7, 0), line(null, 4250)])
  })

  it('test_an_existing_split_loads_its_lines_as_magnitudes', () => {
    const lines = initialSplitLines({
      amountCents: -4250,
      categoryId: null,
      splits: [
        { categoryId: 1, amountCents: -3000 },
        { categoryId: 2, amountCents: -1250 },
      ],
    })

    expect(lines).toEqual([line(1, 3000), line(2, 1250)])
  })

  it('test_income_lines_load_positive_too', () => {
    const lines = initialSplitLines({
      amountCents: 10000,
      categoryId: null,
      splits: [
        { categoryId: 1, amountCents: 6000 },
        { categoryId: 2, amountCents: 4000 },
      ],
    })

    expect(lines.map((item) => item.amountCents)).toEqual([6000, 4000])
  })
})

describe('addSplitLine and removeSplitLine', () => {
  it('test_adding_a_line_appends_an_empty_line_that_takes_the_remainder', () => {
    const lines = addSplitLine(4250, [line(1, 3000), line(2, 1250)])

    expect(lines).toEqual([line(1, 3000), line(2, 1250), line(null, 0)])
  })

  it('test_cannot_add_past_the_maximum', () => {
    const many = Array.from({ length: MAX_SPLIT_LINES }, (_, index) => line(index + 1, 1))

    expect(addSplitLine(100, many)).toHaveLength(MAX_SPLIT_LINES)
  })

  it('test_removing_a_line_keeps_at_least_two', () => {
    const two = [line(1, 3000), line(2, 1250)]

    expect(removeSplitLine(4250, two, 0)).toEqual(two)
    expect(removeSplitLine(4250, [...two, line(3, 0)], 1)).toEqual([line(1, 3000), line(3, 1250)])
  })
})

describe('toSplitPayload', () => {
  it('test_payload_sends_positive_lines_with_the_remainder_applied', () => {
    expect(toSplitPayload(4250, [line(1, 3000), line(2, 0)])).toEqual([
      { categoryId: 1, amountCents: 3000 },
      { categoryId: 2, amountCents: 1250 },
    ])
  })

  it('test_payload_refuses_an_invalid_split', () => {
    expect(() => toSplitPayload(4250, [line(1, 3000), line(null, 0)])).toThrow(RangeError)
  })
})
