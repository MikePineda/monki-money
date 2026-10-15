/**
 * npm "prepare" hook: installs the lefthook git hooks when we are inside a git
 * checkout. It is a silent no-op in CI and in Docker builds (no .git directory,
 * dev dependencies omitted), so `npm ci` never fails there.
 */
import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

if (existsSync('.git') && process.env.CI !== 'true') {
  const result = spawnSync('npx', ['--no-install', 'lefthook', 'install'], { stdio: 'inherit' })
  if (result.status !== 0) {
    console.warn('lefthook install failed; commit-msg linting is not active locally')
  }
}
