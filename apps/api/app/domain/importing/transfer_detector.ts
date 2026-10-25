import { daysBetween } from '#domain/importing/iso_days'
import { findMatchingRule } from '#domain/importing/rule_matching'
import {
  type BankTransferSignal,
  bankTransferSignal,
  holderCounterparts,
  knownLinkedHolderKeys,
  linkedHolderKey,
  onlyInternalTransferCounterpart,
  sameInstitution,
} from '#domain/importing/linked_accounts'
import type {
  HouseholdAccount,
  LinkedHolderAccount,
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
  /** Accounts each linked holder's transfers were confirmed to. */
  linkedHolders?: readonly LinkedHolderAccount[]
  /**
   * Linked holder keys the household knows (`knownLinkedHolderKeys`); worked
   * out from `rules` and `linkedHolders` when absent.
   */
  holderKeys?: ReadonlySet<string>
}

/**
 * Opposite amount, another account, within two days; closest first. Legs
 * in `preferred` accounts (when any fits) win over the rest.
 */
function findOppositeLeg(
  row: TransferSubject,
  legs: readonly TransferLeg[],
  accountIds: readonly number[] | null,
  preferred: readonly number[] = []
): TransferLeg | null {
  const distance = (leg: TransferLeg) => Math.abs(daysBetween(row.date, leg.date))
  const fits = legs.filter(
    (leg) =>
      leg.accountId !== row.accountId &&
      (accountIds === null || accountIds.includes(leg.accountId)) &&
      leg.amountCents === -row.amountCents &&
      distance(leg) <= TRANSFER_LEG_WINDOW_DAYS
  )
  const rank = (leg: TransferLeg) => (preferred.includes(leg.accountId) ? 0 : 1)
  fits.sort((a, b) => rank(a) - rank(b) || distance(a) - distance(b))
  return fits[0] ?? null
}

/** The rule's account, when it names one other than the imported account. */
function transferTarget(rule: MerchantRule | null | undefined, row: TransferSubject) {
  const accountId = rule?.transferAccountId ?? null
  return accountId !== null && accountId !== row.accountId ? accountId : null
}

/**
 * Is the row one leg of a transfer between two accounts of the household?
 *
 * 1. The winning merchant rule decides first: a rule with
 *    `transferAccountId` makes it a transfer to/from that account (system
 *    rule: `Hnry ...` rows come from the Hnry account); a category rule
 *    makes it spending or income. On a row carrying the bank's transfer
 *    signal, a rule nobody typed (learned, or the bank defaults such as
 *    `Linked Acc Trns` -> savings) yields to the opposite leg when that
 *    sits in another account at the same bank and none sits in the rule's.
 *    When NAB's own memo names a holder the household knows, the holder
 *    decides instead of the bank's generic rules (step 2): its key is the
 *    row's merchant key, the most specific rule level.
 * 2. Otherwise NAB's signals: category `Internal transfers` or the
 *    `Linked Acc Trns` memo. The other account is, in order: the one
 *    holding the opposite amount within two days (in one of the holder's
 *    accounts first); the one account the linked holder's transfers were
 *    confirmed to (`linkedHolders`, plus the account of an older rule on the
 *    holder's key; the memo the person typed varies, the holder does not);
 *    when the holder is known in several accounts, none: the row waits for
 *    a person with them as `candidateAccountIds`; as a `guessed` proposal,
 *    the only other account at the same institution when it is a savings
 *    or transaction account of the same owner (`onlyInternalTransferCounterpart`).
 *    A rule on the holder's key naming a category calls its movements
 *    spending: nothing is proposed. When none decides, the review screen
 *    asks for it.
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
  const signal = bankTransferSignal(row)
  const byRule = (
    rule: MerchantRule,
    accountId: number,
    oppositeLeg = findOppositeLeg(row, context.legs, [accountId])
  ): TransferDetection => ({
    signal: 'rule',
    direction,
    counterpartAccountId: accountId,
    oppositeLeg,
    ruleId: rule.id,
    guessed: false,
  })
  const byBank = (
    bankSignal: BankTransferSignal,
    details: Partial<TransferDetection> = {}
  ): TransferDetection => ({
    signal: bankSignal,
    direction,
    counterpartAccountId: null,
    oppositeLeg: null,
    ruleId: null,
    guessed: false,
    ...details,
  })

  const holderKeys =
    context.holderKeys ?? knownLinkedHolderKeys(context.rules, context.linkedHolders ?? [])
  const holderKey = signal ? linkedHolderKey(row, holderKeys) : null
  const holder = holderKey === null ? null : holderCounterparts(holderKey, row.accountId, context)
  const holderKnown = holder !== null && (holder.rule !== null || holder.accountIds.length > 0)
  // NAB's own memo names the holder: the holder's key is the row's merchant key.
  const holderDecides = holderKnown && row.merchantFullKey === holderKey

  const rule = holderDecides ? null : (findMatchingRule(context.rules, row)?.rule ?? null)
  const ruleAccountId = transferTarget(rule, row)
  if (rule && ruleAccountId !== null) {
    const ruleLeg = findOppositeLeg(row, context.legs, [ruleAccountId])
    const elsewhere =
      signal && !ruleLeg && rule.createdBy !== 'user'
        ? findOppositeLeg(row, context.legs, null)
        : null
    if (elsewhere && sameInstitution(context.accounts, row.accountId, elsewhere.accountId)) {
      return byBank(signal!, { counterpartAccountId: elsewhere.accountId, oppositeLeg: elsewhere })
    }
    return byRule(rule, ruleAccountId, ruleLeg)
  }
  if (rule && rule.categoryId !== null) return null
  if (!signal) return null

  // A holder rule naming a category calls the holder's movements spending or
  // income: on NAB's own memo that is the rule's answer, else a person decides.
  const holderSpends = holder?.rule?.categoryId !== null && holder?.rule?.categoryId !== undefined
  if (holderSpends && holderDecides) return null

  const candidates = holder?.accountIds ?? []
  const oppositeLeg = findOppositeLeg(row, context.legs, null, candidates)
  if (oppositeLeg) {
    return byBank(signal, { counterpartAccountId: oppositeLeg.accountId, oppositeLeg })
  }
  if (holderSpends) return byBank(signal)

  if (candidates.length === 1) {
    const [accountId] = candidates
    const legacy = holder?.rule ?? null
    return legacy && transferTarget(legacy, row) === accountId
      ? byRule(legacy, accountId, null)
      : byBank(signal, { counterpartAccountId: accountId })
  }
  if (candidates.length > 1) return byBank(signal, { candidateAccountIds: candidates })

  const only = onlyInternalTransferCounterpart(row.accountId, context.accounts)
  return byBank(signal, { counterpartAccountId: only?.id ?? null, guessed: only !== null })
}
