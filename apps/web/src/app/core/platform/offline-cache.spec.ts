import { TestBed } from '@angular/core/testing'
import { aCategoryTree } from '../../../testing/ledger-fixtures'
import { aMe, aUser, anAccount } from '../../../testing/session-fixtures'
import { clearAppStorage } from '../auth/app-storage'
import { DIRECTORY_CACHE_KEY, OfflineCache, SESSION_CACHE_KEY } from './offline-cache'
import { WINDOW } from './window.token'

describe('OfflineCache', () => {
  function setup(storage: Storage = window.localStorage): OfflineCache {
    TestBed.configureTestingModule({
      providers: [{ provide: WINDOW, useValue: { localStorage: storage } }],
    })
    return TestBed.inject(OfflineCache)
  }

  const directory = { accounts: [anAccount({ id: 3 })], tree: aCategoryTree() }

  afterEach(() => localStorage.clear())

  it('test_the_last_session_reads_back_as_it_was_saved', () => {
    const cache = setup()
    const me = aMe('member')

    cache.writeSession(me)

    expect(cache.readSession()).toEqual(me)
  })

  it('test_nothing_saved_or_something_unreadable_is_no_session', () => {
    const cache = setup()
    expect(cache.readSession()).toBeNull()

    localStorage.setItem(SESSION_CACHE_KEY, '{oops')
    expect(cache.readSession()).toBeNull()

    localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify({ version: 99, me: aMe() }))
    expect(cache.readSession()).toBeNull()

    localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify({ version: 1, me: { user: null } }))
    expect(cache.readSession()).toBeNull()
  })

  it('test_a_directory_reads_back_only_for_the_person_and_household_it_was_saved_for', () => {
    const cache = setup()
    cache.writeSession(aMe())

    cache.writeDirectory(1, 10, directory)

    expect(cache.readDirectory(1, 10)).toEqual(directory)
    expect(cache.readDirectory(2, 10)).toBeNull()
    expect(cache.readDirectory(1, 11)).toBeNull()
  })

  it('test_another_persons_session_drops_the_directory_kept_for_the_previous_one', () => {
    const cache = setup()
    cache.writeSession(aMe())
    cache.writeDirectory(1, 10, directory)

    cache.writeSession(aMe())
    expect(cache.readDirectory(1, 10)).toEqual(directory)

    const other = aMe()
    other.user = aUser({ id: 2, email: 'alex@example.test' })
    cache.writeSession(other)

    expect(localStorage.getItem(DIRECTORY_CACHE_KEY)).toBeNull()
    expect(cache.readDirectory(1, 10)).toBeNull()
  })

  it('test_clear_forgets_the_session_and_the_directory', () => {
    const cache = setup()
    cache.writeSession(aMe())
    cache.writeDirectory(1, 10, directory)

    cache.clear()

    expect(cache.readSession()).toBeNull()
    expect(cache.readDirectory(1, 10)).toBeNull()
  })

  it('test_logging_out_forgets_the_cache_with_the_rest_of_the_apps_storage', () => {
    const cache = setup()
    cache.writeSession(aMe())
    cache.writeDirectory(1, 10, directory)

    clearAppStorage(window)

    expect(cache.readSession()).toBeNull()
    expect(cache.readDirectory(1, 10)).toBeNull()
  })

  it('test_a_device_that_refuses_to_store_anything_is_harmless', () => {
    const refusing = {
      getItem: () => {
        throw new DOMException('Blocked', 'SecurityError')
      },
      setItem: () => {
        throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
      },
      removeItem: () => {
        throw new DOMException('Blocked', 'SecurityError')
      },
    } as unknown as Storage
    const cache = setup(refusing)

    expect(() => cache.writeSession(aMe())).not.toThrow()
    expect(() => cache.writeDirectory(1, 10, directory)).not.toThrow()
    expect(() => cache.clear()).not.toThrow()
    expect(cache.readSession()).toBeNull()
    expect(cache.readDirectory(1, 10)).toBeNull()
  })
})
