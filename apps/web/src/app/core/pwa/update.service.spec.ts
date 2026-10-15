import { TestBed } from '@angular/core/testing'
import { SwUpdate, type VersionEvent, type UnrecoverableStateEvent } from '@angular/service-worker'
import { Subject } from 'rxjs'
import { PAGE_RELOAD } from '../platform/window.token'
import { ToastStore } from '../ui/toast.store'
import { UpdateService } from './update.service'

class FakeSwUpdate {
  isEnabled = true
  readonly versionUpdates = new Subject<VersionEvent>()
  readonly unrecoverable = new Subject<UnrecoverableStateEvent>()
  readonly checkForUpdate = vi.fn(async () => false)
  readonly activateUpdate = vi.fn(async () => true)
}

const versionReady: VersionEvent = {
  type: 'VERSION_READY',
  currentVersion: { hash: 'old' },
  latestVersion: { hash: 'new' },
}

describe('UpdateService', () => {
  let sw: FakeSwUpdate
  let reload: ReturnType<typeof vi.fn>

  function start(enabled = true): UpdateService {
    sw = new FakeSwUpdate()
    sw.isEnabled = enabled
    reload = vi.fn()
    TestBed.configureTestingModule({
      providers: [
        { provide: SwUpdate, useValue: sw },
        { provide: PAGE_RELOAD, useValue: reload },
      ],
    })
    const service = TestBed.inject(UpdateService)
    service.start()
    return service
  }

  function setVisibility(state: DocumentVisibilityState): void {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
    document.dispatchEvent(new Event('visibilitychange'))
  }

  afterEach(() => setVisibility('visible'))

  it('test_a_ready_version_shows_a_persistent_update_toast', () => {
    start()

    sw.versionUpdates.next(versionReady)

    const toast = TestBed.inject(ToastStore).current()
    expect(toast?.messageKey).toBe('pwa.update.ready')
    expect(toast?.persistent).toBe(true)
    expect(toast?.action?.labelKey).toBe('pwa.update.action')
  })

  it('test_never_reloads_on_its_own', () => {
    start()

    sw.versionUpdates.next(versionReady)

    expect(sw.activateUpdate).not.toHaveBeenCalled()
    expect(reload).not.toHaveBeenCalled()
  })

  it('test_the_update_action_activates_the_new_version_then_reloads', async () => {
    start()
    sw.versionUpdates.next(versionReady)

    TestBed.inject(ToastStore).runAction()
    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1))

    expect(sw.activateUpdate).toHaveBeenCalledTimes(1)
  })

  it('test_other_version_events_are_ignored', () => {
    start()

    sw.versionUpdates.next({ type: 'VERSION_DETECTED', version: { hash: 'new' } })

    expect(TestBed.inject(ToastStore).current()).toBeNull()
  })

  it('test_checks_for_an_update_when_the_app_comes_back_to_the_foreground', () => {
    start()

    setVisibility('hidden')
    expect(sw.checkForUpdate).not.toHaveBeenCalled()
    setVisibility('visible')

    expect(sw.checkForUpdate).toHaveBeenCalledTimes(1)
  })

  it('test_an_unrecoverable_state_raises_the_reload_banner', () => {
    const service = start()
    expect(service.unrecoverable()).toBe(false)

    sw.unrecoverable.next({ type: 'UNRECOVERABLE_STATE', reason: 'cache evicted' })

    expect(service.unrecoverable()).toBe(true)
  })

  it('test_does_nothing_without_a_service_worker', () => {
    start(false)

    setVisibility('visible')
    sw.versionUpdates.next(versionReady)

    expect(sw.checkForUpdate).not.toHaveBeenCalled()
    expect(TestBed.inject(ToastStore).current()).toBeNull()
  })

  it('test_check_now_reports_whether_a_new_version_was_found', async () => {
    const service = start()

    expect(await service.checkNow()).toBe('latest')
    sw.checkForUpdate.mockResolvedValueOnce(true)
    expect(await service.checkNow()).toBe('found')
    sw.checkForUpdate.mockRejectedValueOnce(new Error('offline'))
    expect(await service.checkNow()).toBe('failed')
  })

  it('test_check_now_without_a_service_worker_is_unsupported', async () => {
    const service = start(false)

    expect(await service.checkNow()).toBe('unsupported')
    expect(sw.checkForUpdate).not.toHaveBeenCalled()
  })
})
