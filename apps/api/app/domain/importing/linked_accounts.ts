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

/** Account kinds money moves between when the bank calls it an internal transfer. */
const COUNTERPART_KINDS: ReadonlySet<AccountKind> = new Set(['savings', 'transaction'])

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
 * when the row has no bank signal or names no holder.
 */
export function linkedHolderKey(row: LinkedTransferSubject): string | null {
  if (bankTransferSignal(row) === null) return null
  const holder = linkedAccountHolder(row.details)
  if (holder === null) return null
  const key = merchantFullKey({
    nabMerchant: null,
    description: `${LINKED_ACCOUNT_MEMO_TEXT} ${holder}`,
  })
  return key === '' ? null : key
}

/**
 * Accounts an internal transfer of `accountId` may come from or go to:
 * active savings or transaction accounts at the same institution, other
 * than the account itself. None when the account's institution is unknown.
 */
export function internalTransferCounterparts(
  accountId: number,
  accounts: readonly HouseholdAccount[]
): HouseholdAccount[] {
  const institutionOf = (account: HouseholdAccount) =>
    account.institution?.trim().toLowerCase() ?? ''
  const own = accounts.find((account) => account.id === accountId)
  const institution = own ? institutionOf(own) : ''
  if (institution === '') return []

  return accounts.filter(
    (account) =>
      account.id !== accountId &&
      account.isActive &&
      COUNTERPART_KINDS.has(account.kind) &&
      institutionOf(account) === institution
  )
}
