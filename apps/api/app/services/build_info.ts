import env from '#start/env'
import app from '@adonisjs/core/services/app'
import { readFile } from 'node:fs/promises'

export interface BuildInfo {
  version: string
  sha: string
}

export interface BuildInfoSources {
  /** APP_VERSION; a non-blank value overrides the file. */
  versionFromEnv?: string
  /** GIT_SHA; a non-blank value overrides the file. */
  shaFromEnv?: string
  /** `.app-version`, written by the Dockerfile from the root package.json. */
  versionFile: string
  /** `.git-sha`, written by the Dockerfile's `gitsha` stage. */
  shaFile: string
}

async function readTrimmed(path: string): Promise<string | undefined> {
  try {
    const content = await readFile(path, 'utf8')
    return content.trim() || undefined
  } catch {
    return undefined
  }
}

/**
 * Resolves the running build's version and commit. Precedence: environment
 * variable, then the file baked into the image, then a dev placeholder.
 * Never throws: a health probe must not fail because a file is missing.
 */
export async function readBuildInfo(sources: BuildInfoSources): Promise<BuildInfo> {
  const version =
    sources.versionFromEnv?.trim() || (await readTrimmed(sources.versionFile)) || 'dev'
  const sha = sources.shaFromEnv?.trim() || (await readTrimmed(sources.shaFile)) || 'unknown'
  return { version, sha }
}

let cached: Promise<BuildInfo> | undefined

/**
 * Build info of this process, read once. The files live at the API's app
 * root (`/app/apps/api/build` inside the image).
 */
export function currentBuildInfo(): Promise<BuildInfo> {
  cached ??= readBuildInfo({
    versionFromEnv: env.get('APP_VERSION'),
    shaFromEnv: env.get('GIT_SHA'),
    versionFile: app.makePath('.app-version'),
    shaFile: app.makePath('.git-sha'),
  })
  return cached
}
