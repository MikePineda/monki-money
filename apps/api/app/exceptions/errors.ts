import { Exception } from '@adonisjs/core/exceptions'

/**
 * Domain errors raised by services. None of them renders itself: the
 * global handler (app/exceptions/handler.ts) answers `{ message, code }`
 * with the message translated from `resources/lang/<locale>/errors.json`
 * (key = code). Services never see the HTTP context.
 */
function domainError(code: string, status: number, message: string) {
  return class extends Exception {
    static override status = status
    static override code = code
    static override message = message
  }
}

/** Sign-up attempted while REGISTRATION_OPEN=false. */
export const RegistrationClosed = domainError('E_REGISTRATION_CLOSED', 403, 'Sign-up is closed')

/** The user must verify their email before touching household resources. */
export const EmailNotVerified = domainError('E_EMAIL_NOT_VERIFIED', 403, 'Email not verified')

/** The user has no current household (or is no longer a member of it). */
export const NoHousehold = domainError('E_NO_HOUSEHOLD', 403, 'No household')

/** The household was suspended (billing, abuse): nothing is reachable. */
export const HouseholdSuspended = domainError('E_HOUSEHOLD_SUSPENDED', 403, 'Household suspended')

/** The household's plan does not allow another member. */
export const MemberLimitReached = domainError(
  'E_MEMBER_LIMIT_REACHED',
  402,
  'Plan member limit reached'
)

/** The household's plan does not allow another account. */
export const AccountLimitReached = domainError(
  'E_ACCOUNT_LIMIT_REACHED',
  402,
  'Plan account limit reached'
)

/** The household is scheduled for deletion; only restore is allowed. */
export const HouseholdPendingDeletion = domainError(
  'E_HOUSEHOLD_PENDING_DELETION',
  403,
  'Household pending deletion'
)

export const HouseholdNotPendingDeletion = domainError(
  'E_HOUSEHOLD_NOT_PENDING_DELETION',
  409,
  'Household is not pending deletion'
)

export const RestoreWindowExpired = domainError(
  'E_RESTORE_WINDOW_EXPIRED',
  410,
  'Restore window expired'
)

/** A signed/encrypted token (verify email, reset password) is invalid or expired. */
export const InvalidToken = domainError('E_INVALID_TOKEN', 400, 'Invalid or expired token')

/** The invitation expired or was already accepted. */
export const InvitationExpired = domainError('E_INVITATION_EXPIRED', 410, 'Invitation expired')

/** MVP rule: one user belongs to one household. */
export const AlreadyInHousehold = domainError(
  'E_ALREADY_IN_HOUSEHOLD',
  409,
  'User already belongs to a household'
)

/** The account still has transactions. */
export const AccountInUse = domainError('E_ACCOUNT_IN_USE', 409, 'Account has transactions')

/** The category is referenced and no replacement was given. */
export const CategoryInUse = domainError('E_CATEGORY_IN_USE', 409, 'Category is in use')

/** The group still has categories. */
export const GroupNotEmpty = domainError('E_GROUP_NOT_EMPTY', 409, 'Group is not empty')

/** Transfer legs are edited (or deleted) through their transfer, never alone. */
export const TransferLegReadOnly = domainError(
  'E_TRANSFER_LEG',
  409,
  'Edit this movement from its transfer'
)

/**
 * A private transaction of the partner: its amount counts in the household
 * totals but only its owner (the payer, or the creator of a joint one) may
 * see or change its details.
 */
export const PrivateTransaction = domainError(
  'E_TRANSACTION_PRIVATE',
  403,
  'This transaction is private'
)
