import { daysBetween } from '#domain/importing/iso_days'
import { findMatchingRule } from '#domain/importing/rule_matching'
import {
  bankTransferSignal,
  internalTransferCounterparts,
  linkedHolderKey,
} from '#domain/importing/linked_accounts'
import type {
  HouseholdAccount,
  MerchantRule,
  StagedRow,
  TransferDetection,
  TransferLeg,
} from '#domain/importing/types'

/** The other leg of a transfer must land within this many days. */
export const TRANSFER_LEG_WINDOW_DAYS = 2

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
  /** Every account of the household (the importing one included). */
  accounts: readonly HouseholdAccount[]
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

/** The rule's account, when it names one other than the imported account. */
function transferTarget(rule: MerchantRule | null | undefined, row: TransferSubject) {
  const accountId = rule?.transferAccountId ?? null
  return accountId !== null && accountId !== row.accountId ? accountId : null
}

/** The learned rule of the linked holder the row names (bank signal required). */
function holderRule(row: TransferSubject, rules: readonly MerchantRule[]): MerchantRule | null {
  const key = linkedHolderKey(row)
  if (key === null) return null
  const rule = rules.find(
    (candidate) =>
      candidate.matchType === 'merchant' &&
      candidate.pattern === key &&
      transferTarget(candidate, row) !== null
  )
  return rule ?? null
}

/**
 * Is the row one leg of a transfer between two accounts of the household?
 *
 * 1. The winning merchant rule decides first: a rule with
 *    `transferAccountId` makes it a transfer to/from that account (system
 *    rule: `Hnry ...` rows come from the Hnry account); a category rule
 *    makes it spending or income.
 * 2. Otherwise NAB's signals: category `Internal transfers` or the
 *    `Linked Acc Trns` memo. The other account is, in order: the one
 *    holding the opposite amount within two days; the account the learned
 *    rule of the linked holder names (`linkedHolderKey`: the memo the
 *    person typed varies, the holder does not); the only other active
 *    savings/transaction account at the same institution. When none
 *    decides, the review screen asks for it.
 *
 * Transfers to or from other people (PayID "hot pot", NAB's `Transfers
 * in/out`) carry neither signal: they are spending/income with the person
 * as payee, even when an equal and opposite amount happens to exist or the
 * person shares a linked holder's name.
 */
export function detectTransfer(
  row: TransferSubject,
  context: TransferContext
): TransferDetection | null {
  const direction = row.amountCents < 0 ? 'out' : 'in'
  const byRule = (rule: MerchantRule, accountId: number): TransferDetection => ({
    signal: 'rule',
    direction,
    counterpartAccountId: accountId,
    oppositeLeg: findOppositeLeg(row, context.legs, accountId),
    ruleId: rule.id,
  })

  const rule = findMatchingRule(context.rules, row)?.rule ?? null
  const ruleAccountId = transferTarget(rule, row)
  if (rule && ruleAccountId !== null) return byRule(rule, ruleAccountId)
  if (rule && rule.categoryId !== null) return null

  const signal = bankTransferSignal(row)
  if (!signal) return null
  const oppositeLeg = findOppositeLeg(row, context.legs, null)
  if (oppositeLeg) {
    return {
      signal,
      direction,
      counterpartAccountId: oppositeLeg.accountId,
      oppositeLeg,
      ruleId: null,
    }
  }

  const holder = holderRule(row, context.rules)
  if (holder) return byRule(holder, holder.transferAccountId!)

  const counterparts = internalTransferCounterparts(row.accountId, context.accounts)
  return {
    signal,
    direction,
    counterpartAccountId: counterparts.length === 1 ? counterparts[0].id : null,
    oppositeLeg: null,
    ruleId: null,
  }
}
