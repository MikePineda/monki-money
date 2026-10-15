import db from '@adonisjs/lucid/services/db'
import type { LucidModel } from '@adonisjs/lucid/types/model'
import { FieldError } from '#exceptions/field_error'
import { idsInHousehold } from '#repositories/scoped'
import { householdIdOf, type HouseholdRef } from '#models/mixins/household_scoped'

/**
 * `PUT /<resource>/reorder { ids }`: `sort_order` = position in `ids`.
 * Every id must belong to the household (422 on `ids` otherwise); ids not
 * listed keep their order.
 */
export async function reorder(model: LucidModel, household: HouseholdRef, ids: number[]) {
  const owned = await idsInHousehold(model, household, ids)
  if (ids.some((id) => !owned.has(id))) throw new FieldError('ids', 'database.exists')

  await db.transaction(async (trx) => {
    for (const [position, id] of ids.entries()) {
      await trx
        .from(model.table)
        .where('household_id', householdIdOf(household))
        .where('id', id)
        .update({ sort_order: position })
    }
  })
}

/** Next `sort_order` (max + 1) among the rows matched by `where`. */
export async function nextSortOrder(table: string, where: Record<string, number>) {
  const row = await db.from(table).where(where).max('sort_order as max').first()
  return row?.max === null || row?.max === undefined ? 0 : Number(row.max) + 1
}
