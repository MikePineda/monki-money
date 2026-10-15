import { test } from '@japa/runner'
import { costMicros } from '#llm/cost'
import { Secret } from '@adonisjs/core/helpers'
import { resolveLlmSettings } from '#llm/llm_settings'

const key = new Secret('sk-test')

test.group('LLM settings', () => {
  test('test_empty_api_key_selects_the_fake_provider', ({ assert }) => {
    assert.equal(resolveLlmSettings({ provider: 'anthropic-compatible' }).provider, 'fake')
    assert.equal(
      resolveLlmSettings({ provider: 'anthropic-compatible', apiKey: new Secret('  ') }).provider,
      'fake'
    )
    assert.equal(resolveLlmSettings({}).provider, 'fake')
  })

  test('test_explicit_fake_wins_even_with_a_key', ({ assert }) => {
    const settings = resolveLlmSettings({ provider: 'fake', apiKey: key, model: 'MiniMax-M3' })
    assert.equal(settings.provider, 'fake')
    // Fake calls never get priced as a real model.
    assert.equal(settings.model, 'fake')
  })

  test('test_anthropic_compatible_defaults_to_minimax_m3', ({ assert }) => {
    const settings = resolveLlmSettings({ provider: 'anthropic-compatible', apiKey: key })
    assert.equal(settings.provider, 'anthropic-compatible')
    assert.equal(settings.baseUrl, 'https://api.minimax.io/anthropic')
    assert.equal(settings.model, 'MiniMax-M3')
    assert.equal(settings.visionModel, 'MiniMax-M3')
    assert.equal(settings.apiKey?.release(), 'sk-test')
  })

  test('test_env_values_override_the_defaults', ({ assert }) => {
    const settings = resolveLlmSettings({
      provider: 'anthropic-compatible',
      apiKey: key,
      baseUrl: 'http://llm.internal/anthropic',
      model: 'text-model',
      visionModel: 'vision-model',
      monthlyCapOverride: 50,
    })
    assert.equal(settings.baseUrl, 'http://llm.internal/anthropic')
    assert.equal(settings.model, 'text-model')
    assert.equal(settings.visionModel, 'vision-model')
    assert.equal(settings.monthlyCapOverride, 50)
  })

  test('test_anthropic_provider_uses_the_sdk_default_endpoint', ({ assert }) => {
    const settings = resolveLlmSettings({ provider: 'anthropic', apiKey: key })
    assert.isUndefined(settings.baseUrl)
    assert.equal(settings.model, 'claude-opus-5-5')
  })

  test('test_monthly_cap_override_is_null_when_unset', ({ assert }) => {
    assert.isNull(resolveLlmSettings({ apiKey: key }).monthlyCapOverride)
  })

  test('test_cost_micros_uses_usd_per_million_tokens', ({ assert }) => {
    const pricing = { 'MiniMax-M3': { inputUsdPerMTok: 0.3, outputUsdPerMTok: 1.2 } }
    // 1000 x 0.30 + 500 x 1.20 = 900 micro-dollars
    assert.equal(costMicros(pricing, 'MiniMax-M3', 1000, 500), 900)
    assert.equal(costMicros(pricing, 'minimax-m3', 1000, 500), 900)
    assert.equal(costMicros(pricing, 'unknown-model', 1000, 500), 0)
    assert.equal(costMicros(pricing, 'MiniMax-M3', 1, 1), 2)
  })
})
