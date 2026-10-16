import type { AccountKind } from '@monkimoney/shared'
import { linkedAccountHolder, merchantFullKey } from '#domain/importing/normalize'
import type { HouseholdAccount, StagedRow, TransferDetection } from '#domain/importing/types'

/**
 * Movements between the customer's own accounts at one bank, as NAB writes
 * them: category `Internal transfers`, details `ONLINE <ref> Linked Acc
 * Trns <HOLDER>`, or `ONLINE <ref> <memo> <HOLDER>` when the person typed a
 * memo in the bank app (NAB then drops `Linked Acc Trns`).
 */

/** NAB's category for movements between the customer's own NAB accounts. */
const INTERNAL_TRANSFER_CATEGORY = 'internal transfers'

/** NAB's memo on a transfer to a linked account when the person typed none. */
const LINKED_ACCOUNT_MEMO_TEXT = 'Linked Acc Trns'
const LINKED_ACCOUNT_MEMO = /\bLinked Acc Trns\b/i

/** `merchant_rules.pattern` is a varchar(255). */
const MAX_PATTERN_LENGTH = 255

/** Account kinds an internal transfer may be guessed to land in. */
const GUESSABLE_KINDS: ReadonlySet<AccountKind> = new Set(['savings', 'transaction'])

export type BankTransferSignal = Exclude<TransferDetection['signal'], 'rule'>

export type LinkedTransferSubject = Pick<StagedRow, 'details' | 'nabCategory'>

/** The bank's own word that a row moves money between the household's accounts, if any. */
export function bankTransferSignal(row: LinkedTransferSubject): BankTransferSignal | null {
  if (row.nabCategory?.trim().toLowerCase() === INTERNAL_TRANSFER_CATEGORY) return 'bank_category'
  if (LINKED_ACCOUNT_MEMO.test(row.details)) return 'linked_account_memo'
  return null
}

/**
 * Pattern of the `merchant` rule that sends one linked holder's transfers
 * to one account: the merchant key NAB's own memo gives that holder
 * (`Linked Acc Trns SMITH JO` -> `linked acc trns smith jo`). Rows carrying
 * that memo match the rule like any merchant rule; rows whose memo the
 * person replaced reach it through the transfer detector, and only with the
 * bank's signal, so a payment to someone sharing the name never does. Null
 * when the row has no bank signal, names no holder, or the key would not
 * fit a rule pattern.
 */
export function linkedHolderKey(row: LinkedTransferSubject): string | null {
  if (bankTransferSignal(row) === null) return null
  const holder = linkedAccountHolder(row.details)
  if (holder === null) return null
  const key = merchantFullKey({
    nabMerchant: null,
    description: `${LINKED_ACCOUNT_MEMO_TEXT} ${holder}`,
  })
  return key === '' || key.length > MAX_PATTERN_LENGTH ? null : key
}

/**
 * The account an internal transfer of `accountId` may be guessed to come
 * from or go to, when nothing better says it: the only other active
 * account at the same institution, of any kind, and only when that one is
 * a savings or transaction account the importing account's owner may move
 * money to (joint, or theirs; a joint account never guesses a member's
 * personal one). Null otherwise, and when the institution is unknown. A
 * card or loan at the same bank makes every guess unsafe: a card repayment
 * must not land in savings.
 */
export function onlyInternalTransferCounterpart(
  accountId: number,
  accounts: readonly HouseholdAccount[]
): HouseholdAccount | null {
  const institutionOf = (account: HouseholdAccount) =>
    account.institution?.trim().toLowerCase() ?? ''
  const own = accounts.find((account) => account.id === accountId)
  const institution = own ? institutionOf(own) : ''
  if (!own || institution === '') return null

  const others = accounts.filter(
    (account) =>
      account.id !== accountId && account.isActive && institutionOf(account) === institution
  )
  if (others.length !== 1) return null
  const [other] = others
  const sameOwner =
    other.ownerUserId === null ||
    (own.ownerUserId !== null && other.ownerUserId === own.ownerUserId)
  return GUESSABLE_KINDS.has(other.kind) && sameOwner ? other : null
}
