import { test } from '@japa/runner'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { readBuildInfo } from '#services/build_info'

test.group('Build info', (group) => {
  let dir: string

  group.each.setup(async () => {
    dir = await mkdtemp(join(tmpdir(), 'monkimoney-build-info-'))
    return () => rm(dir, { recursive: true, force: true })
  })

  const sources = (overrides: { versionFromEnv?: string; shaFromEnv?: string } = {}) => ({
    versionFile: join(dir, '.app-version'),
    shaFile: join(dir, '.git-sha'),
    ...overrides,
  })

  test('reads version and sha written into the image', async ({ assert }) => {
    await writeFile(join(dir, '.app-version'), '1.4.2\n')
    await writeFile(join(dir, '.git-sha'), 'a1b2c3d4e5f6\n')

    assert.deepEqual(await readBuildInfo(sources()), { version: '1.4.2', sha: 'a1b2c3d4e5f6' })
  })

  test('non-empty environment values win over the files', async ({ assert }) => {
    await writeFile(join(dir, '.app-version'), '1.4.2')
    await writeFile(join(dir, '.git-sha'), 'a1b2c3d4e5f6')

    const info = await readBuildInfo(sources({ versionFromEnv: '9.9.9', shaFromEnv: 'feedface' }))

    assert.deepEqual(info, { version: '9.9.9', sha: 'feedface' })
  })

  test('blank environment values are ignored', async ({ assert }) => {
    await writeFile(join(dir, '.app-version'), '1.4.2')

    const info = await readBuildInfo(sources({ versionFromEnv: '  ', shaFromEnv: '' }))

    assert.equal(info.version, '1.4.2')
  })

  test('falls back to dev/unknown when nothing is available', async ({ assert }) => {
    assert.deepEqual(await readBuildInfo(sources()), { version: 'dev', sha: 'unknown' })
  })

  test('empty files count as missing', async ({ assert }) => {
    await writeFile(join(dir, '.app-version'), '')
    await writeFile(join(dir, '.git-sha'), '\n')

    assert.deepEqual(await readBuildInfo(sources()), { version: 'dev', sha: 'unknown' })
  })
})
