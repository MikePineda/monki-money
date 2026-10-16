import { Injectable, computed, inject } from '@angular/core'
import { firstName } from '../../domain/people'
import type { Person } from '../../shared/ui/person-dot/person-dot.component'
import { SessionStore } from '../auth/session.store'

/** A member as the UI shows them: a mark colour and a first name ("You" is a translation). */
export interface HouseholdPerson {
  userId: number
  /** `a` / `b` by member order, the same in every screen and for both members. */
  person: Exclude<Person, 'joint'>
  isYou: boolean
  name: string
}

/**
 * The household's members for screens that show who paid, read from the
 * session: `GET /auth/me` carries their names and colours, so nothing is
 * requested here (`GET /household/members`, with emails, is Settings'
 * own). People get colour only on marks; in text they are "You" or the
 * partner's first name, never a name from the code. A new session (login,
 * another household, logout) changes them at once.
 */
@Injectable({ providedIn: 'root' })
export class MembersStore {
  private readonly session = inject(SessionStore)

  readonly people = computed<HouseholdPerson[]>(() => {
    const youId = this.session.user()?.id
    return this.session.members().map((member, index) => ({
      userId: member.id,
      person: index === 0 ? 'a' : 'b',
      isYou: member.id === youId,
      name: firstName(member.displayName),
    }))
  })

  readonly you = computed(() => this.people().find((item) => item.isYou) ?? null)
  readonly partner = computed(() => this.people().find((item) => !item.isYou) ?? null)

  /** The mark for a payer: their colour, or the shared ring for joint (null) and unknown ids. */
  personOf(userId: number | null): Person {
    return this.people().find((item) => item.userId === userId)?.person ?? 'joint'
  }

  find(userId: number | null): HouseholdPerson | null {
    return this.people().find((item) => item.userId === userId) ?? null
  }
}
