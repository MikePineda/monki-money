import { Injectable, computed, inject, signal } from '@angular/core'
import { firstName } from '../../domain/people'
import type { Person } from '../../shared/ui/person-dot/person-dot.component'
import type { Member } from '../api/api-types'
import { SessionStore } from '../auth/session.store'
import { HouseholdApi } from './household.api'

/** A member as the UI shows them: a mark colour and a first name ("You" is a translation). */
export interface HouseholdPerson {
  userId: number
  /** `a` / `b` by member order, the same in every screen and for both members. */
  person: Exclude<Person, 'joint'>
  isYou: boolean
  name: string
}

/**
 * The household's members for screens that show who paid. Loaded once
 * (`GET /household/members`) and forgotten on logout. People get colour
 * only on marks; in text they are "You" or the partner's first name, never
 * a name from the code.
 */
@Injectable({ providedIn: 'root' })
export class MembersStore {
  private readonly api = inject(HouseholdApi)
  private readonly session = inject(SessionStore)

  private readonly members = signal<Member[]>([])
  private pending: Promise<void> | null = null
  private loaded = false

  readonly people = computed<HouseholdPerson[]>(() => {
    const youId = this.session.user()?.id
    return this.members().map((member, index) => ({
      userId: member.userId,
      person: index === 0 ? 'a' : 'b',
      isYou: member.userId === youId,
      name: firstName(member.fullName),
    }))
  })

  readonly you = computed(() => this.people().find((item) => item.isYou) ?? null)
  readonly partner = computed(() => this.people().find((item) => !item.isYou) ?? null)

  constructor() {
    this.session.onClear(() => {
      this.members.set([])
      this.loaded = false
      this.pending = null
    })
  }

  /** Loads the members once; concurrent calls share the request. */
  load(): Promise<void> {
    if (this.loaded) {
      return Promise.resolve()
    }
    this.pending ??= this.api
      .members()
      .then((members) => {
        this.members.set(members)
        this.loaded = true
      })
      .finally(() => {
        this.pending = null
      })
    return this.pending
  }

  /** The mark for a payer: their colour, or the shared ring for joint (null) and unknown ids. */
  personOf(userId: number | null): Person {
    return this.people().find((item) => item.userId === userId)?.person ?? 'joint'
  }

  find(userId: number | null): HouseholdPerson | null {
    return this.people().find((item) => item.userId === userId) ?? null
  }
}
