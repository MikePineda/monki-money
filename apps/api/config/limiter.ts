import env from '#start/env'
import { defineConfig, stores } from '@adonisjs/limiter'

/**
 * Rate limits live in Postgres (`rate_limits`) so they hold across replicas
 * without Redis. Tests use the in-process memory store.
 */
const limiterConfig = defineConfig({
  default: env.get('LIMITER_STORE'),
  stores: {
    database: stores.database({
      tableName: 'rate_limits',
    }),
    memory: stores.memory({}),
  },
})

export default limiterConfig

declare module '@adonisjs/limiter/types' {
  export interface LimitersList extends InferLimiters<typeof limiterConfig> {}
}
