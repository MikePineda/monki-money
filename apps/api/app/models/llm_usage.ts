import User from '#models/user'
import Household from '#models/household'
import { belongsTo } from '@adonisjs/lucid/orm'
import { LlmUsageSchema } from '#database/schema'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'

/**
 * One LLM call (every attempt, retries included), written by
 * `LlmUsageRecorder`. Not household-scoped through the mixin because
 * operator calls (`llm:smoke`) have no household; reads for a household
 * filter on `household_id` explicitly (see EntitlementsService).
 */
export default class LlmUsage extends LlmUsageSchema {
  static override table = 'llm_usage'

  @belongsTo(() => Household)
  declare household: BelongsTo<typeof Household>

  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>
}
