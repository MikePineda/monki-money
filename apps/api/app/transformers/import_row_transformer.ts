import type ImportRow from '#models/import_row'
import { isHiddenFrom } from '#domain/ledger/privacy'
import { BaseTransformer } from '@adonisjs/core/transformers'
import { isoTimestamp } from '#domain/time/iso_timestamp'
import { decodeHtmlEntities } from '#importers/html_entities'

/**
 * One bank row under review: the bank's data, what the importer proposes
 * (`resolution`, `match`, `suggestion`, `transfer`, payer) and what the
 * person decided. `description` is the bank text (entities decoded): plain
 * text, never HTML. The matched transaction (needs `matchTransaction`
 * preloaded) hides its payee when it is the partner's private one.
 */
export default class ImportRowTransformer extends BaseTransformer<ImportRow> {
  constructor(
    resource: ImportRow,
    protected viewerUserId: number
  ) {
    super(resource)
  }

  toObject() {
    const row = this.resource
    const matched = row.matchTransaction ?? null

    return {
      id: row.id,
      rowIndex: row.rowIndex,
      bankDate: row.bankDate,
      date: row.date,
      amountCents: row.amountCents,
      balanceCents: row.balanceCents,
      transactionType: row.transactionType,
      description: decodeHtmlEntities(row.descriptionRaw),
      descriptionNormalized: row.descriptionNormalized,
      merchantKey: row.merchantKey,
      merchantFullKey: row.merchantFullKey,
      nabCategory: row.nabCategory,
      nabMerchant: row.nabMerchant,
      cardSuffix: row.cardSuffix,
      isPending: row.isPending,
      isFutureDated: row.isFutureDated,
      resolution: row.resolution,
      needsReview: row.needsReview,
      reasons: row.reasons,
      match:
        row.matchTransactionId === null
          ? null
          : {
              transactionId: row.matchTransactionId,
              score: row.matchScore,
              upgradesPending: row.upgradesPending,
              transaction: matched
                ? {
                    date: matched.date,
                    amountCents: matched.amountCents,
                    payee: isHiddenFrom(matched, this.viewerUserId) ? null : matched.payee,
                    source: matched.source,
                    status: matched.status,
                  }
                : null,
            },
      suggestion:
        row.suggestionSource === null
          ? null
          : {
              source: row.suggestionSource,
              categoryId: row.suggestedCategoryId,
              confidence: row.suggestionConfidence,
              needsReview: row.suggestionNeedsReview,
              ruleId: row.suggestionRuleId,
              payee: row.suggestedPayee,
            },
      transfer:
        row.transferSignal === null
          ? null
          : {
              signal: row.transferSignal,
              accountId: row.suggestedTransferAccountId,
              legTransactionId: row.transferLegTransactionId,
              ruleId: row.transferRuleId,
            },
      suggestedPaidByUserId: row.suggestedPaidByUserId,
      decision: row.decision,
      decidedAt: isoTimestamp(row.decidedAt),
      transactionId: row.transactionId,
      confirmedAt: isoTimestamp(row.confirmedAt),
    }
  }
}
