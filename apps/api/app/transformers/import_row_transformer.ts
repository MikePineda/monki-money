import type ImportRow from '#models/import_row'
import { isHiddenFrom, type PrivacyViewer } from '#domain/ledger/privacy'
import { BaseTransformer } from '@adonisjs/core/transformers'
import { isoTimestamp } from '#domain/time/iso_timestamp'
import { decodeHtmlEntities } from '#importers/html_entities'

/**
 * One bank row under review: the bank's data, what the importer proposes
 * (`resolution`, `match`, `suggestion`, `transfer`, payer) and what the
 * person decided. `description` is the bank text (entities decoded): plain
 * text, never HTML. Needs `transaction` and `matchTransaction` preloaded:
 * a row linked to the partner's private transaction hides its bank text,
 * merchant, suggestion and decision (`isMasked`), like the ledger does.
 */
export default class ImportRowTransformer extends BaseTransformer<ImportRow> {
  constructor(
    resource: ImportRow,
    protected viewer: PrivacyViewer
  ) {
    super(resource)
  }

  toObject() {
    const row = this.resource
    const matched = row.matchTransaction ?? null
    const linked = row.transaction ?? matched
    // Linked to the partner's private transaction: the bank text would reveal it.
    const masked = linked !== null && isHiddenFrom(linked, this.viewer)
    const text = <Value>(value: Value) => (masked ? null : value)

    return {
      id: row.id,
      rowIndex: row.rowIndex,
      bankDate: row.bankDate,
      date: row.date,
      amountCents: row.amountCents,
      balanceCents: row.balanceCents,
      transactionType: row.transactionType,
      description: text(decodeHtmlEntities(row.descriptionRaw)),
      descriptionNormalized: text(row.descriptionNormalized),
      merchantKey: text(row.merchantKey),
      merchantFullKey: text(row.merchantFullKey),
      nabCategory: text(row.nabCategory),
      nabMerchant: text(row.nabMerchant),
      isMasked: masked,
      cardSuffix: row.cardSuffix,
      isPending: row.isPending,
      isFutureDated: row.isFutureDated,
      resolution: row.resolution,
      proposedResolution: row.proposedResolution,
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
                    payee: isHiddenFrom(matched, this.viewer) ? null : matched.payee,
                    source: matched.source,
                    status: matched.status,
                  }
                : null,
            },
      suggestion:
        row.suggestionSource === null || masked
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
              // Several accounts the linked holder is known in; `accountId` is null then.
              candidateAccountIds: row.transferCandidateAccountIds ?? [],
            },
      suggestedPaidByUserId: row.suggestedPaidByUserId,
      decision: text(row.decision),
      decidedAt: isoTimestamp(row.decidedAt),
      transactionId: row.transactionId,
      confirmedAt: isoTimestamp(row.confirmedAt),
    }
  }
}
