# Bank import pipeline

Pure code in `apps/api/app/importers` (bank CSV strategies) and
`apps/api/app/domain/importing` (no Lucid, no I/O, `today` injected). The
import service owns the database: it loads the context, calls these
functions and stores the result in `import_batches` / `import_rows`.

```
buffer --parseBankCsv--> ParsedRow[] --groupByAccountNumber--> per account:
  stageRows --> StagedRow[] --resolveRows(steps)--> ResolvedRow[]  (staging, < 1 s)
  classify job: CategorySuggesterChain + LlmSuggester on rows still under review
  confirm: user decisions --learnRules--> RuleUpsert[]
```

## Calls, in order

| Step              | Call                                                                                                                                                        | Notes                                                                                                                                                                                                                                                                                                                    |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Read the upload   | `parseBankCsv(buffer): { source, rows: ParsedRow[] }` (`#importers/registry`)                                                                               | Cap the multipart read at `MAX_CSV_BYTES` (2 MB); `MAX_CSV_ROWS` = 20 000. Throws `CsvImportError` subclasses (422, `code` `E_CSV_TOO_LARGE`, `E_CSV_TOO_MANY_ROWS`, `E_CSV_ENCODING`, `E_CSV_UNKNOWN_FORMAT`, `E_CSV_MALFORMED`, `E_CSV_INVALID_VALUE`, with `line` / `column`). Add the `errors.E_CSV_*` translations. |
| Split by account  | `groupByAccountNumber(rows): Map<accountNumber, ParsedRow[]>`                                                                                               | One batch per account; unknown numbers -> 422 with the list to map.                                                                                                                                                                                                                                                      |
| Stage             | `stageRows(rows, { accountId, today, payers? }): StagedRow[]`                                                                                               | File order matters (occurrence). `payers = { accountOwnerUserId, cardOwners: Map<suffix, userId>, fallbackUserId }`.                                                                                                                                                                                                     |
| Resolve           | `resolveRows(staged, context, defaultResolverSteps(chain)): Promise<ResolvedRow[]>`                                                                         | `context = { existingHashes, candidates: CandidateTx[], transferLegs: TransferLeg[], rules: MerchantRule[] }`. Staging chain: `new CategorySuggesterChain([new RuleSuggester(rules), new NabCategorySuggester(mapNabCategory, categoryIdBySlug), new NoneSuggester()])`.                                                 |
| Classify (job)    | same chain with `new LlmSuggester(classify, categoryIdBySlug)` before `NoneSuggester`, over `suggestionInputFor(row)` of rows whose suggestion needs review | `classify(requests)` adapts `app/llm`; batches of 50; only known slugs; confidence >= 0.8 is trusted. Degrade inside `classify`, throw only to abort (quota).                                                                                                                                                            |
| Confirm           | `learnRules(decisions, existingRules): RuleUpsert[]`                                                                                                        | Upsert on `(household, 'merchant', merchantFullKey)`; `existingRuleId` says which rule is overwritten.                                                                                                                                                                                                                   |
| Reconcile         | `balanceChainBreaks(rows)`, `openingBalanceCents(rows)`                                                                                                     | First import of an account: opening = oldest balance - its amount.                                                                                                                                                                                                                                                       |
| Seed system rules | `resolveSystemRules(NAB_SYSTEM_RULES, { categoryIdBySlug, accounts })`                                                                                      | Skips targets the household lacks or has twice.                                                                                                                                                                                                                                                                          |

Column mapping: `ResolvedRow` -> `import_rows`: `resolution`, `match_transaction_id`,
`match_score`, `suggested_category_id` / `suggestion_source` /
`suggestion_confidence` (from `suggestion`), `suggested_transfer_account_id`
(`transfer.counterpartAccountId`), `suggested_paid_by_user_id` (`paidByUserId`);
`StagedRow` gives `external_hash`, `bank_date`, `date`, `amount_cents`,
`balance_cents`, `description_raw` (`detailsRaw`), `description_normalized`,
`merchant_key`, `nab_category`, `nab_merchant`, `card_suffix`, `is_pending`, `raw`.

## Row identity (hash)

`external_hash = sha256(accountNumber|bankDate|amountCents|detailsRaw|balanceCents|occurrence)`:
ISO bank date, integer cents, details as written in the file (trimmed, HTML
entities not decoded), empty string for a missing balance, and `occurrence`
= 1-based rank of the row among rows identical on the other five fields, in
file order. Identical purchases differ by running balance; zero-amount twins
(same balance) by occurrence. Re-exporting the same period gives the same
hashes, so re-importing is all `duplicate` (ignored rows included: an
`ignored` hash never comes back).

## Resolver chain

`DuplicateStep -> ZeroAmountStep -> TransferStep -> MatchStep -> SuggestCategoryStep`

1. **Duplicate**: hash already stored for the account -> `duplicate`.
2. **Zero amount** (card checks, cancelled holds) -> `ignored`.
3. **Transfer**: the winning rule decides first (`transferAccountId` -> transfer;
   category -> not a transfer). Otherwise NAB `Internal transfers` or the
   `Linked Acc Trns` memo. The other account holds the opposite amount within
   +/- 2 days (closest wins, one row per leg), else the rule's account. Known
   account -> `transfer_leg` (no leg in the ledger: confirm creates it), unknown
   -> `needs_confirmation`. PayID to friends (`Transfers in/out`) are spending/income.
4. **Match** against `CandidateTx` (same account, same amount, date in
   `[date - 3, bankDate + 1]`, `manual|receipt|telegram`, or `import` still
   `pending`). Score: date +40 exact / +30 within 2 days / +15 within 3 (to the
   purchase or posting date, whichever is closer); payee similarity
   (token Jaro-Winkler) up to +40; same card or payer +5; only candidate +15.
   Tiers: >= 80 `auto_matched`; 50-79 `needs_confirmation`; < 50 unchanged;
   two candidates >= 80 -> `needs_confirmation`. A batch never claims a
   candidate twice. Future-dated rows are never auto-matched.
5. **Suggest category** for rows that will become new spending/income
   (rule -> NAB map -> LLM -> none; a trusted answer stops the chain, a later
   link replaces a tentative one when trusted or more confident).

`needsReview` = flag for the resulting transaction (future date, category
under review). `reasons` explains the outcome to the review screen.

## Pending -> posted

NAB rows with an empty `Processed On` are pending and change type, details and
sometimes date when they post (`EFTPOS DEBIT POS 26/09 KMART ...` ->
`MISCELLANEOUS DEBIT V1111 26/09 KMART ... <auth>`), so the hash changes.
Import them as `status = 'pending'` transactions and offer them as
`CandidateTx { source: 'import', status: 'pending' }`. When the posted row
matches one, `upgradesPendingTransaction` is true: on confirm, update that
transaction with the posted row (`status = 'cleared'`, `bank_date`,
`raw_description`, card) and mark its old import row `superseded`.

## Learning

On confirm, `create` / `transfer` rows teach a `merchant` rule (pattern =
full merchant key, `created_by = 'system'`) when the final category or
transfer account differs from the suggestion, the suggestion did not come
from a rule (LLM, NAB map, none), or the user changed the payer. Matched,
ignored, uncategorized and opted-out rows teach nothing; the last decision
for a merchant in a batch wins.
