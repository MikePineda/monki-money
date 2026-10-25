import { Injector } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { OutboxStore } from '../../core/outbox/outbox.store'
import { startOutbox } from './outbox-startup'
import { SafeLogout } from './safe-logout'

describe('startOutbox', () => {
  it('test_start_runs_the_outbox_and_guards_every_logout', () => {
    const outbox = { start: vi.fn() }
    const guard = { guardLogouts: vi.fn() }
    TestBed.configureTestingModule({
      providers: [
        { provide: OutboxStore, useValue: outbox },
        { provide: SafeLogout, useValue: guard },
      ],
    })

    startOutbox(TestBed.inject(Injector))

    expect(outbox.start).toHaveBeenCalledTimes(1)
    expect(guard.guardLogouts).toHaveBeenCalledTimes(1)
  })
})
