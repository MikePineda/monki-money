import { daysBetween } from '#domain/importing/iso_days'
import { findMatchingRule } from '#domain/importing/rule_matching'
import type {
  MerchantRule,
  StagedRow,
  TransferDetection,
  TransferLeg,
} from '#domain/importing/types'

/** The other leg of a transfer must land within this many days. */
export const TRANSFER_LEG_WINDOW_DAYS = 2

/** NAB's category for movements between the customer's own NAB accounts. */
const INTERNAL_TRANSFER_CATEGORY = 'internal transfers'

/** NAB's memo on a transfer to a linked account (`ONLINE A1234567890 Linked Acc Trns ...`). */
const LINKED_ACCOUNT_MEMO = /\bLinked Acc Trns\b/i

export type TransferSubject = Pick<
  StagedRow,
  | 'accountId'
  | 'amountCents'
  | 'date'
  | 'details'
  | 'nabCategory'
  | 'nabMerchant'
  | 'merchantKey'
  | 'merchantFullKey'
>

export interface TransferContext {
  rules: readonly MerchantRule[]
  /** Movements in the household's other accounts. */
  legs: readonly TransferLeg[]
}

function bankSignal(row: TransferSubject): TransferDetection['signal'] | null {
  if (row.nabCategory?.trim().toLowerCase() === INTERNAL_TRANSFER_CATEGORY) return 'bank_category'
  if (LINKED_ACCOUNT_MEMO.test(row.details)) return 'linked_account_memo'
  return null
}

/** Opposite amount, another account (the given one if known), within two days; closest first. */
function findOppositeLeg(
  row: TransferSubject,
  legs: readonly TransferLeg[],
  accountId: number | null
): TransferLeg | null {
  const distance = (leg: TransferLeg) => Math.abs(daysBetween(row.date, leg.date))
  const fits = legs.filter(
    (leg) =>
      leg.accountId !== row.accountId &&
      (accountId === null || leg.accountId === accountId) &&
      leg.amountCents === -row.amountCents &&
      distance(leg) <= TRANSFER_LEG_WINDOW_DAYS
  )
  fits.sort((a, b) => distance(a) - distance(b))
  return fits[0] ?? null
}

/**
 * Is the row one leg of a transfer between two accounts of the household?
 *
 * 1. The winning merchant rule decides first: a rule with
 *    `transferAccountId` makes it a transfer to/from that account (system
 *    rule: `Hnry ...` rows come from the Hnry account); a category rule
 *    makes it spending or income.
 * 2. Otherwise NAB's signals: category `Internal transfers` or the
 *    `Linked Acc Trns` memo. The other account is the one holding the
 *    opposite amount within two days; when none does, the review screen
 *    asks for it.
 *
 * Transfers to or from other people (PayID "hot pot", NAB's `Transfers
 * in/out`) carry neither signal: they are spending/income with the person
 * as payee, even when an equal and opposite amount happens to exist.
 */
export function detectTransfer(
  row: TransferSubject,
  context: TransferContext
): TransferDetection | null {
  const direction = row.amountCents < 0 ? 'out' : 'in'
  const rule = findMatchingRule(context.rules, row)?.rule ?? null
  const ruleAccountId = rule?.transferAccountId ?? null

  if (rule && ruleAccountId !== null && ruleAccountId !== row.accountId) {
    return {
      signal: 'rule',
      direction,
      counterpartAccountId: ruleAccountId,
      oppositeLeg: findOppositeLeg(row, context.legs, ruleAccountId),
      ruleId: rule.id,
    }
  }
  if (rule && rule.categoryId !== null) return null

  const signal = bankSignal(row)
  if (!signal) return null
  const oppositeLeg = findOppositeLeg(row, context.legs, null)
  return {
    signal,
    direction,
    counterpartAccountId: oppositeLeg?.accountId ?? null,
    oppositeLeg,
    ruleId: null,
  }
}
