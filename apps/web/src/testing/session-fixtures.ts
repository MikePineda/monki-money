import { TuyauHTTPError, TuyauNetworkError } from '@tuyau/core/client'
import type { Account, Household, Member, Membership, User } from '../app/core/api/api-types'
import type { Me } from '../app/core/auth/auth.api'

/** Synthetic wire objects for specs (never real people). */
export function aUser(overrides: Partial<User> = {}): User {
  return {
    id: 1,
    email: 'sam@example.test',
    fullName: 'Sam Rivera',
    locale: 'en',
    theme: 'system',
    emailVerifiedAt: '2026-10-01T00:00:00.000Z',
    currentHouseholdId: 10,
    createdAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  }
}

export function aHousehold(overrides: Partial<Household> = {}): Household {
  return {
    id: 10,
    name: 'Sam’s home',
    plan: 'free',
    status: 'active',
    currencyCode: 'AUD',
    locale: 'en',
    timezone: 'Australia/Brisbane',
    settings: {},
    deletionScheduledAt: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  }
}

export function aMembership(overrides: Partial<Membership> = {}): Membership {
  return {
    id: 100,
    householdId: 10,
    role: 'owner',
    displayName: null,
    color: null,
    joinedAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  }
}

export function aMember(overrides: Partial<Member> = {}): Member {
  return {
    id: 100,
    userId: 1,
    fullName: 'Sam Rivera',
    email: 'sam@example.test',
    role: 'owner',
    displayName: null,
    color: null,
    joinedAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  }
}

export function anAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: 1,
    name: 'NAB Everyday',
    institution: 'NAB',
    kind: 'transaction',
    ownerUserId: null,
    isJoint: true,
    currencyCode: 'AUD',
    externalAccountNumber: null,
    openingBalanceCents: 0,
    openingBalanceDate: null,
    isActive: true,
    sortOrder: 0,
    clearedBalanceCents: 0,
    availableBalanceCents: 0,
    cards: [],
    ...overrides,
  } as Account
}

export type SessionKind = 'owner' | 'member' | 'unverified' | 'noHousehold' | 'pendingDeletion'

/** A `GET /auth/me` body for the common session shapes. */
export function aMe(kind: SessionKind = 'owner', flags: string[] = []): Me {
  const entitlements = { llmCallsPerMonth: 200, maxAccounts: 6, maxMembers: 2, importsPerMonth: 30 }
  switch (kind) {
    case 'unverified':
      return {
        user: aUser({ emailVerifiedAt: null }),
        household: aHousehold(),
        membership: aMembership(),
        entitlements,
        flags,
      }
    case 'noHousehold':
      return {
        user: aUser({ currentHouseholdId: null }),
        household: null,
        membership: null,
        entitlements: null,
        flags,
      }
    case 'pendingDeletion':
      return {
        user: aUser(),
        household: aHousehold({
          status: 'pending_deletion',
          deletionScheduledAt: '2026-11-14T00:00:00.000Z',
        }),
        membership: aMembership(),
        entitlements,
        flags,
      }
    case 'member':
      return {
        user: aUser({ id: 2, email: 'alex@example.test', fullName: 'Alex Chen' }),
        household: aHousehold(),
        membership: aMembership({ id: 101, role: 'member' }),
        entitlements,
        flags,
      }
    default:
      return {
        user: aUser(),
        household: aHousehold(),
        membership: aMembership(),
        entitlements,
        flags,
      }
  }
}

/** The error Tuyau throws for a non-2xx response. */
export function httpError(
  status: number,
  body: unknown = {},
  headers: Record<string, string> = {}
): TuyauHTTPError {
  const kyError = {
    response: { status, headers: new Headers(headers) },
    request: { url: 'http://localhost/api/v1/thing', method: 'POST' },
    options: { prefixUrl: 'http://localhost' },
  }
  return new TuyauHTTPError(kyError as never, body)
}

export function networkError(): TuyauNetworkError {
  return new TuyauNetworkError(new TypeError('Failed to fetch'))
}

/** A 422 body with one message per field. */
export function validationError(fields: Record<string, string>): TuyauHTTPError {
  return httpError(422, {
    errors: Object.entries(fields).map(([field, message]) => ({ field, rule: 'x', message })),
  })
}
