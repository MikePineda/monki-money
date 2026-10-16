import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed'
import { Component, computed, signal, type WritableSignal } from '@angular/core'
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
  validationError,
  type SessionKind,
} from '../../../../testing/session-fixtures'
import type { Household } from '../../../core/api/api-types'
import { AuthApi } from '../../../core/auth/auth.api'
import { SessionStore } from '../../../core/auth/session.store'
import { HouseholdApi } from '../../../core/household/household.api'
import { OutboxStore } from '../../../core/outbox/outbox.store'
import { InstallService } from '../../../core/pwa/install.service'
import { UpdateService } from '../../../core/pwa/update.service'
import { enqueue, type OutboxEntry, type OutboxItem } from '../../../domain/outbox'
import { BottomSheetService } from '../../../shared/ui/bottom-sheet/bottom-sheet.service'
import { ToastStore } from '../../../core/ui/toast.store'
import { ButtonHarness } from '../../../shared/ui/button/button.harness'
import { TextFieldHarness } from '../../../shared/ui/text-field/text-field.harness'
import SettingsPage from './settings.page'

@Component({ template: '<p>elsewhere</p>' })
class Elsewhere {}

const QUEUED: OutboxItem = {
  kind: 'transaction',
  payload: {
    clientId: '00000000-0000-4000-8000-000000000201',
    kind: 'expense',
    accountId: 1,
    date: '2026-10-16',
    amountCents: 4250,
    categoryId: null,
    payee: null,
    description: null,
    paidByUserId: 1,
    isPrivate: false,
    tags: [],
  },
}

describe('SettingsPage', () => {
  let households: Record<string, ReturnType<typeof vi.fn>>
  let session: Record<string, unknown> & { load: ReturnType<typeof vi.fn> }
  let outbox: { entries: WritableSignal<OutboxEntry[]>; isSyncing: WritableSignal<boolean> }

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
      // The answer of a handover: the roles swapped.
      transferOwnership: vi.fn(async () => [
        aMember({ role: 'member' }),
        aMember({ id: 101, userId: 2, fullName: 'Alex Chen', role: 'owner' }),
      ]),
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
    outbox = { entries: signal<OutboxEntry[]>([]), isSyncing: signal(false) }
    TestBed.configureTestingModule({
      imports: [i18nTesting()],
      providers: [
        i18nTestingProviders(),
        provideRouter([
          { path: 'settings', component: SettingsPage },
          { path: '**', component: Elsewhere },
        ]),
        { provide: SessionStore, useValue: session },
        { provide: OutboxStore, useValue: outbox },
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
    return { harness, root, sheet, role }
  }

  /** Opens "Make owner" on the partner's row and finds the sheet's controls. */
  async function openOwnershipSheet(harness: RouterTestingHarness, root: HTMLElement) {
    root.querySelector<HTMLButtonElement>('[data-testid="settings.makeOwner"]')?.click()
    const sheet = () => document.querySelector<HTMLElement>('app-transfer-ownership-sheet')
    await vi.waitFor(() => expect(sheet()).not.toBeNull())
    const loader = TestbedHarnessEnvironment.documentRootLoader(harness.fixture)
    const password = await loader.getHarness(TextFieldHarness.with({ label: 'Your password' }))
    const confirm = await loader.getHarness(
      ButtonHarness.with({ text: 'Make Alex Chen the owner' })
    )
    return { sheet, password, confirm }
  }

  it('test_a_member_can_leave_and_sees_no_owner_controls', async () => {
    const { root } = await open('member')

    expect(root.querySelector('[data-testid="settings.leave"]')?.textContent).toContain(
      'Leave household'
    )
    expect(root.querySelector('[data-testid="settings.delete"]')).toBeNull()
    expect(root.querySelector('[data-testid="settings.export"]')).toBeNull()
  })

  it('test_the_menu_offers_the_receipt_scanner_next_to_the_bank_import', async () => {
    const { root } = await open('member')

    const scan = root.querySelector('[data-testid="settings.scan"]')
    expect(scan?.getAttribute('href')).toBe('/scan')
    expect(scan?.textContent).toContain('Scan a receipt')
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

  it('test_logout_with_nothing_queued_logs_out', async () => {
    const { root } = await open('member')

    root.querySelector<HTMLButtonElement>('[data-testid="settings.logout"]')?.click()

    await vi.waitFor(() => expect(session['logout']).toHaveBeenCalledTimes(1))
  })

  it('test_logout_warns_while_entries_are_queued', async () => {
    const { root } = await open('member')
    outbox.entries.set(enqueue([], QUEUED, new Date('2026-10-16T09:30:00.000Z')))

    root.querySelector<HTMLButtonElement>('[data-testid="settings.logout"]')?.click()

    await vi.waitFor(() =>
      expect(document.querySelector('[data-testid="outbox.logout.body"]')?.textContent).toContain(
        '1 movement is waiting to sync and will be lost if you log out.'
      )
    )
    expect(session['logout']).not.toHaveBeenCalled()
    TestBed.inject(BottomSheetService).closeAll()
  })

  it('test_the_owner_can_make_the_partner_owner_but_not_themselves', async () => {
    const { root } = await open('owner')

    const buttons = root.querySelectorAll('[data-testid="settings.makeOwner"]')
    expect(buttons).toHaveLength(1)
    expect(buttons[0]?.closest('li')?.textContent).toContain('Alex Chen')
    // The accessible name keeps the visible label and says who.
    expect(buttons[0]?.textContent?.replace(/\s+/g, ' ').trim()).toBe('Make owner: Alex Chen')
  })

  it('test_a_member_cannot_make_anyone_owner', async () => {
    const { root } = await open('member')

    expect(root.querySelector('[data-testid="settings.makeOwner"]')).toBeNull()
  })

  it('test_making_the_partner_owner_needs_the_password_then_refreshes_the_session', async () => {
    const { harness, root, role } = await open('owner')
    // `GET /auth/me` after the handover: the caller is a member now.
    session.load.mockImplementationOnce(async () => role.set('member'))
    const { sheet, password, confirm } = await openOwnershipSheet(harness, root)

    expect(sheet()?.textContent).toContain('Make Alex Chen the owner?')
    expect(sheet()?.textContent).toContain('You stay as a member')
    expect(await confirm.isDisabled()).toBe(true)
    await password.setValue('temporary-pass-1')
    await confirm.click()

    await vi.waitFor(() => expect(sheet()).toBeNull())
    expect(households['transferOwnership']).toHaveBeenCalledWith(2, 'temporary-pass-1')
    expect(session.load).toHaveBeenCalledTimes(1)
    expect(TestBed.inject(ToastStore).current()?.messageKey).toBe(
      'settings.household.ownerSheet.done'
    )
    // Now a member: no owner controls, and leaving is possible.
    await vi.waitFor(() =>
      expect(root.querySelector('[data-testid="settings.leave"]')).not.toBeNull()
    )
    expect(root.querySelector('[data-testid="settings.makeOwner"]')).toBeNull()
    expect(root.querySelector('[data-testid="settings.delete"]')).toBeNull()
    const rows = [...root.querySelectorAll('[data-testid="settings.members"] li')].map((row) =>
      row.textContent?.replace(/\s+/g, ' ').trim()
    )
    expect(rows[0]).toContain('Member')
    expect(rows[1]).toContain('Alex Chen')
    expect(rows[1]).toContain('Owner')
  })

  it('test_a_wrong_password_keeps_the_ownership_sheet_open_with_the_reason', async () => {
    const { harness, root } = await open('owner')
    households['transferOwnership']?.mockRejectedValueOnce(
      validationError({ password: 'The password is incorrect' })
    )
    const { sheet, password, confirm } = await openOwnershipSheet(harness, root)

    await password.setValue('wrong-password')
    await confirm.click()

    await vi.waitFor(async () =>
      expect(await password.getMessage()).toBe('The password is incorrect')
    )
    expect(sheet()).not.toBeNull()
    expect(session.load).not.toHaveBeenCalled()
    expect(root.querySelector('[data-testid="settings.makeOwner"]')).not.toBeNull()
  })

  it('test_a_handover_refused_for_another_field_is_not_blamed_on_the_password', async () => {
    const { harness, root } = await open('owner')
    households['transferOwnership']?.mockRejectedValueOnce(
      validationError({ userId: 'Choose another member of the household' })
    )
    const { sheet, password, confirm } = await openOwnershipSheet(harness, root)

    await password.setValue('temporary-pass-1')
    await confirm.click()

    await vi.waitFor(() =>
      expect(sheet()?.querySelector('[role="alert"]')?.textContent).toContain(
        'Choose another member of the household'
      )
    )
    expect(await password.getMessage()).toBeNull()
  })

  it('test_a_refused_handover_shows_the_reason_in_the_sheet', async () => {
    const { harness, root } = await open('owner')
    households['transferOwnership']?.mockRejectedValueOnce(
      httpError(404, { message: 'Not found', code: 'E_ROW_NOT_FOUND' })
    )
    const { sheet, password, confirm } = await openOwnershipSheet(harness, root)

    await password.setValue('temporary-pass-1')
    await confirm.click()

    await vi.waitFor(() => expect(sheet()?.querySelector('[role="alert"]')).not.toBeNull())
    expect(session.load).not.toHaveBeenCalled()
  })
})
