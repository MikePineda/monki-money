/* eslint-disable prettier/prettier */
import type { AdonisEndpoint } from '@tuyau/core/types'
import type { Registry } from './schema.d.ts'
import type { ApiDefinition } from './tree.d.ts'

const placeholder: any = {}

const routes = {
  'health.ready': {
    methods: ["GET","HEAD"],
    pattern: '/api/health',
    tokens: [{"old":"/api/health","type":0,"val":"api","end":""},{"old":"/api/health","type":0,"val":"health","end":""}],
    types: placeholder as Registry['health.ready']['types'],
  },
  'health.live': {
    methods: ["GET","HEAD"],
    pattern: '/api/health/live',
    tokens: [{"old":"/api/health/live","type":0,"val":"api","end":""},{"old":"/api/health/live","type":0,"val":"health","end":""},{"old":"/api/health/live","type":0,"val":"live","end":""}],
    types: placeholder as Registry['health.live']['types'],
  },
  'config.show': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/config',
    tokens: [{"old":"/api/v1/config","type":0,"val":"api","end":""},{"old":"/api/v1/config","type":0,"val":"v1","end":""},{"old":"/api/v1/config","type":0,"val":"config","end":""}],
    types: placeholder as Registry['config.show']['types'],
  },
} as const satisfies Record<string, AdonisEndpoint>

export { routes }

export const registry = {
  routes,
  $tree: {} as ApiDefinition,
}

declare module '@tuyau/core/types' {
  export interface UserRegistry {
    routes: typeof routes
    $tree: ApiDefinition
  }
}
