import { extname } from 'node:path'
import { readFile } from 'node:fs/promises'
import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import type { ClassifyInput, LlmCallUsage, ReceiptMediaType } from '#llm/types'

/** Synthetic rows (no personal data) with the slug a sane model should pick. */
const SMOKE_ROWS: Array<ClassifyInput['rows'][number] & { expected: string }> = [
  {
    id: 'smoke-1',
    date: '2026-09-12',
    amountCents: -4520,
    description: 'WOOLWORTHS 4412 SOUTH BRISBANE AU',
    expected: 'groceries',
  },
  {
    id: 'smoke-2',
    date: '2026-09-13',
    amountCents: -360,
    description: 'TRANSLINK FARE GO CARD',
    expected: 'public-transport',
  },
  {
    id: 'smoke-3',
    date: '2026-09-15',
    amountCents: 350000,
    description: 'ACME PTY LTD PAYROLL SEP',
    expected: 'salary',
  },
]

const MEDIA_TYPES: Record<string, ReceiptMediaType> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
}

/**
 * `node ace llm:smoke [--receipt <path>]`: operator check of the configured
 * LLM (MiniMax in production) from inside the running container. Classifies
 * three synthetic rows and, with --receipt, extracts a receipt photo; prints
 * the parsed result and the usage. Exits 1 on invalid output, on a vendor
 * error, or when the fake provider is selected (unless --allow-fake). Calls
 * are recorded in `llm_usage` without a household. Never run it in CI.
 */
export default class LlmSmoke extends BaseCommand {
  static override commandName = 'llm:smoke'
  static override description = 'Call the configured LLM with synthetic data and print the result'
  static override options: CommandOptions = { startApp: true }

  @flags.string({ description: 'Receipt photo to extract (jpg, png, gif or webp)' })
  declare receipt?: string

  @flags.boolean({ description: 'Run against the fake provider (local dry run)' })
  declare allowFake?: boolean

  override async run() {
    // App code is imported lazily, after the app (and its providers) booted.
    const { TAXONOMY } = await import('@monkimoney/shared')
    const { LlmProvider } = await import('#llm/llm_provider')
    const { LlmOutputInvalidError, LlmProviderError } = await import('#llm/errors')
    const { FieldError } = await import('#exceptions/field_error')

    const llm = await this.app.container.make(LlmProvider)
    const endpoint = llm.isLive
      ? (this.app.config.get<string | undefined>('llm.baseUrl') ?? 'SDK default')
      : 'none'
    this.logger.info(
      `provider ${llm.name} | model ${llm.model} | vision ${llm.visionModel} | endpoint ${endpoint}`
    )
    if (!llm.isLive && !this.allowFake) {
      this.logger.error('The fake provider is selected (LLM_API_KEY empty or LLM_PROVIDER=fake)')
      this.exitCode = 1
      return
    }

    const categories = TAXONOMY.flatMap((group) =>
      group.categories.map((category) => ({
        slug: category.slug,
        name: category.nameEn,
        group: group.nameEn,
        kind: group.kind,
      }))
    )
    const operator = { householdId: null, userId: null, locale: 'en' as const }

    try {
      const classified = await llm.classifyTransactions(
        { rows: SMOKE_ROWS.map(({ expected: _, ...row }) => row), categories },
        operator
      )
      const table = this.ui.table()
      table.head(['id', 'description', 'expected', 'got', 'confidence', 'payee'])
      for (const [index, suggestion] of classified.data.suggestions.entries()) {
        const row = SMOKE_ROWS[index]
        const got = suggestion.categorySlug ?? '(none)'
        table.row([
          row.id,
          row.description,
          row.expected,
          got === row.expected ? this.colors.green(got) : this.colors.yellow(got),
          suggestion.confidence.toFixed(2),
          suggestion.payee ?? '',
        ])
      }
      table.render()
      this.#printUsage('classify', classified.usage)
      if (classified.degraded) {
        this.logger.error('classify degraded: the model answer was invalid twice')
        this.exitCode = 1
      }

      if (this.receipt) {
        const mediaType = MEDIA_TYPES[extname(this.receipt).toLowerCase()]
        if (!mediaType) {
          this.logger.error(`--receipt must be one of ${Object.keys(MEDIA_TYPES).join(', ')}`)
          this.exitCode = 1
          return
        }
        const bytes = await readFile(this.receipt)
        const base64 = bytes.toString('base64')
        const receipt = await llm.extractReceipt(
          { image: { base64, mediaType }, categories, currencyCode: 'AUD' },
          operator
        )
        this.logger.log(JSON.stringify(receipt.data, null, 2))
        this.#printUsage('receipt', receipt.usage)
      }
    } catch (error) {
      if (error instanceof LlmOutputInvalidError) {
        this.logger.error(`invalid output after the retry: ${error.issues.join('; ')}`)
        this.#printUsage('failed call', error.usage)
      } else if (error instanceof LlmProviderError || error instanceof FieldError) {
        this.logger.error(error.message)
      } else {
        throw error
      }
      this.exitCode = 1
    }
  }

  #printUsage(label: string, usage: LlmCallUsage) {
    const dollars = (usage.costMicros / 1_000_000).toFixed(6)
    this.logger.info(
      `${label}: ${usage.attempts} call(s), ${usage.inputTokens} in / ${usage.outputTokens} out tokens, ` +
        `${usage.latencyMs} ms, US$${dollars} (${usage.model})`
    )
  }
}
