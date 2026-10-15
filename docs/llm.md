# LLM layer

`apps/api/app/llm/` wraps every model call behind one container token,
`LlmProvider` (`classifyTransactions`, `extractReceipt`, `monthlyInsight`).
Services inject it with `@inject()`; each call checks the household's monthly
quota, validates the answer and writes one `llm_usage` row per attempt.

## Switching providers (env only)

| `LLM_PROVIDER`                   | Needs         | Talks to                                                                                                                                                                 |
| -------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `anthropic-compatible` (default) | `LLM_API_KEY` | `LLM_BASE_URL` (default: MiniMax's Anthropic-compatible API) with `LLM_MODEL` (default `MiniMax-M3`)                                                                     |
| `anthropic`                      | `LLM_API_KEY` | Anthropic's API with `LLM_MODEL` (default `claude-opus-5-5`)                                                                                                             |
| `fake`                           | nothing       | No network. Deterministic answers from `tests/fixtures/llm/*.json`; without them (production image) classify returns "no suggestion" and receipts/insights fail with 503 |

An empty `LLM_API_KEY` always selects `fake`: the app boots and works without
an LLM (production logs a warning). `LLM_VISION_MODEL` defaults to `LLM_MODEL`
(MiniMax-M3 reads images). `LLM_MONTHLY_CAP_OVERRIDE` replaces the plan's
`llmCallsPerMonth` (free 200, pro 2000) for every household. A "call" is one
answered round trip (retries and classify chunks of 40 rows included; vendor
errors do not count), per calendar month in the household's time zone.

## Smoke test (production)

Real calls, synthetic data; prints the parsed answer and the usage, exits 1
on invalid output, a vendor error or when the fake is selected. Never in CI.

```bash
ssh <server> 'docker exec $(docker ps -q -f name=monkimoney-web | head -n1) node ace llm:smoke'
# with a receipt photo (jpg/png/gif/webp, never commit real ones):
ssh <server> 'C=$(docker ps -q -f name=monkimoney-web | head -n1); docker cp /tmp/receipt.jpg $C:/tmp/receipt.jpg && docker exec $C node ace llm:smoke --receipt /tmp/receipt.jpg'
```

Locally (`--allow-fake` dry run): `cd apps/api && node ace llm:smoke --allow-fake`.

## Cost

`llm_usage.cost_micros` is micro-dollars from the price table in
`apps/api/config/llm.ts` (add a row when switching models, unknown models
cost 0).

| Model             | Input / output, USD per 1M tokens | Rough cost                                                |
| ----------------- | --------------------------------- | --------------------------------------------------------- |
| `MiniMax-M3`      | 0.30 / 1.20                       | ~US$0.004 per 40-row classify call, ~US$0.002 per receipt |
| `claude-opus-5-5` | 4 / 20                            | ~15x MiniMax-M3                                           |

## Prompt-injection posture

- Bank descriptions, receipt text and user-entered names reach the model only
  inside one `<data>` block, as JSON with `<`, `>` and `&` escaped, so the
  payload cannot close the block. Static system prompts state that the block is
  data, not instructions (`app/llm/prompts/untrusted_data.ts`).
- No tools, no forced tool use. The answer is JSON in text, extracted
  (`json_extract.ts`) and validated against closed VineJS schemas
  (`app/llm/schemas`); a category must be one of the slugs we sent or it
  becomes `null`, and unknown row ids are dropped.
- One retry with the validation issues, then `LlmOutputInvalidError` (422);
  classification degrades to "no suggestion" instead. Vendor failures raise
  `LlmProviderError` (503) and the quota raises `LlmQuotaExceededError` (402).
- Receipt photos are re-encoded in memory (`sharp`: EXIF orientation, ≤ 1600 px,
  JPEG, metadata stripped) and never persisted. Only `model`, `max_tokens`,
  `system` and `messages` are sent: no `thinking`, `top_k`, `stop_sequences`,
  `output_config` or `tool_choice`, which keeps MiniMax and Claude
  interchangeable.
