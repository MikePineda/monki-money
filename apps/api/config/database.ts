import env from '#start/env'
import app from '@adonisjs/core/services/app'
import { defineConfig } from '@adonisjs/lucid'

const dbConfig = defineConfig({
  connection: 'postgres',

  connections: {
    postgres: {
      client: 'pg',
      connection: {
        host: env.get('DB_HOST'),
        port: env.get('DB_PORT'),
        user: env.get('DB_USER'),
        password: env.get('DB_PASSWORD')?.release(),
        database: env.get('DB_DATABASE'),
      },
      pool: {
        min: 0,
        max: env.get('DB_POOL_MAX', 10),
      },
      migrations: {
        naturalSort: true,
        paths: ['database/migrations'],
      },
      // Regenerates database/schema.ts after migrations, in development only:
      // the image is read-only for the app user, and the test suite migrates
      // a database whose schema is identical by definition. Infrastructure
      // tables without a model (rate limiter, scheduler lock) are left out.
      schemaGeneration: {
        enabled: app.inDev,
        rulesPaths: ['./database/schema_rules.js'],
        excludeTables: ['rate_limits', 'scheduler_runs'],
      },
      debug: app.inDev && env.get('LOG_LEVEL') === 'debug',
    },
  },
})

export default dbConfig
