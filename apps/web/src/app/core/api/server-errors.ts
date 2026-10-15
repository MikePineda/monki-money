import { effect, signal, untracked, type Signal, type WritableSignal } from '@angular/core'

/**
 * Field messages from a 422, shown under their inputs until the user edits
 * the form again. Call in an injection context with the form's model.
 */
export function serverFieldErrors(model: Signal<unknown>): WritableSignal<Record<string, string>> {
  const errors = signal<Record<string, string>>({})
  effect(() => {
    model()
    untracked(() => errors.set({}))
  })
  return errors
}
