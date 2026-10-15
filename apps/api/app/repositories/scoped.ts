import type { LucidModel, LucidRow } from '@adonisjs/lucid/types/model'
import { householdIdOf, type HouseholdRef } from '#models/mixins/household_scoped'

/**
 * Loads one row of a household-scoped model by id, restricted to the given
 * household. A row of another household (or a missing one) throws
 * E_ROW_NOT_FOUND, which the API answers with 404: never 403, which would
 * leak that the id exists.
 */
export async function findInHousehold<Model extends LucidModel>(
  model: Model,
  household: HouseholdRef,
  id: number | string
): Promise<InstanceType<Model> & LucidRow> {
  return model
    .query()
    .where(`${model.table}.household_id`, householdIdOf(household))
    .where(`${model.table}.${model.primaryKey}`, id)
    .firstOrFail() as Promise<InstanceType<Model> & LucidRow>
}

/**
 * Returns the subset of `ids` that belong to the household (for validating
 * foreign keys sent in a request body: anything missing answers 422).
 */
export async function idsInHousehold(
  model: LucidModel,
  household: HouseholdRef,
  ids: number[]
): Promise<Set<number>> {
  if (ids.length === 0) return new Set()
  const rows = await model
    .query()
    .where(`${model.table}.household_id`, householdIdOf(household))
    .whereIn(`${model.table}.${model.primaryKey}`, ids)
    .select(`${model.table}.${model.primaryKey}`)
  return new Set(rows.map((row) => Number(row.$primaryKeyValue)))
}
