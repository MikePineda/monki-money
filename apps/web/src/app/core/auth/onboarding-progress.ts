import { readPreference, writePreference } from '../platform/local-preference'

/**
 * Where the onboarding wizard was left, so it resumes on the same step. Each
 * step saves to the API as it goes and the household records the end
 * (`onboardedAt`); this only remembers the position on this device. Keyed
 * by household so another account on the device never inherits it.
 */
export const ONBOARDING_KEY = 'mm:onboarding'

export interface OnboardingProgress {
  householdId: number
  /** Zero-based index of the step to show. */
  step: number
}

function isProgress(value: unknown): value is OnboardingProgress {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const { householdId, step } = value as Record<string, unknown>
  return Number.isInteger(householdId) && Number.isInteger(step) && (step as number) >= 0
}

export function readOnboardingProgress(view: Window): OnboardingProgress | null {
  const raw = readPreference(view, ONBOARDING_KEY)
  if (!raw) {
    return null
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    return isProgress(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function writeOnboardingProgress(view: Window, progress: OnboardingProgress): void {
  writePreference(view, ONBOARDING_KEY, JSON.stringify(progress))
}

export function clearOnboardingProgress(view: Window): void {
  writePreference(view, ONBOARDING_KEY, null)
}
