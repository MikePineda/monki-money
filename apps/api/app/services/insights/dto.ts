import type MonthlyInsight from '#models/monthly_insight'

export interface GenerateInsightOptions {
  /** Ask the model again even when the month already has a summary. */
  force?: boolean
}

export interface GeneratedInsight {
  insight: MonthlyInsight
  /** True when the model wrote it now, false when the stored one came back. */
  fresh: boolean
}
