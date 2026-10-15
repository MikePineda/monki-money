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
 * A domain error that carries extra fields for the client (rendered next
 * to `message` and `code`, e.g. the account numbers to map). Only plain,
 * non-sensitive values go in `details`.
 */
function detailedError<Details extends Record<string, unknown>>(
  code: string,
  status: number,
  message: string
) {
  return class extends Exception {
    static override status = status
    static override code = code
    static override message = message

    constructor(readonly details: Details) {
      super()
    }
  }
}

/** The upload has `Account Number` values no account of the household carries. */
export const ImportUnknownAccounts = detailedError<{ accountNumbers: string[] }>(
  'E_IMPORT_UNKNOWN_ACCOUNTS',
  422,
  'Map these account numbers to an account first'
)

/** The account already has a batch waiting for review (confirm or cancel it first). */
export const ImportBatchOpen = detailedError<{ batchId: number; accountId: number }>(
  'E_IMPORT_BATCH_OPEN',
  409,
  'This account has an import waiting for review'
)

/** Confirm needs a decision on these rows (possible matches, unknown transfer accounts). */
export const ImportRowsUndecided = detailedError<{ rowIds: number[] }>(
  'E_IMPORT_ROWS_UNDECIDED',
  422,
  'Some rows still need a decision'
)

/** The batch (or row) was already confirmed or cancelled. */
export const ImportBatchClosed = domainError(
  'E_IMPORT_BATCH_CLOSED',
  409,
  'This import is already closed'
)

/** A classify run of the batch is still going (or crashed less than 10 minutes ago). */
export const ImportClassifyRunning = domainError(
  'E_IMPORT_CLASSIFY_RUNNING',
  409,
  'This import is already being classified'
)

/** The household's plan does not allow another import this month. */
export const ImportLimitReached = domainError(
  'E_IMPORT_LIMIT_REACHED',
  402,
  'Plan import limit reached'
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
