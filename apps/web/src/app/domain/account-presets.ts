import presets from './account-presets.json'

/**
 * Starting accounts offered by onboarding, as data (account-presets.json):
 * tapping a preset creates an account, nothing is ever created implicitly.
 * Pure: no Angular. A preset without a `name` (cash) is named in the
 * user's language when it is created.
 */
export type AccountKind = 'transaction' | 'savings' | 'wallet' | 'cash' | 'other'
export type OwnerChoice = 'you' | 'partner' | 'joint'

export interface AccountPreset {
  id: string
  name: string | null
  institution: string | null
  kind: AccountKind
  /** Who owns it unless changed: the person setting up, or both. */
  owner: 'you' | 'joint'
}

export const ACCOUNT_PRESETS: readonly AccountPreset[] = presets as AccountPreset[]

function normalize(name: string): string {
  return name.trim().toLocaleLowerCase()
}

/** Whether an existing account is this preset (so a resumed wizard shows it chosen). */
export function matchesPreset(
  account: { name: string; kind: string },
  preset: AccountPreset
): boolean {
  if (preset.name === null) {
    return account.kind === preset.kind
  }
  return normalize(account.name) === normalize(preset.name)
}

/** The owner as the UI words it: you, your partner, or both (joint). */
export function ownerChoiceOf(ownerUserId: number | null, youId: number): OwnerChoice {
  if (ownerUserId === null) {
    return 'joint'
  }
  return ownerUserId === youId ? 'you' : 'partner'
}

/** The `ownerUserId` to send for a choice (null = joint). */
export function ownerUserIdFor(
  choice: OwnerChoice,
  youId: number,
  partnerId: number | null
): number | null {
  switch (choice) {
    case 'you':
      return youId
    case 'partner':
      return partnerId
    default:
      return null
  }
}
