import { provideTranslocoScope } from '@jsverse/transloco'

/** The `import` catalogue: upload, review (with its sheets) and result screens. */
export function provideImportScope() {
  return provideTranslocoScope({
    scope: 'import',
    loader: { en: () => import('./i18n/en.json'), es: () => import('./i18n/es.json') },
  })
}
