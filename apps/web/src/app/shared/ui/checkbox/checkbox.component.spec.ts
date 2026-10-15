import { Component, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { FormField, form, required } from '@angular/forms/signals'
import { CheckboxComponent } from './checkbox.component'

@Component({
  imports: [CheckboxComponent],
  template: `<app-checkbox [(checked)]="agreed"
    >I agree to the <a href="/terms">terms</a></app-checkbox
  >`,
})
class PlainHost {
  readonly agreed = signal(false)
}

@Component({
  imports: [CheckboxComponent, FormField],
  template: `<app-checkbox [formField]="consent.terms">Terms</app-checkbox>`,
})
class SignalFormsHost {
  readonly model = signal({ terms: false })
  readonly consent = form(this.model, (path) => {
    required(path.terms, { message: 'Accept the terms to continue' })
  })
}

describe('CheckboxComponent', () => {
  it('test_clicking_the_label_toggles_the_checked_model', async () => {
    const fixture = TestBed.createComponent(PlainHost)
    await fixture.whenStable()
    const root = fixture.nativeElement as HTMLElement
    const input = root.querySelector('input[type="checkbox"]') as HTMLInputElement

    root.querySelector('label')?.click()
    await fixture.whenStable()

    expect(fixture.componentInstance.agreed()).toBe(true)
    expect(input.checked).toBe(true)
    expect(root.querySelector('svg[data-icon="check"]')).not.toBeNull()
  })

  it('test_links_inside_the_label_stay_links', async () => {
    const fixture = TestBed.createComponent(PlainHost)
    await fixture.whenStable()
    const root = fixture.nativeElement as HTMLElement

    expect(root.querySelector('label a')?.getAttribute('href')).toBe('/terms')
  })

  it('test_signal_forms_requires_it_checked_and_shows_the_error_once_touched', async () => {
    const fixture = TestBed.createComponent(SignalFormsHost)
    await fixture.whenStable()
    const root = fixture.nativeElement as HTMLElement
    const input = root.querySelector('input') as HTMLInputElement
    expect(fixture.componentInstance.consent().valid()).toBe(false)

    input.dispatchEvent(new Event('blur'))
    await fixture.whenStable()
    expect(root.querySelector('p')?.textContent).toContain('Accept the terms to continue')
    expect(input.getAttribute('aria-invalid')).toBe('true')

    input.click()
    await fixture.whenStable()
    expect(fixture.componentInstance.model().terms).toBe(true)
    expect(fixture.componentInstance.consent().valid()).toBe(true)
    expect(root.querySelector('p')).toBeNull()
  })
})
