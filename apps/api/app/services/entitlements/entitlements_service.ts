import { DateTime } from 'luxon'
import LlmUsage from '#models/llm_usage'
import Household from '#models/household'
import app from '@adonisjs/core/services/app'
import { entitlementsFor } from '#config/plans'
import { LlmQuotaExceededError } from '#llm/errors'

/**
 * Plan limits that need a count to enforce (config/plans.ts). Today: the
 * monthly LLM calls. A "call" is one answered round trip (`llm_usage` rows
 * with status ok or invalid_output, retries included); vendor errors cost
 * nothing and do not count. Months are calendar months in the household's
 * time zone. `LLM_MONTHLY_CAP_OVERRIDE` (config `llm.monthlyCapOverride`)
 * replaces the plan's cap for every household.
 */
export default class EntitlementsService {
  async llmMonthlyCap(household: Household): Promise<number> {
    const override = app.config.get<number | null>('llm.monthlyCapOverride', null)
    return override ?? entitlementsFor(household.plan).llmCallsPerMonth
  }

  async llmCallsThisMonth(household: Household, now: DateTime = DateTime.now()): Promise<number> {
    const monthStart = now.setZone(household.timezone).startOf('month')
    const [row] = await LlmUsage.query()
      .where('household_id', household.id)
      .where('created_at', '>=', monthStart.toUTC().toISO()!)
      .whereNot('status', 'error')
      .count('* as total')
    return Number(row.$extras['total'])
  }

  /** Throws LlmQuotaExceededError (402) when the household used its calls. */
  async assertLlmQuota(household: Household | number, now: DateTime = DateTime.now()) {
    const target = typeof household === 'number' ? await Household.findOrFail(household) : household
    const [cap, used] = await Promise.all([
      this.llmMonthlyCap(target),
      this.llmCallsThisMonth(target, now),
    ])
    if (used >= cap) throw new LlmQuotaExceededError()
  }
}
