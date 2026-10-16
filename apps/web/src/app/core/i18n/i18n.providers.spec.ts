import { formatDate } from '@angular/common'
import { ApplicationInitStatus } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { TRANSLOCO_LOADER } from '@jsverse/transloco'
import { of } from 'rxjs'
import { provideI18n } from './i18n.providers'

describe('provideI18n', () => {
  afterEach(() => localStorage.clear())

  it('test_angular_locale_data_of_both_languages_is_ready_when_the_app_starts', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideI18n(),
        // The start catalogue, without a network.
        { provide: TRANSLOCO_LOADER, useValue: { getTranslation: () => of({}) } },
      ],
    })

    await TestBed.inject(ApplicationInitStatus).donePromise

    expect(formatDate('2026-10-01', 'MMMM', 'en-AU')).toBe('October')
    expect(formatDate('2026-10-01', 'MMMM', 'es-MX')).toBe('octubre')
  })
})
