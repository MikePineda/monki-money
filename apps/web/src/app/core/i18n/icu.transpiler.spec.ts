import { TestBed } from '@angular/core/testing'
import {
  TranslocoService,
  TranslocoTestingModule,
  provideTranslocoTranspiler,
} from '@jsverse/transloco'
import { IcuTranspiler } from './icu.transpiler'

describe('IcuTranspiler', () => {
  function setup(): TranslocoService {
    TestBed.configureTestingModule({
      imports: [
        TranslocoTestingModule.forRoot({
          langs: {
            en: {
              rows: '{count, plural, one {# row} other {# rows}}',
              plain: 'Save',
              nested: { title: 'Hi {name}' },
            },
            es: { rows: '{count, plural, one {# fila} other {# filas}}', plain: 'Guardar' },
          },
          translocoConfig: { availableLangs: ['en', 'es'], defaultLang: 'en' },
          preloadLangs: true,
        }),
      ],
      providers: [provideTranslocoTranspiler(IcuTranspiler)],
    })
    return TestBed.inject(TranslocoService)
  }

  it('test_plurals_are_resolved_for_the_active_language', async () => {
    const transloco = setup()
    const key = 'rows'

    expect(transloco.translate(key, { count: 1 })).toBe('1 row')
    expect(transloco.translate(key, { count: 1284 })).toBe('1,284 rows')
  })

  it('test_switching_language_switches_the_plural_locale', async () => {
    const transloco = setup()
    const key = 'rows'

    transloco.setActiveLang('es')
    await new Promise<void>((resolve) => transloco.load('es').subscribe(() => resolve()))

    expect(transloco.translate(key, { count: 2 })).toBe('2 filas')
  })

  it('test_plain_strings_pass_through_and_objects_still_resolve', () => {
    const transloco = setup()
    const plain = 'plain'
    const nested = 'nested'

    expect(transloco.translate(plain)).toBe('Save')
    expect(transloco.translateObject(nested, { title: { name: 'Sam' } })).toEqual({
      title: 'Hi Sam',
    })
  })
})
