import type { AccountKind } from '@monkimoney/shared'

export interface CreateAccountInput {
  name: string
  kind: AccountKind
  institution?: string | null
  /** null or omitted = joint account. Must be a member of the household. */
  ownerUserId?: number | null
  currencyCode?: string
  externalAccountNumber?: string | null
  openingBalanceCents?: number
  /** 'YYYY-MM-DD' */
  openingBalanceDate?: string | null
  isActive?: boolean
}

export type UpdateAccountInput = Partial<CreateAccountInput>

export interface AddCardInput {
  cardSuffix: string
  /** Who uses the card (member of the household); null = unassigned. */
  userId?: number | null
  label?: string | null
}

export interface AccountBalance {
  clearedBalanceCents: number
  availableBalanceCents: number
}
