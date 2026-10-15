import { InjectionToken } from '@angular/core'

/** "Now", injected so stores that stamp times can be tested with a fixed clock. */
export const CLOCK = new InjectionToken<() => Date>('CLOCK', {
  providedIn: 'root',
  factory: () => () => new Date(),
})
