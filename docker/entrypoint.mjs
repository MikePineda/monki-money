/**
 * Container entrypoint (copied next to the compiled API, see Dockerfile).
 *
 * 1. MIGRATE_ON_START=true -> `node ace migration:run --force`. Safe with one
 *    replica and start-first updates because migrations are additive. If it
 *    fails, the server never starts, the task never turns healthy and Swarm
 *    rolls back. With replicas > 1 set it to false and migrate out of band.
 * 2. SEED_USERS=true -> idempotent production bootstrap seeder (first deploy
 *    only; real names/emails come from SEED_* env vars, never from the repo).
 * 3. Start the HTTP server in this same process, so SIGTERM reaches AdonisJS.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const appRoot = import.meta.dirname
const BOOTSTRAP_SEEDER = 'database/seeders/production_bootstrap_seeder.js'

function isEnabled(name) {
  return ['1', 'true', 'yes', 'on'].includes(String(process.env[name] ?? '').toLowerCase())
}

function ace(...args) {
  console.log(`entrypoint: node ace ${args.join(' ')}`)
  const result = spawnSync(process.execPath, ['ace', ...args], { cwd: appRoot, stdio: 'inherit' })
  if (result.status !== 0) {
    console.error(`entrypoint: "node ace ${args.join(' ')}" failed, refusing to start`)
    process.exit(result.status ?? 1)
  }
}

if (isEnabled('MIGRATE_ON_START')) {
  ace('migration:run', '--force')
}

if (isEnabled('SEED_USERS')) {
  if (!existsSync(join(appRoot, BOOTSTRAP_SEEDER))) {
    console.error(`entrypoint: SEED_USERS is on but ${BOOTSTRAP_SEEDER} is not in this build`)
    process.exit(1)
  }
  ace('db:seed', `--files=./${BOOTSTRAP_SEEDER}`)
}

await import('./bin/server.js')
