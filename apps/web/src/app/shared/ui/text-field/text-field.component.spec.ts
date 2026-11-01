import { Component, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed'
import { FormField, form, required } from '@angular/forms/signals'
import { i18nTesting, i18nTestingProviders } from '../../../../testing/i18n-testing'
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

@Component({
  imports: [TextFieldComponent],
  template: `
    <app-text-field label="Password" type="password" revealable [(value)]="secret" />
    <app-text-field label="PIN" type="password" [(value)]="pin" />
  `,
})
class PasswordHost {
  readonly secret = signal('')
  readonly pin = signal('')
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

  describe('a revealable password', () => {
    async function setup(lang: 'en' | 'es' = 'en') {
      TestBed.configureTestingModule({
        imports: [i18nTesting({ lang })],
        providers: [i18nTestingProviders()],
      })
      const fixture = TestBed.createComponent(PasswordHost)
      const loader = TestbedHarnessEnvironment.loader(fixture)
      const field = await loader.getHarness(TextFieldHarness.with({ label: 'Password' }))
      await fixture.whenStable()
      return { fixture, loader, field }
    }

    it('test_starts_hidden_with_an_unpressed_show_password_toggle', async () => {
      const { field } = await setup()

      expect(await field.getType()).toBe('password')
      expect(await field.isRevealable()).toBe(true)
      expect(await field.isRevealed()).toBe(false)
      expect(await field.getRevealLabel()).toBe('Show password')
    })

    it('test_the_toggle_shows_the_password_as_text_and_hides_it_again', async () => {
      const { fixture, field } = await setup()
      await field.setValue('secret-password')

      await field.toggleReveal()

      expect(await field.getType()).toBe('text')
      expect(await field.isRevealed()).toBe(true)
      expect(await field.getValue()).toBe('secret-password')
      expect(fixture.componentInstance.secret()).toBe('secret-password')

      await field.toggleReveal()

      expect(await field.getType()).toBe('password')
      expect(await field.isRevealed()).toBe(false)
    })

    it('test_the_toggle_is_a_button_that_never_submits_the_form', async () => {
      const { fixture } = await setup()
      const toggle = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="textField.reveal"]'
      )

      expect(toggle?.tagName).toBe('BUTTON')
      expect(toggle?.getAttribute('type')).toBe('button')
    })

    it('test_the_toggle_label_is_translated', async () => {
      const { field } = await setup('es')

      expect(await field.getRevealLabel()).toBe('Mostrar contraseña')
    })

    it('test_a_password_field_without_the_option_has_no_toggle', async () => {
      const { loader } = await setup()
      const pin = await loader.getHarness(TextFieldHarness.with({ label: 'PIN' }))

      expect(await pin.isRevealable()).toBe(false)
      expect(await pin.getType()).toBe('password')
    })
  })
})
