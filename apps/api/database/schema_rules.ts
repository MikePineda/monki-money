import { type SchemaRules } from '@adonisjs/lucid/types/schema_generator'

/**
 * Rules for the generated `database/schema.ts` (regenerated after every
 * `migration:run` outside production).
 *
 * - DATE columns are 'YYYY-MM-DD' strings (see providers/pg_types_provider.ts).
 * - BIGINT is a number (same provider).
 * - Native enums and jsonb columns get the literal types of @monkimoney/shared.
 */
const shared = (name: string) => ({
  tsType: name,
  imports: [{ source: '@monkimoney/shared', typeImports: [name] }],
  decorators: [{ name: '@column' }],
})

export default {
  types: {
    date: { tsType: 'string', imports: [], decorators: [{ name: '@column' }] },
    bigint: { tsType: 'number', imports: [], decorators: [{ name: '@column' }] },
  },
  tables: {
    households: {
      columns: {
        plan: shared('HouseholdPlan'),
        status: shared('HouseholdStatus'),
        settings: shared('HouseholdSettings'),
        locale: shared('Locale'),
      },
    },
    users: {
      columns: {
        theme: shared('Theme'),
        locale: shared('Locale'),
      },
    },
    household_members: {
      columns: {
        role: shared('MemberRole'),
      },
    },
    invitations: {
      columns: {
        role: shared('MemberRole'),
      },
    },
    accounts: {
      columns: {
        kind: shared('AccountKind'),
      },
    },
    category_groups: {
      columns: {
        kind: shared('CategoryGroupKind'),
      },
    },
    transactions: {
      columns: {
        kind: shared('TransactionKind'),
        status: shared('TransactionStatus'),
        source: shared('TransactionSource'),
        // jsonb array: stringified on write (see database/json_column.ts).
        tags: {
          tsType: 'string[]',
          imports: [{ source: '#database/json_column', namedImports: ['jsonColumn'] }],
          decorators: [{ name: '@jsonColumn' }],
        },
      },
    },
    llm_usage: {
      columns: {
        purpose: shared('LlmPurpose'),
        status: shared('LlmUsageStatus'),
      },
    },
  },
} satisfies SchemaRules
