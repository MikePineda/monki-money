import { TestBed } from '@angular/core/testing'
import { aMember, aUser } from '../../../testing/session-fixtures'
import { SessionStore } from '../auth/session.store'
import { HouseholdApi } from './household.api'
import { MembersStore } from './members.store'

describe('MembersStore', () => {
  let api: { members: ReturnType<typeof vi.fn> }
  let clearHooks: (() => void)[]

  function createStore(youId = 2): MembersStore {
    clearHooks = []
    api = {
      members: vi.fn(async () => [
        aMember({ id: 100, userId: 1, fullName: 'Sam Rivera', role: 'owner' }),
        aMember({ id: 101, userId: 2, fullName: 'Alex Chen', role: 'member' }),
      ]),
    }
    TestBed.configureTestingModule({
      providers: [
        { provide: HouseholdApi, useValue: api },
        {
          provide: SessionStore,
          useValue: {
            user: () => aUser({ id: youId }),
            onClear: (hook: () => void) => clearHooks.push(hook),
          },
        },
      ],
    })
    return TestBed.inject(MembersStore)
  }

  it('test_people_keep_the_member_order_for_their_mark', async () => {
    const store = createStore()
    await store.load()

    expect(store.people()).toEqual([
      { userId: 1, person: 'a', isYou: false, name: 'Sam' },
      { userId: 2, person: 'b', isYou: true, name: 'Alex' },
    ])
  })

  it('test_joint_and_unknown_payers_get_the_shared_mark', async () => {
    const store = createStore()
    await store.load()

    expect(store.personOf(1)).toBe('a')
    expect(store.personOf(null)).toBe('joint')
    expect(store.personOf(99)).toBe('joint')
  })

  it('test_partner_is_the_other_member', async () => {
    const store = createStore(1)
    await store.load()

    expect(store.partner()?.name).toBe('Alex')
    expect(store.you()?.userId).toBe(1)
  })

  it('test_load_calls_the_api_once_and_logout_forgets_the_members', async () => {
    const store = createStore()
    await Promise.all([store.load(), store.load()])
    await store.load()

    expect(api.members).toHaveBeenCalledTimes(1)

    clearHooks.forEach((hook) => hook())
    expect(store.people()).toEqual([])
    await store.load()
    expect(api.members).toHaveBeenCalledTimes(2)
  })
})
