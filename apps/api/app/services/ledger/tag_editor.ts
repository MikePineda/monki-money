import type User from '#models/user'
import Transaction from '#models/transaction'
import db from '@adonisjs/lucid/services/db'
import { TagNotFound } from '#exceptions/errors'
import { FieldError } from '#exceptions/field_error'
import { idsInHousehold } from '#repositories/scoped'
import type { BulkTagsInput } from '#services/ledger/dto'
import { privacyViewer } from '#services/ledger/privacy_viewer'
import { editTags, renameTag } from '#domain/ledger/tag_edits'
import { isHiddenFrom, type PrivacyViewer } from '#domain/ledger/privacy'
import type { HouseholdRef } from '#models/mixins/household_scoped'

/**
 * Changes to tags across many rows: renaming (or merging) a tag on every
 * transaction of the household, and adding or removing tags on a
 * selection. Both follow bulk categorize's privacy rule: the partner's
 * private rows are never touched (a transfer with such a leg neither, so
 * both legs keep the same tags), and every row is changed under its lock.
 */
export default class TagEditor {
  /**
   * Renames `from` to `to` on every row the reader can see that carries it
   * (both legs of a transfer, split rows: their lines follow the parent).
   * When `to` is already in use the two tags merge, never twice on a row;
   * the same name again changes nothing. 404 when the reader can see no
   * row with `from`, like `GET /tags/:tag`.
   */
  async rename(
    household: HouseholdRef,
    actor: User,
    from: string,
    to: string
  ): Promise<{ tag: string; updated: number }> {
    const viewer = await privacyViewer(household, actor)

    return db.transaction(async (trx) => {
      const rows = await Transaction.query({ client: trx })
        .withScopes((scopes) => scopes.forHousehold(household))
        .whereRaw('transactions.tags @> ?::jsonb', [JSON.stringify([from])])
        .orderBy('id')
        .forUpdate()
      if (!rows.some((row) => !isHiddenFrom(row, viewer))) throw new TagNotFound()
      if (from === to) return { tag: to, updated: 0 }

      const writable = this.writable(rows, rows, viewer)
      for (const row of writable) {
        row.merge({ tags: renameTag(row.tags, from, to), updatedByUserId: actor.id })
        await row.save()
      }
      return { tag: to, updated: writable.length }
    })
  }

  /**
   * Adds and removes tags on the selected rows. A transfer leg changes
   * both legs (a transfer's tags sit on both). Skipped, never touched: the
   * partner's private rows and a row that would pass 20 tags. A foreign or
   * missing id answers 422 `ids`, like bulk categorize.
   */
  async bulk(
    household: HouseholdRef,
    actor: User,
    input: BulkTagsInput
  ): Promise<{ updated: number; skipped: number }> {
    const changes = { add: input.add ?? [], remove: input.remove ?? [] }
    if (changes.add.length === 0 && changes.remove.length === 0) {
      throw new FieldError('add', 'required')
    }
    const ids = [...new Set(input.ids)]
    const owned = await idsInHousehold(Transaction, household, ids)
    if (ids.some((id) => !owned.has(id))) throw new FieldError('ids', 'database.exists')
    const viewer = await privacyViewer(household, actor)

    return db.transaction(async (trx) => {
      const selected = await Transaction.query({ client: trx })
        .withScopes((scopes) => scopes.forHousehold(household))
        .whereIn('id', ids)
        .orderBy('id')
        .forUpdate()
      const transferIds = [...new Set(selected.map((row) => row.transferId))].filter(
        (id): id is number => id !== null
      )
      const otherLegs =
        transferIds.length === 0
          ? []
          : await Transaction.query({ client: trx })
              .withScopes((scopes) => scopes.forHousehold(household))
              .whereIn('transfer_id', transferIds)
              .whereNotIn('id', ids)
              .orderBy('id')
              .forUpdate()
      const all = [...selected, ...otherLegs]

      let updated = 0
      for (const row of selected) {
        const group =
          row.transferId === null ? [row] : all.filter((leg) => leg.transferId === row.transferId)
        if (this.writable(group, all, viewer).length !== group.length) continue
        const edits = group.map((leg) => ({ leg, ...editTags(leg.tags, changes) }))
        if (edits.some((edit) => !edit.fits)) continue
        for (const { leg, tags } of edits) {
          leg.merge({ tags, updatedByUserId: actor.id })
          await leg.save()
        }
        updated++
      }
      return { updated, skipped: ids.length - updated }
    })
  }

  /**
   * The rows of `rows` the reader may change: not the partner's private
   * ones, nor a leg of a transfer whose other leg (in `context`) is.
   */
  protected writable(rows: Transaction[], context: Transaction[], viewer: PrivacyViewer) {
    const lockedTransfers = new Set(
      context.filter((row) => isHiddenFrom(row, viewer)).map((row) => row.transferId)
    )
    return rows.filter(
      (row) =>
        !isHiddenFrom(row, viewer) &&
        (row.transferId === null || !lockedTransfers.has(row.transferId))
    )
  }
}
