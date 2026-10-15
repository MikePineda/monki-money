/*
|--------------------------------------------------------------------------
| Environment variables service
|--------------------------------------------------------------------------
|
| Every variable the app reads is validated here at boot, so a missing or
| malformed value crashes the container immediately (and Swarm rolls back)
| instead of failing at request time. Rules for this file:
|
| - Secrets use `Env.schema.secret()` so they never leak through logs.
| - Booleans are booleans; numbers are numbers.
| - NEVER type a variable as a list or an object. Values that carry
|   structure (SEED_USERS_JSON, SEED_ACCOUNTS) stay raw strings here and are
|   parsed by the code that owns them, with a readable error.
| - The documented list lives in `apps/api/.env.example`; keep both in sync.
|
*/

import { Env } from '@adonisjs/core/env'

export default await Env.create(new URL('../', import.meta.url), {
  // Node / HTTP
  TZ: Env.schema.string.optional(),
  NODE_ENV: Env.schema.enum(['development', 'production', 'test'] as const),
  HOST: Env.schema.string({ format: 'host' }),
  PORT: Env.schema.number(),
  LOG_LEVEL: Env.schema.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal'] as const),

  // App
  APP_KEY: Env.schema.secret(),
  APP_URL: Env.schema.string({ format: 'url', tld: false }),
  APP_NAME: Env.schema.string.optional(),
  APP_VERSION: Env.schema.string.optional(),
  GIT_SHA: Env.schema.string.optional(),
  REGISTRATION_OPEN: Env.schema.boolean(),
  E2E_MODE: Env.schema.boolean.optional(),

  // Session and rate limiting
  SESSION_DRIVER: Env.schema.enum(['cookie', 'memory'] as const),
  LIMITER_STORE: Env.schema.enum(['database', 'memory'] as const),

  // Bot protection (empty secret = verification skipped)
  TURNSTILE_SITE_KEY: Env.schema.string.optional(),
  TURNSTILE_SECRET: Env.schema.secret.optional(),

  // Database
  DB_HOST: Env.schema.string({ format: 'host' }),
  DB_PORT: Env.schema.number(),
  DB_USER: Env.schema.string(),
  DB_PASSWORD: Env.schema.secret.optional(),
  DB_DATABASE: Env.schema.string(),
  DB_POOL_MAX: Env.schema.number.optional(),

  // Object storage (S3-compatible: Cloudflare R2 in production, MinIO locally)
  DRIVE_DISK: Env.schema.enum.optional(['s3', 'fs'] as const),
  S3_ENDPOINT: Env.schema.string.optional({ format: 'url', tld: false }),
  S3_REGION: Env.schema.string.optional(),
  S3_BUCKET: Env.schema.string.optional(),
  S3_KEY: Env.schema.secret.optional(),
  S3_SECRET: Env.schema.secret.optional(),
  S3_FORCE_PATH_STYLE: Env.schema.boolean.optional(),

  // Background jobs
  QUEUE_DRIVER: Env.schema.enum.optional(['sync', 'database'] as const),

  // LLM provider (empty LLM_API_KEY = no LLM, the app keeps working)
  LLM_PROVIDER: Env.schema.enum.optional(['anthropic-compatible', 'anthropic', 'fake'] as const),
  LLM_BASE_URL: Env.schema.string.optional({ format: 'url', tld: false }),
  LLM_API_KEY: Env.schema.secret.optional(),
  LLM_MODEL: Env.schema.string.optional(),
  LLM_VISION_MODEL: Env.schema.string.optional(),
  LLM_MONTHLY_CAP_OVERRIDE: Env.schema.number.optional(),

  // Mail (empty provider key = silent no-op; never real mail from dev/tests)
  MAIL_DRIVER: Env.schema.enum.optional(['log', 'resend', 'smtp'] as const),
  MAIL_FROM: Env.schema.string.optional(),
  RESEND_API_KEY: Env.schema.secret.optional(),
  SMTP_HOST: Env.schema.string.optional({ format: 'host' }),
  SMTP_PORT: Env.schema.number.optional(),
  SMTP_USERNAME: Env.schema.string.optional(),
  SMTP_PASSWORD: Env.schema.secret.optional(),

  // Observability
  SENTRY_DSN: Env.schema.secret.optional(),
  SENTRY_DSN_WEB: Env.schema.string.optional(),

  // Deploy-time bootstrap (read by docker/entrypoint.mjs and the seeders)
  MIGRATE_ON_START: Env.schema.boolean.optional(),
  SEED_USERS: Env.schema.boolean.optional(),
  SEED_HOUSEHOLD: Env.schema.string.optional(),
  SEED_USERS_JSON: Env.schema.secret.optional(),
  SEED_ACCOUNTS: Env.schema.string.optional(),
  SMOKE_PASSWORD: Env.schema.secret.optional(),
})
