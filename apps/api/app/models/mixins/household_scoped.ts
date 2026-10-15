import { scope, type BaseModel } from '@adonisjs/lucid/orm'
import type { NormalizeConstructor } from '@adonisjs/core/types/helpers'
import type { LucidModel, ModelQueryBuilderContract } from '@adonisjs/lucid/types/model'

/** A household or its id. */
export type HouseholdRef = number | { id: number }

export function householdIdOf(household: HouseholdRef): number {
  return typeof household === 'number' ? household : household.id
}

/**
 * Tenancy mixin for every model that carries `household_id`. Lists must go
 * through `Model.query().withScopes((s) => s.forHousehold(household))` and
 * single rows through `findInHousehold` (app/repositories/scoped.ts), so a
 * row of another household is simply never found (404, never 403).
 */
export function HouseholdScoped<Model extends NormalizeConstructor<typeof BaseModel>>(
  superclass: Model
) {
  class HouseholdScopedModel extends superclass {
    declare householdId: number

    static forHousehold = scope(
      (query: ModelQueryBuilderContract<LucidModel>, household: HouseholdRef) => {
        query.where(`${query.model.table}.household_id`, householdIdOf(household))
      }
    )
  }

  return HouseholdScopedModel
}
