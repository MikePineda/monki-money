import type { MonthlyInsight } from '../app/core/api/api-types'
import type { GeneratedInsight } from '../app/features/month/data-access/insights.api'

/** A synthetic monthly summary (the shape of the API's fake LLM fixture). */
export function anInsight(overrides: Partial<MonthlyInsight> = {}): MonthlyInsight {
  return {
    month: '2026-10',
    locale: 'en',
    headline: 'You kept more than a third of your income this month',
    bodyMarkdown: 'Spending stayed **below income**. Groceries were the biggest category.',
    highlights: [
      { tone: 'positive', text: 'Net savings were positive' },
      { tone: 'neutral', text: 'Groceries were the largest expense' },
      { tone: 'warning', text: 'Transport spending went up' },
    ],
    model: 'fake',
    generatedAt: '2026-10-16T10:00:00.000Z',
    ...overrides,
  } as MonthlyInsight
}

export function aGeneratedInsight(
  overrides: Partial<MonthlyInsight> = {},
  fresh = true
): GeneratedInsight {
  return { ...anInsight(overrides), fresh }
}
