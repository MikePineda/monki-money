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

| Step              | Call                                                                                                                                                        | Notes                                                                                                                                                                                                                                                                                                                                   |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Read the upload   | `parseBankCsv(buffer): { source, rows: ParsedRow[] }` (`#importers/registry`)                                                                               | Cap the multipart read at `MAX_CSV_BYTES` (2 MB); `MAX_CSV_ROWS` = 20 000. Throws `CsvImportError` subclasses (422, `code` `E_CSV_TOO_LARGE`, `E_CSV_TOO_MANY_ROWS`, `E_CSV_ENCODING`, `E_CSV_UNKNOWN_FORMAT`, `E_CSV_MALFORMED`, `E_CSV_INVALID_VALUE`, with `line` / `column`). Add the `errors.E_CSV_*` translations.                |
| Split by account  | `groupByAccountNumber(rows): Map<accountNumber, ParsedRow[]>`                                                                                               | One batch per account; unknown numbers -> 422 with the list to map.                                                                                                                                                                                                                                                                     |
| Stage             | `stageRows(rows, { accountId, today, payers? }): StagedRow[]`                                                                                               | File order matters (occurrence). `payers = { accountOwnerUserId, cardOwners: Map<suffix, userId>, fallbackUserId }`.                                                                                                                                                                                                                    |
| Resolve           | `resolveRows(staged, context, defaultResolverSteps(chain)): Promise<ResolvedRow[]>`                                                                         | `context = { existingHashes, candidates: CandidateTx[], transferLegs: TransferLeg[], rules: MerchantRule[] }`. Staging chain: `new CategorySuggesterChain([new RuleSuggester(rules), new NabCategorySuggester(mapNabCategory, categoryIdBySlug), new NoneSuggester()])`.                                                                |
| Classify (job)    | same chain with `new LlmSuggester(classify, categoryIdBySlug)` before `NoneSuggester`, over `suggestionInputFor(row)` of rows whose suggestion needs review | `classify(requests)` wraps `LlmProvider.classifyTransactions`: `ClassifyRow { id: String(index), date, amountCents, description, merchant, bankCategory: nabCategory }` and back `{ index: Number(id), slug: categorySlug, confidence, payee }`. Batches of 50; only known slugs; confidence >= 0.8 is trusted; quota errors propagate. |
| Confirm           | `learnRules(decisions, existingRules): RuleUpsert[]`                                                                                                        | Upsert on `(household, 'merchant', merchantFullKey)`; `existingRuleId` says which rule is overwritten.                                                                                                                                                                                                                                  |
| Reconcile         | `balanceChainBreaks(rows)`, `openingBalanceCents(rows)`                                                                                                     | First import of an account: opening = oldest balance - its amount.                                                                                                                                                                                                                                                                      |
| Seed system rules | `resolveSystemRules(NAB_SYSTEM_RULES, { categoryIdBySlug, accounts })`                                                                                      | Skips targets the household lacks or has twice.                                                                                                                                                                                                                                                                                         |

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

The service adds two filters before `learnRules`: a guess nobody looked at
(a suggestion still under review that the person did not change) teaches
nothing, and rows a person decided go last, so their decision wins over
the guesses for the same merchant. `PATCH /transactions/:id` with
`applyToFuture: true` and a category learns the same kind of rule from the
bank row the transaction came from (`RuleLearner.learnFromEdit`).

## The import service (`app/services/imports`)

Endpoints and shapes: [CONTRACTS.md](CONTRACTS.md#bank-imports-and-merchant-rules).

| Piece                 | Does                                                                                                                                                                                                                                                                                                                                         |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ImportStager`        | `POST /imports`: parse, map `Account Number` -> account (or `accountId`, which remembers the number), plan limit (`importsPerMonth`), one staged batch per account (409), stage + resolve every account first (one account's row may be the other leg of another's transfer), then one DB transaction for batches and rows; archive the CSV. |
| `ImportContextLoader` | `ResolverContext` from the database: stored hashes, candidates, transfer legs, rules, payers.                                                                                                                                                                                                                                                |
| `ImportDecisions`     | `PATCH /imports/:id/rows/:rowId`: stores the person's decision in `import_rows.decision` (jsonb; absent keys keep the proposal) and validates it; confirm validates again.                                                                                                                                                                   |
| `ImportConfirmer`     | `POST /imports/:id/confirm`: one transaction with the batch `FOR UPDATE`; `review.ts` (pure) says what each row becomes.                                                                                                                                                                                                                     |
| `ImportClassifier`    | Run by `ClassifyImportRowsJob` (`@adonisjs/queue`, inline with `QUEUE_DRIVER=sync`).                                                                                                                                                                                                                                                         |
| `ImportBookkeeping`   | Batch counts by resolution; ledger balance for the reconciliation.                                                                                                                                                                                                                                                                           |
| `ImportArchive`       | The original CSV at `imports/{householdId}/{batchId}.csv` when `DRIVE_DISK` is set (best effort).                                                                                                                                                                                                                                            |

- **Upload**: `POST /imports` is in `bodyparser.multipart.processManually`;
  the controller reads the `file` part into memory and aborts past 2 MB
  (`E_CSV_TOO_LARGE`). Nothing touches the container's disk.
- **Candidates**: the account's ledger rows in the date window that no
  posted bank row of this account claims: unlinked rows, and rows linked
  only to pending bank rows (a pending import, or a hand entry matched while
  pending), which the matcher sees as pending imports so the posted copy
  upgrades them. A transfer leg created while importing another account
  (source `import`, unlinked here) is offered as a hand entry, so the other
  account's own export later matches it instead of duplicating it.
- **Transfer legs**: standalone expenses/income of the other accounts
  (never rows already in a transfer, never another member's private row)
  and the new rows of the other accounts of the same upload.
- **Stale holds**: at staging, a ledger row still pending from an earlier
  export whose bank row is missing from this one (its dates covered, no
  row of this export claiming it) is flagged `needs_review`: the bank
  dropped or changed the hold.
- **Decisions**: a picked `matchTransactionId` must have the row's amount
  and account and not be the copy of a posted bank row nor picked by
  another row of the batch (or of the same confirm); a 0.00 row can only be
  `ignored`. `PATCH` locks the batch like confirm does.
- **Privacy**: rows linked to the partner's private transaction are
  masked in `GET /imports/:id` (`isMasked`), like the ledger.
- **Payer**: personal account -> its owner; joint account -> the card
  holder; a joint row without a card (BPAY, transfers, salary) is joint
  (`null`), unless a rule says otherwise.
- **Confirm**: `new` -> expense/income (`source: import`, `pending` while
  NAB shows no `Processed On`); `auto_matched` -> stamps bank date, bank
  text, card and the bank's status (pending or cleared) on the existing
  row (a row linked to a pending bank row is upgraded and that row
  `superseded`; a proposed match deleted meanwhile
  becomes a new row); `transfer_leg` -> a `transfers` row with this
  account's leg plus the other leg: the standalone movement found at
  staging (turned into a leg), the other account's row of the same upload
  (linked and confirmed with it) or a new leg; `ignored` stays stored.
  `needs_confirmation` rows block the confirm (422 with their ids) until a
  person picks `new`, `auto_matched` (+ `matchTransactionId`),
  `transfer_leg` (+ `transferAccountId`) or `ignored`.
- **Opening balance**: on the account's first import (no opening date, zero
  opening, no earlier batch) the batch keeps `openingBalanceCents(rows)`;
  confirm stores it with `opening_balance_date` = the day before the
  earliest date of the batch or of the ledger rows it linked (a hand entry
  dated before its bank copy), so every one of them counts after it.
- **Concurrency**: confirm locks its batch and the other staged batches of
  the same upload in id order; a deadlock still answers 409
  `E_CONCURRENT_UPDATE`. Learned rules are upserted (`ON CONFLICT`), so two
  confirms learning one merchant never collide.
- **Regex rules** must pass `isSafeRulePattern` (no nested or alternated
  repetition, no backreferences, at most 200 characters); an unsafe stored
  one never runs, and rules only read the first 300 characters of a row.
- **Classify** claims the batch (`classify_started_at`, 409 while another
  run holds it, taken over after 10 minutes), handles at most 500 rows per
  run and saves every 40-row model call as it returns.
- **Reconciliation**: bank balance on the newest row vs opening + ledger
  rows with `COALESCE(bank_date, date) <= dateTo` (pending included).
- **System rules** (`SystemRulesSeeder`, insert-only): category rules when
  a household is created, all of them (transfer rules need the accounts) in
  the production bootstrap and on the household's first import.
- **Deleting** an imported transaction marks its bank row `ignored`, so a
  re-import never brings it back.
- **Backfill**: `node ace import:nab <file> --account <number|id>
--household <id> [--confirm-auto]` (stages as the owner; `--confirm-auto`
  confirms what `isAutoConfirmable` allows and leaves the rest staged).
