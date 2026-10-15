/* eslint-disable prettier/prettier */
import type { routes } from './index.ts'

export interface ApiDefinition {
  health: {
    ready: typeof routes['health.ready']
    live: typeof routes['health.live']
  }
  config: {
    show: typeof routes['config.show']
  }
}
