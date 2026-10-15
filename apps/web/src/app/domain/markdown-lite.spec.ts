import { inlineSpans, parseMarkdownLite } from './markdown-lite'

describe('parseMarkdownLite', () => {
  it('test_empty_or_blank_input_has_no_blocks', () => {
    expect(parseMarkdownLite('')).toEqual([])
    expect(parseMarkdownLite('  \n\n \t')).toEqual([])
  })

  it('test_blank_lines_separate_paragraphs_and_soft_breaks_join_with_a_space', () => {
    expect(parseMarkdownLite('First line\nsame paragraph.\n\nSecond paragraph.')).toEqual([
      { kind: 'paragraph', spans: [{ text: 'First line same paragraph.', strong: false }] },
      { kind: 'paragraph', spans: [{ text: 'Second paragraph.', strong: false }] },
    ])
  })

  it('test_windows_line_endings_are_normalised', () => {
    expect(parseMarkdownLite('One.\r\n\r\nTwo.')).toHaveLength(2)
  })

  it('test_double_asterisks_mark_strong_text', () => {
    expect(parseMarkdownLite('Spending stayed **below income** this month.')).toEqual([
      {
        kind: 'paragraph',
        spans: [
          { text: 'Spending stayed ', strong: false },
          { text: 'below income', strong: true },
          { text: ' this month.', strong: false },
        ],
      },
    ])
  })

  it('test_dash_lines_become_a_list_with_inline_strong_text', () => {
    expect(parseMarkdownLite('Highlights:\n- **Food** went down\n- Rent stayed flat')).toEqual([
      { kind: 'paragraph', spans: [{ text: 'Highlights:', strong: false }] },
      {
        kind: 'list',
        items: [
          [
            { text: 'Food', strong: true },
            { text: ' went down', strong: false },
          ],
          [{ text: 'Rent stayed flat', strong: false }],
        ],
      },
    ])
  })

  it('test_asterisk_bullets_are_lists_too', () => {
    expect(parseMarkdownLite('* one\n* two')).toEqual([
      {
        kind: 'list',
        items: [[{ text: 'one', strong: false }], [{ text: 'two', strong: false }]],
      },
    ])
  })

  it('test_a_paragraph_after_a_list_starts_a_new_block', () => {
    const blocks = parseMarkdownLite('- one\nAfter the list.')
    expect(blocks.map((block) => block.kind)).toEqual(['list', 'paragraph'])
  })

  it('test_a_heading_line_becomes_its_own_strong_paragraph', () => {
    expect(parseMarkdownLite('## October\nA calm month.')).toEqual([
      { kind: 'paragraph', spans: [{ text: 'October', strong: true }] },
      { kind: 'paragraph', spans: [{ text: 'A calm month.', strong: false }] },
    ])
  })

  it('test_raw_html_stays_plain_text', () => {
    expect(parseMarkdownLite('<script>alert(1)</script> and <b>bold</b>')).toEqual([
      {
        kind: 'paragraph',
        spans: [{ text: '<script>alert(1)</script> and <b>bold</b>', strong: false }],
      },
    ])
  })
})

describe('inlineSpans', () => {
  it('test_an_unclosed_marker_is_kept_as_typed', () => {
    expect(inlineSpans('a **b')).toEqual([{ text: 'a **b', strong: false }])
  })

  it('test_empty_strong_markers_are_dropped', () => {
    expect(inlineSpans('a ****b')).toEqual([{ text: 'a b', strong: false }])
  })

  it('test_several_strong_runs_in_one_line', () => {
    expect(inlineSpans('**a** and **b**')).toEqual([
      { text: 'a', strong: true },
      { text: ' and ', strong: false },
      { text: 'b', strong: true },
    ])
  })
})
