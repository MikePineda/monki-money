import { test } from '@japa/runner'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DOMAIN_DIR = fileURLToPath(new URL('../../../app/domain/importing', import.meta.url))

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? sourceFiles(join(dir, entry.name))
      : entry.name.endsWith('.ts')
        ? [join(dir, entry.name)]
        : []
  )
}

test.group('Importing / domain purity', () => {
  test('test_import_domain_has_no_database_io_or_implicit_clock', ({ assert }) => {
    const forbidden = [
      /from '@adonisjs\/lucid/,
      /from '#models\//,
      /from '#services\//,
      /from '#importers\//,
      /from 'node:(fs|http|https|net|child_process)/,
      /Date\.now\(/,
      /new Date\(\)/,
    ]
    const files = sourceFiles(DOMAIN_DIR)
    assert.isAbove(files.length, 10)
    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      for (const pattern of forbidden) {
        assert.notMatch(source, pattern, `${file} matches ${pattern}`)
      }
    }
  })
})
