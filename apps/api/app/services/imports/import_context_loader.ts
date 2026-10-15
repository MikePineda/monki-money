import { inject } from '@adonisjs/core'
import type Account from '#models/account'
import Category from '#models/category'
import ImportRow from '#models/import_row'
import Transaction from '#models/transaction'
import MerchantRule from '#models/merchant_rule'
import db from '@adonisjs/lucid/services/db'
import { addDays } from '#domain/importing/iso_days'
import type { PayerContext } from '#domain/importing/paid_by'
import { TRANSFER_LEG_WINDOW_DAYS } from '#domain/importing/transfer_detector'
import { DAYS_AFTER_POSTING, DAYS_BEFORE_PURCHASE } from '#domain/importing/matcher'
import CandidatesRepository, { type MatchCandidate } from '#repositories/candidates_repository'
import type { QueryClientContract } from '@adonisjs/lucid/types/database'
import { householdIdOf, type HouseholdRef } from '#models/mixins/household_scoped'
import type {
  CandidateTx,
  MerchantRule as RuleValue,
  ResolverContext,
  StagedRow,
  TransferLeg,
} from '#domain/importing/types'

/**
 * Loads, as plain values, what the pure import pipeline needs from the
 * database (app/domain/importing): rules, categories, payers, stored
 * hashes, match candidates and the other legs of possible transfers.
 */
@inject()
export default class ImportContextLoader {
  constructor(protected candidates: CandidatesRepository) {}

  async rules(household: HouseholdRef, client: QueryClientContract = db): Promise<RuleValue[]> {
    const rules = await MerchantRule.query({ client }).withScopes((scopes) =>
      scopes.forHousehold(household)
    )
    return rules.map((rule) => rule.toRule())
  }

  async categoryIdBySlug(household: HouseholdRef): Promise<Map<string, number>> {
    const categories = await Category.query()
      .withScopes((scopes) => scopes.forHousehold(household))
      .select('id', 'slug')
    return new Map(categories.map((category) => [category.slug, category.id]))
  }

  /**
   * Who paid an imported row of `account` (cards preloaded): its owner for
   * a personal account, else the card holder; a joint account's row
   * without a card (transfers, BPAY, salary) is joint.
   */
  payers(account: Account): PayerContext {
    return {
      accountOwnerUserId: account.ownerUserId,
      cardOwners: new Map(
        account.cards
          .filter((card) => card.userId !== null)
          .map((card) => [card.cardSuffix, card.userId!])
      ),
      fallbackUserId: null,
    }
  }

  /** `external_hash` values of `rows` already stored for the account (any resolution). */
  async existingHashes(household: HouseholdRef, accountId: number, rows: readonly StagedRow[]) {
    const hashes = [...new Set(rows.map((row) => row.externalHash))]
    const stored = new Set<string>()
    for (let offset = 0; offset < hashes.length; offset += 1000) {
      const found = await ImportRow.query()
        .withScopes((scopes) => scopes.forHousehold(household))
        .where('account_id', accountId)
        .whereIn('external_hash', hashes.slice(offset, offset + 1000))
        .select('external_hash')
      for (const row of found) stored.add(row.externalHash)
    }
    return stored
  }

  /**
   * The resolver context of one account's rows. `otherStaged` are the new
   * rows of the household's other accounts in the same upload: they may be
   * the other leg of a transfer before reaching the ledger.
   */
  async context(
    household: HouseholdRef,
    accountId: number,
    rows: readonly StagedRow[],
    options: {
      existingHashes: ReadonlySet<string>
      rules: readonly RuleValue[]
      otherStaged: readonly StagedRow[]
    }
  ): Promise<ResolverContext> {
    if (rows.length === 0) {
      return {
        existingHashes: options.existingHashes,
        candidates: [],
        transferLegs: [],
        rules: options.rules,
      }
    }
    const dates = rows.map((row) => row.date).sort()
    const bankDates = rows.map((row) => row.bankDate).sort()
    const from = dates[0] < bankDates[0] ? dates[0] : bankDates[0]
    const to = bankDates.at(-1)! > dates.at(-1)! ? bankDates.at(-1)! : dates.at(-1)!

    const [candidates, ledgerLegs] = await Promise.all([
      this.candidates.forImport(household, {
        accountId,
        from: addDays(from, -DAYS_BEFORE_PURCHASE),
        to: addDays(to, DAYS_AFTER_POSTING),
      }),
      this.ledgerLegs(household, accountId, {
        from: addDays(from, -TRANSFER_LEG_WINDOW_DAYS),
        to: addDays(to, TRANSFER_LEG_WINDOW_DAYS),
      }),
    ])

    const stagedLegs: TransferLeg[] = options.otherStaged.map((row) => ({
      accountId: row.accountId,
      amountCents: row.amountCents,
      date: row.date,
      transactionId: null,
      externalHash: row.externalHash,
    }))

    return {
      existingHashes: options.existingHashes,
      candidates: candidates.map(toCandidateTx),
      transferLegs: [...ledgerLegs, ...stagedLegs],
      rules: options.rules,
    }
  }

  /**
   * Movements in the household's other accounts that may be the other side
   * of a transfer: standalone expenses/income (a row already linked to a
   * transfer has its other leg).
   */
  protected async ledgerLegs(
    household: HouseholdRef,
    accountId: number,
    window: { from: string; to: string }
  ): Promise<TransferLeg[]> {
    const rows = await Transaction.query()
      .where('household_id', householdIdOf(household))
      .whereNot('account_id', accountId)
      .whereNot('kind', 'transfer')
      .whereBetween('date', [window.from, window.to])
      .select('id', 'account_id', 'amount_cents', 'date')
      .orderBy('date')
      .orderBy('id')
    return rows.map((row) => ({
      accountId: row.accountId,
      amountCents: row.amountCents,
      date: row.date,
      transactionId: row.id,
      externalHash: null,
    }))
  }
}

/**
 * A ledger row as the matcher sees it. A row this account's bank never
 * showed is, for the matcher, a hand entry: that includes the other leg of
 * a transfer created while importing another account (`source = import`
 * but cleared and unlinked here). Pending imports keep their source so the
 * matcher upgrades them.
 */
function toCandidateTx(candidate: MatchCandidate): CandidateTx {
  const pendingImport = candidate.source === 'import' && candidate.status === 'pending'
  return {
    id: candidate.id,
    accountId: candidate.accountId,
    amountCents: candidate.amountCents,
    date: candidate.date,
    payee: candidate.payee,
    description: candidate.description ?? candidate.rawDescription,
    cardSuffix: candidate.cardSuffix,
    paidByUserId: candidate.paidByUserId,
    source: candidate.source === 'import' && !pendingImport ? 'manual' : candidate.source,
    status: candidate.status,
  }
}
