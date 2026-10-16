import type { HouseholdDirectory } from '../../../core/household/household-directory.store'
import type { ImportRowContext } from './import-row.view'

/** Translates a full key of the `import` scope (the scope is loaded by the page). */
export type Translate = (key: string, params?: Record<string, string | number>) => string

/**
 * The words and lookups every import row needs, from the `import`
 * catalogue and the household directory. Keys used here, for
 * transloco-keys-manager:
 * t(import.status.auto, import.status.ready, import.status.review, import.status.new)
 * t(import.status.transfer, import.status.ignored, import.status.duplicate)
 * t(import.row.duplicateOf, import.row.duplicateIgnored)
 * t(import.row.private, import.row.uncategorized, import.row.transferUnknown)
 * t(import.source.rule, import.source.bank, import.source.ai, import.source.aiConfidence)
 * t(import.row.split, import.row.transferTo, import.row.transferGuessed, import.row.matches)
 * t(import.row.possibleMatch)
 * t(import.row.suggestion, import.row.select, import.people.you, import.people.joint)
 */
export function importRowContext(
  t: Translate,
  locale: string,
  directory: HouseholdDirectory
): ImportRowContext {
  const personLabel = (userId: number | null): string => {
    if (userId === null) {
      return t('import.people.joint')
    }
    if (userId === directory.youId()) {
      return t('import.people.you')
    }
    return directory.partner()?.userId === userId ? directory.partnerName() : ''
  }
  return {
    locale,
    labels: {
      auto: t('import.status.auto'),
      ready: t('import.status.ready'),
      review: t('import.status.review'),
      new: t('import.status.new'),
      transfer: t('import.status.transfer'),
      ignored: t('import.status.ignored'),
      duplicate: t('import.status.duplicate'),
      duplicateOf: (date, amount) => t('import.row.duplicateOf', { date, amount }),
      duplicateIgnored: t('import.row.duplicateIgnored'),
      private: t('import.row.private'),
      uncategorized: t('import.row.uncategorized'),
      transferUnknown: t('import.row.transferUnknown'),
      bySource: {
        rule: t('import.source.rule'),
        nab_map: t('import.source.bank'),
        llm: (percent) =>
          percent === null ? t('import.source.ai') : t('import.source.aiConfidence', { percent }),
      },
      split: (count) => t('import.row.split', { count }),
      transferTo: (account) => t('import.row.transferTo', { account }),
      transferGuessed: (account) => t('import.row.transferGuessed', { account }),
      matches: (payee) => t('import.row.matches', { payee }),
      possibleMatch: (payee) => t('import.row.possibleMatch', { payee }),
      suggestion: (category) => t('import.row.suggestion', { category }),
      select: (title, amount) => t('import.row.select', { title, amount }),
    },
    category: (id) => directory.category(id)?.category.name ?? null,
    account: (id) => directory.account(id)?.name ?? null,
    person: (userId) => directory.personOf(userId),
    personLabel,
  }
}
