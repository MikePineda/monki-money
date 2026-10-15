import type { Entitlements } from '@monkimoney/shared'
import {
  canAddAccount,
  canInvite,
  canManageHousehold,
  hasFlag,
  homePath,
  safeReturnUrl,
  type SessionSnapshot,
} from './entitlements'

const signedIn: SessionSnapshot = {
  authenticated: true,
  verified: true,
  hasHousehold: true,
  pendingDeletion: false,
  role: 'owner',
  flags: [],
}

const free: Entitlements = {
  llmCallsPerMonth: 200,
  maxAccounts: 6,
  maxMembers: 2,
  importsPerMonth: 30,
}

describe('entitlements', () => {
  describe('homePath', () => {
    it('test_a_guest_belongs_on_login', () => {
      expect(homePath({ ...signedIn, authenticated: false })).toBe('/login')
    })

    it('test_an_unverified_user_belongs_on_verify_email', () => {
      expect(homePath({ ...signedIn, verified: false })).toBe('/verify-email')
    })

    it('test_a_user_without_household_belongs_on_no_household', () => {
      expect(homePath({ ...signedIn, hasHousehold: false })).toBe('/household/new')
    })

    it('test_a_household_pending_deletion_belongs_on_household_deleted', () => {
      expect(homePath({ ...signedIn, pendingDeletion: true })).toBe('/household-deleted')
    })

    it('test_a_ready_member_belongs_on_month', () => {
      expect(homePath(signedIn)).toBe('/month')
      expect(homePath({ ...signedIn, role: 'member' })).toBe('/month')
    })
  })

  it('test_flags_come_from_the_api_list_only', () => {
    expect(hasFlag(['billing'], 'billing')).toBe(true)
    expect(hasFlag([], 'billing')).toBe(false)
    expect(hasFlag(['billing-beta'], 'billing')).toBe(false)
  })

  it('test_only_the_owner_manages_the_household', () => {
    expect(canManageHousehold('owner')).toBe(true)
    expect(canManageHousehold('member')).toBe(false)
    expect(canManageHousehold(null)).toBe(false)
  })

  it('test_the_owner_can_invite_while_the_plan_has_member_seats_left', () => {
    expect(canInvite('owner', 1, free)).toBe(true)
    expect(canInvite('owner', 2, free)).toBe(false)
    expect(canInvite('member', 1, free)).toBe(false)
    expect(canInvite('owner', 5, null)).toBe(true)
  })

  it('test_accounts_can_be_added_until_the_plan_limit', () => {
    expect(canAddAccount(5, free)).toBe(true)
    expect(canAddAccount(6, free)).toBe(false)
    expect(canAddAccount(60, null)).toBe(true)
  })

  describe('safeReturnUrl', () => {
    it('test_keeps_in_app_paths', () => {
      expect(safeReturnUrl('/settings/profile')).toBe('/settings/profile')
      expect(safeReturnUrl('/transactions?month=2026-10')).toBe('/transactions?month=2026-10')
    })

    it('test_drops_external_or_protocol_relative_urls', () => {
      expect(safeReturnUrl('https://evil.example')).toBeNull()
      expect(safeReturnUrl('//evil.example')).toBeNull()
      expect(safeReturnUrl('/\\evil.example')).toBeNull()
      expect(safeReturnUrl('settings')).toBeNull()
      expect(safeReturnUrl(null)).toBeNull()
    })

    it('test_drops_auth_screens_so_login_never_loops', () => {
      expect(safeReturnUrl('/login')).toBeNull()
      expect(safeReturnUrl('/login?returnUrl=%2Fmonth')).toBeNull()
      expect(safeReturnUrl('/signup')).toBeNull()
    })
  })
})
