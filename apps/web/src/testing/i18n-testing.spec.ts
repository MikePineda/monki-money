import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { Component } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco'
import { firstValueFrom } from 'rxjs'
import { provideChartsI18n } from '../app/shared/charts/charts-i18n'
import { i18nTesting, i18nTestingProviders } from './i18n-testing'
import { SCOPE_CATALOGUES } from './i18n-scopes'

/** Every scope name declared through provideTranslocoScope() in the app's sources. */
function declaredScopes(): string[] {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((entry) => {
      const path = join(dir, entry)
      return statSync(path).isDirectory() ? walk(path) : [path]
    })
  const declaration = /provideTranslocoScope\(\s*(?:\{\s*scope:\s*)?'([^']+)'/g
  const names = walk(join(process.cwd(), 'src/app'))
    .filter((path) => path.endsWith('.ts') && !path.endsWith('.spec.ts'))
    .flatMap((path) =>
      [...readFileSync(path, 'utf8').matchAll(declaration)].map((match) => match[1])
    )
  return [...new Set(names)].sort()
}

@Component({
  imports: [TranslocoPipe],
  providers: [provideChartsI18n()],
  template: `<p>{{ 'charts.frame.retry' | transloco }}</p>`,
})
class ScopedProbe {}

describe('i18nTesting', () => {
  function setup(options: Parameters<typeof i18nTesting>[0] = {}): TranslocoService {
    TestBed.configureTestingModule({
      imports: [i18nTesting(options)],
      providers: [i18nTestingProviders()],
    })
    return TestBed.inject(TranslocoService)
  }

  it('test_every_scope_the_app_declares_is_registered_for_preloading', () => {
    expect(Object.keys(SCOPE_CATALOGUES).sort()).toEqual(declaredScopes())
  })

  it('test_a_scoped_component_renders_its_copy_from_the_first_frame', () => {
    setup({ lang: 'es' })

    const fixture = TestBed.createComponent(ScopedProbe)
    fixture.detectChanges()

    expect(fixture.nativeElement.textContent).toBe(SCOPE_CATALOGUES.charts.es.frame.retry)
  })

  it('test_switching_language_never_waits_for_a_scope_catalogue', () => {
    const transloco = setup({ lang: 'en' })
    const fixture = TestBed.createComponent(ScopedProbe)
    fixture.detectChanges()

    transloco.setActiveLang('es')
    fixture.detectChanges()

    expect(fixture.nativeElement.textContent).toBe(SCOPE_CATALOGUES.charts.es.frame.retry)
  })

  it('test_a_scope_that_is_not_preloaded_fails_instead_of_loading_lazily', async () => {
    const transloco = setup()
    const lazy = vi.fn(async () => ({ title: 'Too late' }))

    await expect(
      firstValueFrom(
        transloco.load('unregistered/en', { inlineLoader: { 'unregistered/en': lazy } })
      )
    ).rejects.toThrow(/"unregistered\/en" is not preloaded/)
    expect(lazy).not.toHaveBeenCalled()
  })

  it('test_a_missing_key_throws_instead_of_rendering_the_raw_key', () => {
    const transloco = setup()

    expect(() => transloco.translate('nowhere.to.be.found')).toThrow(
      /Missing translation for "nowhere\.to\.be\.found"/
    )
  })

  it('test_a_spec_can_hand_in_extra_catalogues', () => {
    const transloco = setup({
      lang: 'es',
      scopes: { 'probe/en': { hello: 'Hello' }, 'probe/es': { hello: 'Hola' } },
    })

    expect(transloco.translate('probe.hello')).toBe('Hola')
  })
})
