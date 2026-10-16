import type { Translation } from '@jsverse/transloco'
import outboxEn from '../app/core/outbox/i18n/en.json'
import outboxEs from '../app/core/outbox/i18n/es.json'
import type { AppLang } from '../app/domain/locale'
import authEn from '../app/features/auth/i18n/en.json'
import authEs from '../app/features/auth/i18n/es.json'
import categoriesEn from '../app/features/categories/i18n/en.json'
import categoriesEs from '../app/features/categories/i18n/es.json'
import goalsEn from '../app/features/goals/i18n/en.json'
import goalsEs from '../app/features/goals/i18n/es.json'
import importEn from '../app/features/import/i18n/en.json'
import importEs from '../app/features/import/i18n/es.json'
import legalEn from '../app/features/legal/i18n/en.json'
import legalEs from '../app/features/legal/i18n/es.json'
import monthEn from '../app/features/month/i18n/en.json'
import monthEs from '../app/features/month/i18n/es.json'
import insightsEn from '../app/features/month/ui/insight-summary/i18n/en.json'
import insightsEs from '../app/features/month/ui/insight-summary/i18n/es.json'
import onboardingEn from '../app/features/onboarding/i18n/en.json'
import onboardingEs from '../app/features/onboarding/i18n/es.json'
import payslipsEn from '../app/features/payslips/i18n/en.json'
import payslipsEs from '../app/features/payslips/i18n/es.json'
import quickAddEn from '../app/features/quick-add/i18n/en.json'
import quickAddEs from '../app/features/quick-add/i18n/es.json'
import rulesEn from '../app/features/rules/i18n/en.json'
import rulesEs from '../app/features/rules/i18n/es.json'
import scanEn from '../app/features/scan/i18n/en.json'
import scanEs from '../app/features/scan/i18n/es.json'
import settingsEn from '../app/features/settings/i18n/en.json'
import settingsEs from '../app/features/settings/i18n/es.json'
import notificationsEn from '../app/features/settings/notifications/i18n/en.json'
import notificationsEs from '../app/features/settings/notifications/i18n/es.json'
import tagsEn from '../app/features/tags/i18n/en.json'
import tagsEs from '../app/features/tags/i18n/es.json'
import transactionsEn from '../app/features/transactions/i18n/en.json'
import transactionsEs from '../app/features/transactions/i18n/es.json'
import kitEn from '../app/kit/i18n/en.json'
import kitEs from '../app/kit/i18n/es.json'
import chartsEn from '../app/shared/charts/i18n/en.json'
import chartsEs from '../app/shared/charts/i18n/es.json'
import transactionFormEn from '../app/shared/transaction-form/i18n/en.json'
import transactionFormEs from '../app/shared/transaction-form/i18n/es.json'

/**
 * Both catalogues of every Transloco scope in the app, keyed by the scope
 * name its provideTranslocoScope() declares. i18nTesting() preloads all of
 * them before the first render, so no spec races a scope's lazy import().
 * A new scope goes here too: i18n-testing.spec.ts fails until it does.
 */
export const SCOPE_CATALOGUES = {
  auth: { en: authEn, es: authEs },
  categories: { en: categoriesEn, es: categoriesEs },
  charts: { en: chartsEn, es: chartsEs },
  goals: { en: goalsEn, es: goalsEs },
  import: { en: importEn, es: importEs },
  insights: { en: insightsEn, es: insightsEs },
  kit: { en: kitEn, es: kitEs },
  legal: { en: legalEn, es: legalEs },
  month: { en: monthEn, es: monthEs },
  notifications: { en: notificationsEn, es: notificationsEs },
  onboarding: { en: onboardingEn, es: onboardingEs },
  outbox: { en: outboxEn, es: outboxEs },
  payslips: { en: payslipsEn, es: payslipsEs },
  quickAdd: { en: quickAddEn, es: quickAddEs },
  rules: { en: rulesEn, es: rulesEs },
  scan: { en: scanEn, es: scanEs },
  settings: { en: settingsEn, es: settingsEs },
  tags: { en: tagsEn, es: tagsEs },
  transactionForm: { en: transactionFormEn, es: transactionFormEs },
  transactions: { en: transactionsEn, es: transactionsEs },
} satisfies Record<string, Record<AppLang, Translation>>

/** Every scope catalogue keyed like a Transloco path (`'goals/es'`). */
export function scopeCataloguesByPath(): Record<string, Translation> {
  return Object.fromEntries(
    Object.entries(SCOPE_CATALOGUES).flatMap(([scope, catalogues]) =>
      Object.entries(catalogues).map(([lang, catalogue]) => [`${scope}/${lang}`, catalogue])
    )
  )
}
