import type { AccountKind } from '@monkimoney/shared'
import { linkedAccountHolder, merchantFullKey } from '#domain/importing/normalize'
import type {
  HouseholdAccount,
  LinkedHolderAccount,
  MerchantRule,
  StagedRow,
  TransferDetection,
} from '#domain/importing/types'

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

/** Every linked holder key starts with the merchant key of NAB's own memo. */
export const LINKED_HOLDER_KEY_PREFIX = 'linked acc trns '

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
 * Key of the linked holder an internal transfer names: the merchant key
 * NAB's own memo gives that holder (`Linked Acc Trns SMITH JO` -> `linked
 * acc trns smith jo`), whatever memo the person typed instead. It keys the
 * accounts the holder's transfers were confirmed to (`linked_holder_accounts`)
 * and the `merchant` rules on it (a category rule: the holder's movements
 * are spending; an older transfer rule: one more known account). Only with
 * the bank's signal, so a payment to someone sharing the name never has
 * one. `knownKeys` (keys the household has seen) let a memo typed in
 * capitals end at the holder (`BALI SMITH JO` -> `smith jo`). Null when the
 * row has no bank signal, names no holder, the holder leaves nothing in a
 * merchant key (non-Latin letters only: every such holder would share
 * `linked acc trns`), or the key would not fit a rule pattern.
 */
export function linkedHolderKey(
  row: LinkedTransferSubject,
  knownKeys: Iterable<string> = []
): string | null {
  if (bankTransferSignal(row) === null) return null
  const holder = linkedAccountHolder(row.details, holderNamesOf(knownKeys))
  if (holder === null) return null
  if (merchantFullKey({ nabMerchant: null, description: holder }) === '') return null
  const key = merchantFullKey({
    nabMerchant: null,
    description: `${LINKED_ACCOUNT_MEMO_TEXT} ${holder}`,
  })
  return key.length > MAX_PATTERN_LENGTH ? null : key
}

/** The holder part of linked holder keys (`linked acc trns smith jo` -> `smith jo`). */
function holderNamesOf(keys: Iterable<string>): string[] {
  const names: string[] = []
  for (const key of keys) {
    if (key.startsWith(LINKED_HOLDER_KEY_PREFIX))
      names.push(key.slice(LINKED_HOLDER_KEY_PREFIX.length))
  }
  return names
}

/** A `merchant` rule on a linked holder key (learned from, or typed for, that holder). */
export function isLinkedHolderRule(rule: MerchantRule): boolean {
  return rule.matchType === 'merchant' && rule.pattern.startsWith(LINKED_HOLDER_KEY_PREFIX)
}

/**
 * Every linked holder key the household knows: the accounts learned per
 * holder, the rules on holder keys, and the holders NAB's own memo names in
 * `rows` (the batch being imported).
 */
export function knownLinkedHolderKeys(
  rules: readonly MerchantRule[],
  linkedHolders: readonly LinkedHolderAccount[],
  rows: readonly LinkedTransferSubject[] = []
): Set<string> {
  const keys = new Set<string>(linkedHolders.map((entry) => entry.holderKey))
  for (const rule of rules) if (isLinkedHolderRule(rule)) keys.add(rule.pattern)
  for (const row of rows) {
    if (!LINKED_ACCOUNT_MEMO.test(row.details)) continue
    const key = linkedHolderKey(row)
    if (key !== null) keys.add(key)
  }
  return keys
}

/**
 * What the household knows about where one holder's transfers go: its
 * rule (null when none) and the accounts it was confirmed to, plus an
 * older rule's account, that `accountId` may move money to (the importing
 * account itself and closed accounts never count), ascending.
 */
export function holderCounterparts(
  holderKey: string,
  accountId: number,
  context: {
    rules: readonly MerchantRule[]
    linkedHolders?: readonly LinkedHolderAccount[]
    accounts: readonly HouseholdAccount[]
  }
): { rule: MerchantRule | null; accountIds: number[] } {
  const rule =
    context.rules.find(
      (candidate) => candidate.matchType === 'merchant' && candidate.pattern === holderKey
    ) ?? null
  const ids = new Set(
    (context.linkedHolders ?? [])
      .filter((entry) => entry.holderKey === holderKey)
      .map((entry) => entry.accountId)
  )
  if (rule?.transferAccountId !== null && rule?.transferAccountId !== undefined) {
    ids.add(rule.transferAccountId)
  }
  const usable = (id: number) =>
    id !== accountId && context.accounts.find((account) => account.id === id)?.isActive !== false
  return { rule, accountIds: [...ids].filter(usable).sort((a, b) => a - b) }
}

/** The household account `accountId` belongs to the same bank as `of` (both known). */
export function sameInstitution(
  accounts: readonly HouseholdAccount[],
  of: number,
  accountId: number
): boolean {
  const institutionOf = (id: number) =>
    accounts
      .find((account) => account.id === id)
      ?.institution?.trim()
      .toLowerCase() ?? ''
  const own = institutionOf(of)
  return own !== '' && institutionOf(accountId) === own
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
