import { Injectable, inject } from '@angular/core'
import { translateSignal } from '@jsverse/transloco'

/** New passwords must have at least this many characters (the API's rule). */
export const PASSWORD_MIN_LENGTH = 10

/**
 * Translated validation messages for Signal Forms, as signals that follow
 * the active language. A root singleton on purpose: the keys are global, and
 * inside a component with a Transloco scope translateSignal() would prefix
 * the scope ("auth.forms.required").
 */
@Injectable({ providedIn: 'root' })
export class FormMessages {
  readonly required = translateSignal('forms.required')
  readonly email = translateSignal('forms.email')
  readonly passwordMin = translateSignal('forms.passwordMin', { min: PASSWORD_MIN_LENGTH })
}

/** Use in a field initializer; pass `() => messages.required()` as a validator's `message`. */
export function formMessages(): FormMessages {
  return inject(FormMessages)
}
