import type { Entitlements, HouseholdPlan } from '@monkimoney/shared'

/**
 * Limits per household plan. Exposed by `GET /api/v1/auth/me`; enforced by
 * the services that own each resource as they arrive (LLM quota, imports).
 */
export const plans: Record<HouseholdPlan, Entitlements> = {
  free: { llmCallsPerMonth: 200, maxAccounts: 6, maxMembers: 2, importsPerMonth: 30 },
  pro: { llmCallsPerMonth: 2000, maxAccounts: 60, maxMembers: 20, importsPerMonth: 300 },
}

export function entitlementsFor(plan: HouseholdPlan): Entitlements {
  return plans[plan]
}
