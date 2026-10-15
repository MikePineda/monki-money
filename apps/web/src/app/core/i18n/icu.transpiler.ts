import { Injectable } from '@angular/core'
import { DefaultTranspiler, type TranspileParams } from '@jsverse/transloco'
import { DEFAULT_LANG, isAppLang, localeFor } from '../../domain/locale'
import { formatIcuMessage } from './icu-message'

/**
 * Transloco transpiler for ICU messages (plurals, select, numbers) through
 * Intl, so the catalogues use one syntax in both languages:
 * "{count, plural, one {# row} other {# rows}}". It replaces
 * @jsverse/transloco-messageformat, whose runtime compiler added about 80 kB
 * to the initial bundle for the same feature set.
 */
@Injectable()
export class IcuTranspiler extends DefaultTranspiler {
  private locale = localeFor(DEFAULT_LANG)

  override transpile(params: TranspileParams): unknown {
    const { value } = params
    if (typeof value === 'string') {
      return value.includes('{') ? formatIcuMessage(value, params.params ?? {}, this.locale) : value
    }
    return super.transpile(params)
  }

  onLangChanged(lang: string): void {
    this.locale = isAppLang(lang) ? localeFor(lang) : lang
  }
}
