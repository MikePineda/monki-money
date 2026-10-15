import { Component, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed'
import { FormField, form, required } from '@angular/forms/signals'
import { TextFieldComponent } from './text-field.component'
import { TextFieldHarness } from './text-field.harness'

@Component({
  imports: [TextFieldComponent],
  template: `
    <app-text-field label="Note" hint="Optional" [(value)]="note" />
    <app-text-field label="Email" type="email" [error]="error()" />
  `,
})
class PlainHost {
  readonly note = signal('')
  readonly error = signal('')
}

@Component({
  imports: [TextFieldComponent, FormField],
  template: `<app-text-field label="Name" [formField]="profile.name" />`,
})
class SignalFormsHost {
  readonly model = signal({ name: '' })
  readonly profile = form(this.model, (path) => {
    required(path.name, { message: 'Enter a name' })
  })
}

describe('TextFieldComponent', () => {
  it('test_label_is_bound_to_the_input_and_typing_updates_the_model', async () => {
    const fixture = TestBed.createComponent(PlainHost)
    const loader = TestbedHarnessEnvironment.loader(fixture)
    const field = await loader.getHarness(TextFieldHarness.with({ label: 'Note' }))

    await field.setValue('Groceries')

    expect(fixture.componentInstance.note()).toBe('Groceries')
    const label = fixture.nativeElement.querySelector('label') as HTMLLabelElement
    expect(fixture.nativeElement.querySelector(`#${label.htmlFor}`)).not.toBeNull()
    expect(await field.getMessage()).toBe('Optional')
  })

  it('test_an_error_marks_the_field_invalid_and_shows_the_message', async () => {
    const fixture = TestBed.createComponent(PlainHost)
    const loader = TestbedHarnessEnvironment.loader(fixture)
    const field = await loader.getHarness(TextFieldHarness.with({ label: 'Email' }))
    expect(await field.isInvalid()).toBe(false)

    fixture.componentInstance.error.set('Enter a valid email')
    await fixture.whenStable()

    expect(await field.isInvalid()).toBe(true)
    expect(await field.getMessage()).toBe('Enter a valid email')
  })

  it('test_signal_forms_errors_show_once_the_field_is_touched', async () => {
    const fixture = TestBed.createComponent(SignalFormsHost)
    const loader = TestbedHarnessEnvironment.loader(fixture)
    const field = await loader.getHarness(TextFieldHarness)
    expect(await field.getMessage()).toBeNull()

    await field.blur()

    expect(await field.getMessage()).toBe('Enter a name')
    await field.setValue('Sam')
    expect(fixture.componentInstance.model().name).toBe('Sam')
    expect(await field.getMessage()).toBeNull()
  })
})
