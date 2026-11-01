import { Component, computed, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { Router, provideRouter } from '@angular/router'
import { RouterTestingHarness } from '@angular/router/testing'
import type { MemberRole } from '@monkimoney/shared'
import { i18nTesting, i18nTestingProviders } from '../../../../testing/i18n-testing'
import { aHousehold, httpError, networkError } from '../../../../testing/session-fixtures'
import type { Household } from '../../../core/api/api-types'
import { SessionStore } from '../../../core/auth/session.store'
import { HouseholdApi } from '../../../core/household/household.api'
import { BottomSheetService } from '../../../shared/ui/bottom-sheet/bottom-sheet.service'
import HouseholdDeletedPage from './household-deleted.page'

@Component({ template: '<p>create or join</p>' })
class CreateOrJoin {}

describe('HouseholdDeletedPage', () => {
  let households: { leave: ReturnType<typeof vi.fn>; restore: ReturnType<typeof vi.fn> }
  let session: Record<string, unknown> & { load: ReturnType<typeof vi.fn> }

  async function open(role: MemberRole) {
    const household = signal<Household | null>(
      aHousehold({
        name: 'Sam’s home',
        status: 'pending_deletion',
        deletionScheduledAt: '2026-11-30T00:00:00.000Z',
      })
    )
    const currentRole = signal<MemberRole | null>(role)
    households = { leave: vi.fn(async () => undefined), restore: vi.fn(async () => undefined) }
    session = {
      household,
      role: currentRole,
      homePath: computed(() => (household() ? '/household-deleted' : '/household/new')),
      // After leaving, `GET /auth/me` answers without a household.
      load: vi.fn(async () => {
        household.set(null)
        currentRole.set(null)
      }),
      logout: vi.fn(async () => true),
    }
    TestBed.configureTestingModule({
      imports: [i18nTesting()],
      providers: [
        i18nTestingProviders(),
        provideRouter([
          { path: 'household-deleted', component: HouseholdDeletedPage },
          { path: 'household/new', component: CreateOrJoin },
        ]),
        { provide: SessionStore, useValue: session },
        { provide: HouseholdApi, useValue: households },
      ],
    })
    const harness = await RouterTestingHarness.create('/household-deleted')
    const root = harness.fixture.nativeElement as HTMLElement
    await vi.waitFor(() =>
      expect(root.querySelector('[data-testid="deleted.state"]')?.textContent).toContain(
        'Sam’s home is scheduled for deletion'
      )
    )
    return { harness, root }
  }

  const button = (root: ParentNode, id: string) =>
    root.querySelector<HTMLButtonElement>(`[data-testid="${id}"]`)
  const sheetBody = () => document.querySelector('[data-testid="confirm.body"]')

  async function confirmLeaving(root: HTMLElement) {
    button(root, 'deleted.leave')?.click()
    await vi.waitFor(() => expect(sheetBody()).not.toBeNull())
    button(document, 'confirm.yes')?.click()
  }

  afterEach(() => TestBed.inject(BottomSheetService).closeAll())

  it('test_a_member_can_leave_or_log_out_but_not_restore', async () => {
    const { root } = await open('member')

    expect(button(root, 'deleted.leave')?.textContent).toContain('Leave household')
    expect(button(root, 'deleted.logout')).not.toBeNull()
    expect(button(root, 'deleted.restore')).toBeNull()
  })

  it('test_the_owner_restores_and_is_never_offered_to_leave', async () => {
    const { root } = await open('owner')

    expect(button(root, 'deleted.restore')).not.toBeNull()
    expect(button(root, 'deleted.leave')).toBeNull()
  })

  it('test_leaving_asks_first_and_says_what_stays_behind', async () => {
    const { root } = await open('member')

    button(root, 'deleted.leave')?.click()

    await vi.waitFor(() =>
      expect(document.querySelector('.mm-sheet-panel h2')?.textContent).toContain(
        'Leave Sam’s home?'
      )
    )
    expect(sheetBody()?.textContent).toContain('start your own household or join one')
    button(document, 'confirm.no')?.click()
    await vi.waitFor(() => expect(sheetBody()).toBeNull())
    expect(households.leave).not.toHaveBeenCalled()
  })

  it('test_confirming_leaves_refreshes_the_session_and_opens_create_or_join', async () => {
    const { root } = await open('member')

    await confirmLeaving(root)

    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/household/new'))
    expect(households.leave).toHaveBeenCalledTimes(1)
    expect(session.load).toHaveBeenCalledTimes(1)
  })

  it('test_an_owner_refused_by_the_api_reads_why_on_the_screen', async () => {
    const { root } = await open('member')
    households.leave.mockRejectedValueOnce(
      httpError(422, { message: 'Owners cannot leave', code: 'E_OWNER_CANNOT_LEAVE' })
    )

    await confirmLeaving(root)

    await vi.waitFor(() =>
      expect(root.querySelector('app-banner')?.textContent).toContain(
        'The owner cannot leave the household.'
      )
    )
    expect(session.load).not.toHaveBeenCalled()
    expect(TestBed.inject(Router).url).toBe('/household-deleted')
  })

  it('test_a_leave_that_cannot_reach_the_server_says_so_and_stays', async () => {
    const { root } = await open('member')
    households.leave.mockRejectedValueOnce(networkError())

    await confirmLeaving(root)

    await vi.waitFor(() => expect(root.querySelector('app-banner')).not.toBeNull())
    expect(button(root, 'deleted.leave')).not.toBeNull()
    expect(TestBed.inject(Router).url).toBe('/household-deleted')
  })

  it('test_log_out_stays_available', async () => {
    const { root } = await open('member')

    button(root, 'deleted.logout')?.click()

    await vi.waitFor(() => expect(session['logout']).toHaveBeenCalledTimes(1))
  })
})
