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
|   structure stay flat raw strings here (see the SEED_* block) and are
|   parsed by the code that owns them, with a readable error.
| - The documented list lives in `apps/api/.env.example`; keep both in sync.
|
*/

import { Env } from '@adonisjs/core/env'

/** An optional URL-safe base64 VAPID key of `bytes` bytes once decoded. */
function vapidKey(bytes: number) {
  return (name: string, value?: string) => {
    if (!value) return undefined
    if (!/^[\w-]+$/.test(value) || Buffer.from(value, 'base64url').length !== bytes) {
      throw new Error(`${name} must be a URL-safe base64 key of ${bytes} bytes`)
    }
    return value
  }
}

/** Push services take an https: URL or a mailto: address only. */
function vapidSubject(name: string, value?: string) {
  if (!value) return undefined
  if (!/^(mailto:\S+@\S+|https:\/\/\S+)$/.test(value)) {
    throw new Error(`${name} must be a mailto: address or an https:// URL`)
  }
  return value
}

const env = await Env.create(new URL('../', import.meta.url), {
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
  // Locale when neither the user nor the browser picks a supported one (default en)
  APP_DEFAULT_LOCALE: Env.schema.enum.optional(['en', 'es'] as const),

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
  // In-process scheduler (monthly insights). Production only; empty = on, `off` disables it.
  SCHEDULER: Env.schema.enum.optional(['on', 'off'] as const),

  // Web Push (VAPID). Optional: without the pair the app generates one and
  // stores it in app_settings (private key encrypted with APP_KEY).
  VAPID_PUBLIC_KEY: vapidKey(65),
  VAPID_PRIVATE_KEY: Env.schema.secret.optional(),
  VAPID_SUBJECT: vapidSubject,

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

  // Deploy-time bootstrap (read by docker/entrypoint.mjs and the
  // production_bootstrap seeder). Real names and emails live ONLY in the
  // Dokploy panel; the seeder validates the values it needs.
  MIGRATE_ON_START: Env.schema.boolean.optional(),
  SEED_USERS: Env.schema.boolean.optional(),
  SEED_HOUSEHOLD_NAME: Env.schema.string.optional(),
  SEED_LOCALE: Env.schema.string.optional(),
  SEED_USER1_EMAIL: Env.schema.string.optional(),
  SEED_USER1_NAME: Env.schema.string.optional(),
  SEED_USER1_PASSWORD: Env.schema.secret.optional(),
  SEED_USER1_CARD_SUFFIX: Env.schema.string.optional(),
  SEED_USER2_EMAIL: Env.schema.string.optional(),
  SEED_USER2_NAME: Env.schema.string.optional(),
  SEED_USER2_PASSWORD: Env.schema.secret.optional(),
  SEED_USER2_CARD_SUFFIX: Env.schema.string.optional(),
  SEED_JOINT_ACCOUNT_NUMBER: Env.schema.string.optional(),
  SMOKE_EMAIL: Env.schema.string.optional(),
  SMOKE_PASSWORD: Env.schema.secret.optional(),
})

// The VAPID pair goes together: half of it would sign with a key no browser subscribed to.
const vapidPrivateKey = env.get('VAPID_PRIVATE_KEY')?.release()
if (Boolean(env.get('VAPID_PUBLIC_KEY')) !== Boolean(vapidPrivateKey)) {
  throw new Error('VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY go together: set both or neither')
}
if (vapidPrivateKey) vapidKey(32)('VAPID_PRIVATE_KEY', vapidPrivateKey)

export default env
