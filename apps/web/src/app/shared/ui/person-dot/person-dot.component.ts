import { Component, input } from '@angular/core'

/** Who a transaction belongs to: person A, person B, or the household (shared). */
export type Person = 'a' | 'b' | 'joint'

/**
 * The 8px person mark (DESIGN.md, People): the only place people get colour.
 * The shared household is a hollow ring in mark-muted. Decorative: the name
 * next to it carries the meaning.
 */
@Component({
  selector: 'app-person-dot',
  template: '',
  host: {
    'class': 'inline-block size-2 shrink-0 rounded-full',
    'aria-hidden': 'true',
    '[class.bg-person-a]': "person() === 'a'",
    '[class.bg-person-b]': "person() === 'b'",
    '[class.ring-2]': "person() === 'joint'",
    '[class.ring-inset]': "person() === 'joint'",
    '[class.ring-mark-muted]': "person() === 'joint'",
    '[attr.data-person]': 'person()',
  },
})
export class PersonDotComponent {
  readonly person = input.required<Person>()
}
