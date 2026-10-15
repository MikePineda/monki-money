import { test } from '@japa/runner'
import { join } from 'node:path'
import app from '@adonisjs/core/services/app'
import { readdir, readFile } from 'node:fs/promises'
import { LOCALES, TAXONOMY, taxonomyName } from '@monkimoney/shared'

/** [key, value] pairs of a nested catalog (keys may contain dots themselves). */
function entries(value: unknown, prefix = ''): [string, unknown][] {
  if (typeof value !== 'object' || value === null) return [[prefix, value]]
  return Object.entries(value).flatMap(([key, child]) =>
    entries(child, prefix ? `${prefix}.${key}` : key)
  )
}

function flatten(value: unknown): string[] {
  return entries(value).map(([key]) => key)
}

async function catalog(locale: string, file: string) {
  return JSON.parse(await readFile(join(app.languageFilesPath(), locale, file), 'utf8'))
}

test.group('Translation catalogs', () => {
  test('test_every_locale_has_the_same_catalog_files', async ({ assert }) => {
    const [reference, ...others] = await Promise.all(
      LOCALES.map(async (locale) => {
        const files = await readdir(join(app.languageFilesPath(), locale))
        return files.sort()
      })
    )
    for (const files of others) assert.deepEqual(files, reference)
    assert.includeMembers(reference, [
      'validator.json',
      'messages.json',
      'errors.json',
      'categories.json',
    ])
  })

  test('test_every_key_exists_in_every_locale (parity en/es)', async ({ assert }) => {
    const files = await readdir(join(app.languageFilesPath(), LOCALES[0]))
    for (const file of files) {
      const [reference, ...others] = await Promise.all(
        LOCALES.map(async (locale) => flatten(await catalog(locale, file)).sort())
      )
      for (const keys of others) assert.deepEqual(keys, reference, file)
    }
  })

  test('test_no_translation_is_empty', async ({ assert }) => {
    for (const locale of LOCALES) {
      for (const file of await readdir(join(app.languageFilesPath(), locale))) {
        for (const [key, value] of entries(await catalog(locale, file))) {
          assert.isString(value, `${locale}/${file}:${key}`)
          assert.isNotEmpty((value as string).trim(), `${locale}/${file}:${key}`)
        }
      }
    }
  })

  test('test_category_catalogs_match_the_shared_taxonomy', async ({ assert }) => {
    for (const locale of LOCALES) {
      const categories = await catalog(locale, 'categories.json')
      for (const group of TAXONOMY) {
        assert.equal(categories.group[group.slug], taxonomyName(group, locale), group.slug)
        for (const category of group.categories) {
          assert.equal(categories[category.slug], taxonomyName(category, locale), category.slug)
        }
      }
    }
  })
})
