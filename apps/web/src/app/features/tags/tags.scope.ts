import { provideTranslocoScope } from '@jsverse/transloco'

/** The `tags` catalogue (the tags list and one tag's detail). */
export function provideTagsScope() {
  return provideTranslocoScope({
    scope: 'tags',
    loader: { en: () => import('./i18n/en.json'), es: () => import('./i18n/es.json') },
  })
}
