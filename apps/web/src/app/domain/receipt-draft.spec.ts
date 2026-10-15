import {
  MAX_MEMO_LENGTH,
  categorizeLines,
  confidenceLevel,
  dropLines,
  linesFromReceipt,
  linesIssues,
  mergeLines,
  receiptAmount,
  receiptDate,
  receiptSplits,
  settledLines,
  type ReceiptDraft,
  type ReceiptLine,
} from './receipt-draft'

/** The fake model's answer in the E2E stack (apps/api tests/fixtures/llm/receipt.json). */
const RECEIPT: ReceiptDraft = {
  merchant: 'Corner Grocer',
  date: '2026-09-14',
  totalCents: 2345,
  currencyCode: 'AUD',
  categoryId: 7,
  categorySlug: 'groceries',
  items: [
    { description: 'Bananas 1kg', amountCents: 390, quantity: 1 },
    { description: 'Coffee beans 500g', amountCents: 1655, quantity: 1 },
    { description: 'Sourdough loaf', amountCents: 300, quantity: null },
  ],
  confidence: 0.9,
  key: 'receipts/1/abc.webp',
}

function line(id: number, amountCents: number, categoryId: number | null = 7): ReceiptLine {
  return { id, description: `Item ${id}`, amountCents, quantity: null, categoryId }
}

describe('receipt draft defaults', () => {
  it('test_the_amount_is_the_printed_total', () => {
    expect(receiptAmount(RECEIPT)).toBe(2345)
  })

  it('test_without_a_readable_total_the_amount_is_the_sum_of_the_lines', () => {
    expect(receiptAmount({ ...RECEIPT, totalCents: null })).toBe(2345)
    expect(receiptAmount({ ...RECEIPT, totalCents: null, items: [] })).toBe(0)
  })

  it('test_the_date_is_the_printed_one_unless_missing_or_after_today', () => {
    expect(receiptDate(RECEIPT, '2026-10-16')).toBe('2026-09-14')
    expect(receiptDate({ ...RECEIPT, date: null }, '2026-10-16')).toBe('2026-10-16')
    expect(receiptDate({ ...RECEIPT, date: '2026-12-01' }, '2026-10-16')).toBe('2026-10-16')
    expect(receiptDate({ ...RECEIPT, date: 'yesterday' }, '2026-10-16')).toBe('2026-10-16')
  })

  it('test_confidence_reads_as_high_medium_or_low', () => {
    expect(confidenceLevel(0.9)).toBe('high')
    expect(confidenceLevel(0.8)).toBe('high')
    expect(confidenceLevel(0.6)).toBe('medium')
    expect(confidenceLevel(0.49)).toBe('low')
  })
})

describe('receipt lines', () => {
  it('test_each_item_becomes_a_line_with_the_receipt_category', () => {
    expect(linesFromReceipt(RECEIPT, 7)).toEqual([
      { id: 1, description: 'Bananas 1kg', amountCents: 390, quantity: 1, categoryId: 7 },
      { id: 2, description: 'Coffee beans 500g', amountCents: 1655, quantity: 1, categoryId: 7 },
      { id: 3, description: 'Sourdough loaf', amountCents: 300, quantity: null, categoryId: 7 },
    ])
  })

  it('test_merging_folds_the_selected_lines_into_the_first_one_in_list_order', () => {
    const lines = [line(1, 100, 7), line(2, 200, 8), line(3, 300, 9)]

    expect(mergeLines(lines, new Set([3, 1]))).toEqual([
      { id: 1, description: 'Item 1 + Item 3', amountCents: 400, quantity: null, categoryId: 7 },
      line(2, 200, 8),
    ])
  })

  it('test_merging_needs_two_lines_and_keeps_the_memo_within_the_api_limit', () => {
    const lines = [line(1, 100), line(2, 200)]
    expect(mergeLines(lines, new Set([1]))).toEqual(lines)

    const long = [
      { ...line(1, 100), description: 'a'.repeat(200) },
      { ...line(2, 100), description: 'b'.repeat(200) },
    ]
    expect(mergeLines(long, new Set([1, 2]))[0]?.description).toHaveLength(MAX_MEMO_LENGTH)
  })

  it('test_dropping_removes_the_selected_lines', () => {
    expect(dropLines([line(1, 100), line(2, 200), line(3, 300)], new Set([2]))).toEqual([
      line(1, 100),
      line(3, 300),
    ])
  })

  it('test_a_category_goes_to_every_selected_line', () => {
    expect(categorizeLines([line(1, 100), line(2, 200)], new Set([2]), 12)).toEqual([
      line(1, 100),
      line(2, 200, 12),
    ])
  })
})

describe('split by lines', () => {
  it('test_the_last_line_absorbs_the_difference_to_the_total', () => {
    const lines = [line(1, 390), line(2, 1655), line(3, 300)]

    expect(settledLines(2345, lines).map((item) => item.amountCents)).toEqual([390, 1655, 300])
    // A rounding or discount difference lands on the last line.
    expect(settledLines(2340, lines).map((item) => item.amountCents)).toEqual([390, 1655, 295])
  })

  it('test_the_splits_carry_each_line_as_its_memo_and_add_up_to_the_total', () => {
    const lines = linesFromReceipt(RECEIPT, 7)

    expect(receiptSplits(2345, categorizeLines(lines, new Set([2]), 9))).toEqual([
      { categoryId: 7, amountCents: 390, memo: 'Bananas 1kg' },
      { categoryId: 9, amountCents: 1655, memo: 'Coffee beans 500g' },
      { categoryId: 7, amountCents: 300, memo: 'Sourdough loaf' },
    ])
  })

  it('test_a_blank_description_sends_no_memo', () => {
    const lines = [{ ...line(1, 100), description: '  ' }, line(2, 200)]

    expect(receiptSplits(300, lines)[0]?.memo).toBeNull()
  })

  it('test_a_split_that_cannot_add_up_names_its_problems', () => {
    expect(linesIssues(2345, [line(1, 2345)])).toContain('tooFewLines')
    expect(linesIssues(100, [line(1, 300), line(2, 50)])).toContain('overTotal')
    expect(linesIssues(400, [line(1, 100, null), line(2, 300)])).toContain('missingCategory')
    expect(linesIssues(400, [line(1, 0), line(2, 400)])).toContain('zeroLine')
    expect(linesIssues(400, [line(1, -50), line(2, 450)])).toContain('zeroLine')
    expect(linesIssues(2345, linesFromReceipt(RECEIPT, 7))).toEqual([])
  })

  it('test_more_lines_than_the_api_accepts_must_be_merged_first', () => {
    const many = Array.from({ length: 51 }, (_, index) => line(index + 1, 10))

    expect(linesIssues(510, many)).toContain('tooManyLines')
  })

  it('test_splits_are_refused_while_a_problem_remains', () => {
    expect(() => receiptSplits(100, [line(1, 300), line(2, 50)])).toThrow(RangeError)
  })
})
