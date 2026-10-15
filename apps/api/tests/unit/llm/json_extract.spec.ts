import { test } from '@japa/runner'
import { extractJson } from '#llm/json_extract'

test.group('LLM json_extract', () => {
  test('test_json_extract_reads_a_bare_object', ({ assert }) => {
    assert.deepEqual(extractJson('{"a":1,"b":[1,2]}'), { ok: true, value: { a: 1, b: [1, 2] } })
  })

  test('test_json_extract_strips_code_fences', ({ assert }) => {
    const text = 'Sure!\n```json\n{"results":[{"id":"r1"}]}\n```\nAnything else?'
    assert.deepEqual(extractJson(text), { ok: true, value: { results: [{ id: 'r1' }] } })
  })

  test('test_json_extract_strips_fences_without_a_language_tag', ({ assert }) => {
    assert.deepEqual(extractJson('```\n[1, 2, 3]\n```'), { ok: true, value: [1, 2, 3] })
  })

  test('test_json_extract_skips_a_prefix_before_the_first_brace', ({ assert }) => {
    const text = 'Here is the classification you asked for: {"ok": true}'
    assert.deepEqual(extractJson(text), { ok: true, value: { ok: true } })
  })

  test('test_json_extract_ignores_trailing_text_and_later_objects', ({ assert }) => {
    const text = '{"first": {"nested": "x"}} I hope this helps. {"second": 2}'
    assert.deepEqual(extractJson(text), { ok: true, value: { first: { nested: 'x' } } })
  })

  test('test_json_extract_respects_braces_and_quotes_inside_strings', ({ assert }) => {
    const text = 'Result: {"note": "a } brace, a \\" quote and a { brace", "n": 1} trailing }'
    assert.deepEqual(extractJson(text), {
      ok: true,
      value: { note: 'a } brace, a " quote and a { brace', n: 1 },
    })
  })

  test('test_json_extract_reads_a_top_level_array', ({ assert }) => {
    assert.deepEqual(extractJson('The list: [{"id": 1}, {"id": 2}] done'), {
      ok: true,
      value: [{ id: 1 }, { id: 2 }],
    })
  })

  test('test_json_extract_drops_inline_think_blocks', ({ assert }) => {
    const text = '<think>maybe {"wrong": true}?</think>\n{"right": true}'
    assert.deepEqual(extractJson(text), { ok: true, value: { right: true } })
  })

  test('test_json_extract_skips_a_balanced_but_invalid_candidate', ({ assert }) => {
    const text = 'Using {placeholders} first, then {"valid": 1}'
    assert.deepEqual(extractJson(text), { ok: true, value: { valid: 1 } })
  })

  test('test_json_extract_reports_invalid_output', ({ assert }) => {
    for (const text of ['', 'no json here', '{"unterminated": ', '{"a": 1,}']) {
      const result = extractJson(text)
      assert.isFalse(result.ok, text)
      if (!result.ok) assert.isString(result.reason)
    }
  })
})
