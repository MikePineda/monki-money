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
      // Regenerates database/schema.ts after migrations. Never in production:
      // the image is read-only for the app user.
      schemaGeneration: {
        enabled: !app.inProduction,
        rulesPaths: ['./database/schema_rules.js'],
      },
      debug: app.inDev && env.get('LOG_LEVEL') === 'debug',
    },
  },
})

export default dbConfig
