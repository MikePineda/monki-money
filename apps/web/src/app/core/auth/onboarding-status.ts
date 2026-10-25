import { Injectable, inject } from '@angular/core'
import { WINDOW } from '../platform/window.token'
import { AccountsProbe } from './accounts-probe'
import {
  clearOnboardingProgress,
  readOnboardingProgress,
  writeOnboardingProgress,
} from './onboarding-progress'
import { SessionStore } from './session.store'

/**
 * Whether the owner still has the onboarding wizard ahead. The household
 * says so (`onboardedAt`, stamped when the wizard ends on any device);
 * this device only remembers which step to resume. While nothing is on
 * record (a null, or an older API without the field) a wizard left halfway
 * here resumes, else the accounts decide as before the field existed: a
 * household without accounts needs the wizard. Members never see it: the
 * owner set the household up.
 */
@Injectable({ providedIn: 'root' })
export class OnboardingStatus {
  private readonly session = inject(SessionStore)
  private readonly accounts = inject(AccountsProbe)
  private readonly window = inject(WINDOW)

  /** Households known to be set up during this app run (saves a request per navigation). */
  private readonly settled = new Set<number>()

  constructor() {
    this.session.onClear(() => this.settled.clear())
  }

  async isPending(): Promise<boolean> {
    const household = this.session.household()
    if (!household || this.session.role() !== 'owner') {
      return false
    }
    const progress = readOnboardingProgress(this.window)
    if (household.onboardedAt) {
      // Finished (maybe on another device): a position left here is stale.
      if (progress?.householdId === household.id) {
        clearOnboardingProgress(this.window)
      }
      return false
    }
    if (progress?.householdId === household.id) {
      return true
    }
    if (this.settled.has(household.id)) {
      return false
    }
    try {
      const accounts = await this.accounts.list()
      if (accounts.length > 0) {
        this.settled.add(household.id)
        return false
      }
      return true
    } catch {
      // Cannot tell right now: never lock the user out of the app over it.
      return false
    }
  }

  /** The step the wizard should open on (0 when it starts fresh). */
  savedStep(householdId: number): number {
    const progress = readOnboardingProgress(this.window)
    return progress?.householdId === householdId ? progress.step : 0
  }

  saveStep(householdId: number, step: number): void {
    writeOnboardingProgress(this.window, { householdId, step })
  }

  complete(householdId: number): void {
    clearOnboardingProgress(this.window)
    this.settled.add(householdId)
  }
}
