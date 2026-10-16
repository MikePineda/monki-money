import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { i18nTesting, i18nTestingProviders } from '../../../../testing/i18n-testing'
import { APP_LOCALE } from '../app-locale.token'
import {
  AmountDisplayComponent,
  type AmountKind,
  type AmountVariant,
} from './amount-display.component'

const MINUS = '−'

describe('AmountDisplayComponent', () => {
  async function render(
    cents: number,
    kind: AmountKind,
    variant: AmountVariant = 'row',
    locale = 'en-AU'
  ) {
    TestBed.configureTestingModule({
      imports: [i18nTesting()],
      providers: [i18nTestingProviders(), { provide: APP_LOCALE, useValue: signal(locale) }],
    })
    const fixture = TestBed.createComponent(AmountDisplayComponent)
    fixture.componentRef.setInput('cents', cents)
    fixture.componentRef.setInput('kind', kind)
    fixture.componentRef.setInput('variant', variant)
    await fixture.whenStable()
    const host = fixture.nativeElement as HTMLElement
    return { host, text: host.textContent?.replace(/\s+/g, ' ').trim() ?? '' }
  }

  it('test_expense_row_is_ink_with_a_true_minus', async () => {
    const { host, text } = await render(8420, 'expense')

    expect(text).toBe(`${MINUS}$84.20`)
    expect(host.className).toContain('text-expense')
    expect(host.querySelector('.tnum')).not.toBeNull()
  })

  it('test_income_row_is_green_with_a_plus', async () => {
    const { host, text } = await render(320000, 'income')

    expect(text).toBe('+$3,200.00')
    expect(host.className).toContain('text-income')
  })

  it('test_transfer_row_has_the_arrow_glyph_and_no_sign', async () => {
    const { host } = await render(50000, 'transfer')

    expect(host.querySelector('[data-icon="arrow-left-right"]')).not.toBeNull()
    expect(host.querySelector('.tnum')?.textContent).toBe('$500.00')
    expect(host.querySelector('.sr-only')?.textContent).toBe('Transfer')
    expect(host.className).toContain('text-transfer')
  })

  it('test_hero_has_no_sign_and_sets_the_cents_apart', async () => {
    const { host, text } = await render(-226340, 'total', 'hero')

    expect(text).toBe('$2,263.40')
    expect(host.querySelector('.text-ink-2')?.textContent).toBe('.40')
    expect(host.querySelector('.pnum')).not.toBeNull()
  })

  it('test_a_signed_hero_shows_the_true_minus_only_when_negative', async () => {
    TestBed.configureTestingModule({
      imports: [i18nTesting()],
      providers: [i18nTestingProviders(), { provide: APP_LOCALE, useValue: signal('en-AU') }],
    })
    const fixture = TestBed.createComponent(AmountDisplayComponent)
    fixture.componentRef.setInput('cents', -12_345)
    fixture.componentRef.setInput('variant', 'hero')
    fixture.componentRef.setInput('signed', true)
    await fixture.whenStable()
    const host = fixture.nativeElement as HTMLElement

    expect(host.textContent?.trim()).toBe(`${MINUS}$123.45`)

    fixture.componentRef.setInput('cents', 12_345)
    await fixture.whenStable()
    expect(host.textContent?.trim()).toBe('$123.45')
  })

  it('test_stat_rounds_to_whole_dollars', async () => {
    const { text } = await render(514040, 'total', 'stat')

    expect(text).toBe('$5,140')
  })

  it('test_formats_with_the_active_locale', async () => {
    const { text } = await render(128450, 'total', 'row', 'es-MX')

    expect(text).toBe('$1,284.50')
  })
})
