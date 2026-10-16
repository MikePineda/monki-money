import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { COUPLE, aMe, aMemberSummary, sessionStubOf } from '../../../testing/session-fixtures'
import type { Me } from '../auth/auth.api'
import { SessionStore } from '../auth/session.store'
import { HouseholdApi } from './household.api'
import { MembersStore } from './members.store'

describe('MembersStore', () => {
  let me: ReturnType<typeof signal<Me | null>>
  let api: { members: ReturnType<typeof vi.fn> }

  function createStore(kind: 'owner' | 'member' = 'member'): MembersStore {
    me = signal<Me | null>(aMe(kind, [], COUPLE))
    api = { members: vi.fn(async () => []) }
    TestBed.configureTestingModule({
      providers: [
        { provide: HouseholdApi, useValue: api },
        { provide: SessionStore, useValue: sessionStubOf(me) },
      ],
    })
    return TestBed.inject(MembersStore)
  }

  it('test_people_keep_the_member_order_for_their_mark', () => {
    const store = createStore()

    expect(store.people()).toEqual([
      { userId: 1, person: 'a', isYou: false, name: 'Sam' },
      { userId: 2, person: 'b', isYou: true, name: 'Alex' },
    ])
  })

  it('test_names_come_from_the_session_without_a_request', () => {
    const store = createStore()

    expect(store.partner()?.name).toBe('Sam')
    // GET /auth/me already carried them: GET /household/members is for Settings only.
    expect(api.members).not.toHaveBeenCalled()
  })

  it('test_joint_and_unknown_payers_get_the_shared_mark', () => {
    const store = createStore()

    expect(store.personOf(1)).toBe('a')
    expect(store.personOf(null)).toBe('joint')
    expect(store.personOf(99)).toBe('joint')
  })

  it('test_partner_is_the_other_member', () => {
    const store = createStore('owner')

    expect(store.partner()?.name).toBe('Alex')
    expect(store.you()?.userId).toBe(1)
  })

  it('test_a_display_name_wins_and_shows_by_its_first_word', () => {
    const store = createStore('owner')

    me.set(
      aMe('owner', [], [aMemberSummary(), aMemberSummary({ id: 2, displayName: 'Jo Bloggs' })])
    )

    expect(store.find(2)?.name).toBe('Jo')
  })

  it('test_a_new_session_or_logout_changes_the_people_at_once', () => {
    const store = createStore('owner')

    me.set(aMe('owner'))
    expect(store.people().map((person) => person.userId)).toEqual([1])
    expect(store.partner()).toBeNull()

    me.set(null)
    expect(store.people()).toEqual([])
  })
})
