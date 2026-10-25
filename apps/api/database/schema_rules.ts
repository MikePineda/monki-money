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

/** A jsonb column typed with a DTO of the LLM layer (app/llm/types.ts). */
const llmJson = (tsType: string, name: string) => ({
  tsType,
  imports: [
    { source: '#database/json_column', namedImports: ['jsonColumn'] },
    { source: '#llm/types', typeImports: [name] },
  ],
  decorators: [{ name: '@jsonColumn' }],
})

/** A jsonb column typed as `tsType`, stringified on write. */
const json = (tsType: string) => ({
  tsType,
  imports: [{ source: '#database/json_column', namedImports: ['jsonColumn'] }],
  decorators: [{ name: '@jsonColumn' }],
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
    savings_goals: {
      columns: {
        status: shared('GoalStatus'),
      },
    },
    monthly_insights: {
      columns: {
        locale: shared('Locale'),
        // jsonb: stringified on write (see database/json_column.ts).
        highlights: llmJson('InsightHighlight[]', 'InsightHighlight'),
        input_json: llmJson('InsightInput', 'InsightInput'),
      },
    },
    import_batches: {
      columns: {
        source: shared('ImportSource'),
        status: shared('ImportBatchStatus'),
      },
    },
    import_rows: {
      columns: {
        resolution: shared('ImportResolution'),
        // Nullable columns get `| null` from the generator.
        proposed_resolution: shared('ImportResolution'),
        suggestion_source: shared('SuggestionSource'),
        // jsonb: stringified on write (see database/json_column.ts).
        raw: json('Record<string, string>'),
        reasons: json('string[]'),
        transfer_candidate_account_ids: json('number[]'),
        decision: {
          tsType: 'ImportRowDecision',
          imports: [
            { source: '@monkimoney/shared', typeImports: ['ImportRowDecision'] },
            { source: '#database/json_column', namedImports: ['jsonColumn'] },
          ],
          decorators: [{ name: '@jsonColumn' }],
        },
      },
    },
    merchant_rules: {
      columns: {
        match_type: shared('RuleMatchType'),
        origin: shared('RuleOrigin'),
      },
    },
    recurring_items: {
      columns: {
        cadence: shared('RecurringCadence'),
        status: shared('RecurringStatus'),
        source: shared('RecurringSource'),
        // jsonb: stringified on write (see database/json_column.ts).
        edited_fields: json('string[]'),
      },
    },
    push_subscriptions: {
      columns: {
        // The naming strategy would look for `p_256_dh`.
        p256dh: {
          tsType: 'string',
          imports: [],
          decorators: [{ name: '@column', args: { columnName: 'p256dh' } }],
        },
      },
    },
  },
} satisfies SchemaRules
