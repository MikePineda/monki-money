import { Component, computed, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { Router, provideRouter } from '@angular/router'
import { RouterTestingHarness } from '@angular/router/testing'
import type { MemberRole } from '@monkimoney/shared'
import { i18nTesting, i18nTestingProviders } from '../../../../testing/i18n-testing'
import {
  aHousehold,
  aMember,
  aUser,
  httpError,
  type SessionKind,
} from '../../../../testing/session-fixtures'
import type { Household } from '../../../core/api/api-types'
import { AuthApi } from '../../../core/auth/auth.api'
import { SessionStore } from '../../../core/auth/session.store'
import { HouseholdApi } from '../../../core/household/household.api'
import { InstallService } from '../../../core/pwa/install.service'
import { UpdateService } from '../../../core/pwa/update.service'
import settingsEn from '../i18n/en.json'
import SettingsPage from './settings.page'

@Component({ template: '<p>elsewhere</p>' })
class Elsewhere {}

describe('SettingsPage', () => {
  let households: Record<string, ReturnType<typeof vi.fn>>
  let session: Record<string, unknown> & { load: ReturnType<typeof vi.fn> }

  async function open(kind: Extract<SessionKind, 'owner' | 'member'>) {
    const role = signal<MemberRole | null>(kind)
    const household = signal<Household | null>(aHousehold({ name: 'Sam’s home' }))
    households = {
      members: vi.fn(async () => [
        aMember(),
        aMember({ id: 101, userId: 2, fullName: 'Alex Chen', role: 'member' }),
      ]),
      invitations: vi.fn(async () => []),
      leave: vi.fn(async () => undefined),
    }
    session = {
      user: signal(kind === 'member' ? aUser({ id: 2, fullName: 'Alex Chen' }) : aUser()),
      household,
      role,
      entitlements: signal(null),
      hasFlag: () => false,
      homePath: computed(() => (household() ? '/month' : '/household/new')),
      // After leaving, the API answers `GET /auth/me` without a household.
      load: vi.fn(async () => {
        household.set(null)
        role.set(null)
      }),
      logout: vi.fn(async () => undefined),
    }
    TestBed.configureTestingModule({
      imports: [i18nTesting({ scopes: { 'settings/en': settingsEn } })],
      providers: [
        i18nTestingProviders(),
        provideRouter([
          { path: 'settings', component: SettingsPage },
          { path: '**', component: Elsewhere },
        ]),
        { provide: SessionStore, useValue: session },
        { provide: HouseholdApi, useValue: households },
        { provide: AuthApi, useValue: { health: async () => ({ version: '1.2.3' }) } },
        {
          provide: InstallService,
          useValue: {
            canPrompt: signal(false),
            installed: signal(false),
            showIosHint: signal(false),
          },
        },
        { provide: UpdateService, useValue: { checkNow: async () => 'latest' } },
      ],
    })
    const harness = await RouterTestingHarness.create('/settings')
    const root = harness.fixture.nativeElement as HTMLElement
    await vi.waitFor(() =>
      expect(root.querySelector('[data-testid="settings.members"]')?.textContent).toContain(
        'Alex Chen'
      )
    )
    const sheet = () => document.querySelector<HTMLElement>('app-leave-household-sheet')
    return { harness, root, sheet }
  }

  it('test_a_member_can_leave_and_sees_no_owner_controls', async () => {
    const { root } = await open('member')

    expect(root.querySelector('[data-testid="settings.leave"]')?.textContent).toContain(
      'Leave household'
    )
    expect(root.querySelector('[data-testid="settings.delete"]')).toBeNull()
    expect(root.querySelector('[data-testid="settings.export"]')).toBeNull()
  })

  it('test_an_owner_sees_export_and_delete_but_never_leave', async () => {
    const { root } = await open('owner')

    expect(root.querySelector('[data-testid="settings.delete"]')).not.toBeNull()
    expect(root.querySelector('[data-testid="settings.leave"]')).toBeNull()
  })

  it('test_the_confirmation_explains_that_entries_stay_with_the_household', async () => {
    const { root, sheet } = await open('member')

    root.querySelector<HTMLButtonElement>('[data-testid="settings.leave"]')?.click()

    await vi.waitFor(() => expect(sheet()?.textContent).toContain('Leave Sam’s home?'))
    expect(sheet()?.textContent).toContain('Everything you added stays with Sam’s home')
    expect(households['leave']).not.toHaveBeenCalled()
  })

  it('test_confirming_leaves_refreshes_the_session_and_opens_create_a_household', async () => {
    const { root, sheet } = await open('member')
    root.querySelector<HTMLButtonElement>('[data-testid="settings.leave"]')?.click()
    await vi.waitFor(() => expect(sheet()).not.toBeNull())

    sheet()?.querySelector<HTMLButtonElement>('[data-testid="leave.confirm"]')?.click()

    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/household/new'))
    expect(households['leave']).toHaveBeenCalledTimes(1)
    expect(session.load).toHaveBeenCalled()
    await vi.waitFor(() => expect(sheet()).toBeNull())
  })

  it('test_a_refused_leave_keeps_the_sheet_open_with_the_reason', async () => {
    const { root, sheet } = await open('member')
    households['leave']?.mockRejectedValueOnce(
      httpError(422, { message: 'Owners cannot leave', code: 'E_OWNER_CANNOT_LEAVE' })
    )
    root.querySelector<HTMLButtonElement>('[data-testid="settings.leave"]')?.click()
    await vi.waitFor(() => expect(sheet()).not.toBeNull())

    sheet()?.querySelector<HTMLButtonElement>('[data-testid="leave.confirm"]')?.click()

    await vi.waitFor(() =>
      expect(sheet()?.querySelector('[role="alert"]')?.textContent).toContain(
        'The owner cannot leave the household.'
      )
    )
    expect(session.load).not.toHaveBeenCalled()
    expect(TestBed.inject(Router).url).toBe('/settings')
  })
})
