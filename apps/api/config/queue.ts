import env from '#start/env'
import { defineConfig, drivers } from '@adonisjs/queue'

/**
 * Background jobs (app/jobs). `QUEUE_DRIVER=sync` (the MVP, tests) runs a
 * job inline when it is dispatched; failures are logged and swallowed, so
 * jobs degrade instead of failing the request. `database` needs the queue
 * tables migration and a `queue:work` process: it arrives with the worker.
 */
export default defineConfig({
  default: env.get('QUEUE_DRIVER') ?? 'sync',

  adapters: {
    sync: drivers.sync(),
    database: drivers.database(),
  },

  worker: {
    concurrency: 2,
    idleDelay: '2s',
  },

  locations: ['./app/jobs/**/*.{ts,js}'],
})
