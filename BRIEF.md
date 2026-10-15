# monkimoney: product brief

What the app is, who it is for and the decisions that shape the code. The
how lives in `docs/ARCHITECTURE.md` (system design) and `docs/CONTRACTS.md`
(API and data contracts).

## What and for whom

monkimoney is a finance app for **a couple sharing household finances in
AUD**. It is a PWA, installable on Android and iPhone, mobile first and
bilingual (es-MX and en-AU).

The problem: a couple that wants to know where their money goes each month
ends up typing every bank movement by hand, a chore that gets abandoned
within weeks. General budgeting tools either assume one person or make
manual entry the main path.

The first version succeeds when the couple can:

- record an expense, income or transfer in **under 10 seconds**;
- import their bank's CSV export (NAB today) **once a month without
  duplicates**, correcting only the exceptions;
- see a **monthly breakdown by category and by person**.

Secondary goal: the architecture is ready to become a product for many
households (open registration, partner invitations, billing) without
rewriting the core.

## Product principles

1. **Zero friction.** Every feature is judged by how much manual work it
   removes. Entering a movement must work in a supermarket queue.
2. **Feels smart, not like a spreadsheet.** Useful insights, concrete
   suggestions and charts worth looking at, never a transaction table with
   another name.
3. **Kind tone.** Summaries and suggestions are friendly and never scold.
4. **The household is the unit.** Reports show the household total and can
   be filtered by person; each partner has their own login.
5. **Privacy by default.** A person can mark a movement private; personal
   data never enters the repository (fixtures are synthetic, real values
   live in environment variables).

## Features

P1 is the MVP; P2 and P3 come later.

| #   | Feature                     | Priority | Detail                                                                                                                                                                                                              |
| --- | --------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Quick manual entry          | P1       | Expense, income or transfer on one screen: amount, account, category, who, optional note.                                                                                                                           |
| 2   | Accounts and transfers      | P1       | Accounts per person or joint (transaction, savings, wallet). Moving money to savings is a transfer, never spending.                                                                                                 |
| 3   | Categories and monthly view | P1       | Category groups and subcategories. Monthly view: total per category, per person and for the household.                                                                                                              |
| 4   | Bank CSV import             | P1       | Upload the internet-banking CSV. Duplicate detection against hand entries (amount, date window, account) with a confirmation screen for doubtful cases. Category suggestions from learned rules first, then an LLM. |
| 5   | Receipt scanner             | P2       | Photo of a receipt: the LLM returns date, store, total and lines classified by category, saved as a split transaction after the person reviews it.                                                                  |
| 6   | Savings goals               | P2       | A goal with an amount and a date, and a projection from the average of recent months.                                                                                                                               |
| 7   | Insights                    | P2       | A monthly summary written by the LLM: where the money went, what changed against last month, one or two kind suggestions.                                                                                           |
| 8   | Envelope budgeting          | P3       | A monthly amount per category and what is left of it.                                                                                                                                                               |
| 9   | Entry from a chat app       | P3       | Only if the app itself turns out not to be convenient enough.                                                                                                                                                       |
| 10  | Multi-household and billing | P3       | Open registration, partner invitation, subscription. The data model supports it from day one.                                                                                                                       |

## Money model

- **One currency: AUD.** Amounts are stored with their currency code so
  multi-currency stays possible, but it is not a requirement.
- Every transaction has a kind (expense, income, transfer), an account, a
  category, a date, an amount and a person.
- **A transfer never counts as spending or income** in any report.
- A transaction can be split into lines with different categories (what the
  receipt scanner produces).
- No credit cards in the MVP, so no debt or statement dates to model.

## Decisions that matter for contributors

- **Own ledger.** Accounts, transactions, splits, categories and transfers
  are our own Postgres tables behind our own API, with no third-party
  ledger underneath. Single-user ledgers do not fit a multi-household
  product, the MVP needs only a handful of tables, and one API means one
  data model. Borrowed ideas: category groups and envelope budgeting from
  common budgeting apps, and import deduplication by a hash of date,
  amount, description and account.
- **Multi-tenant from day one.** Everything hangs from `household_id`;
  users belong to a household through memberships with roles. In the MVP a
  user belongs to one household.
- **Same-origin cookie session.** One Docker image: the AdonisJS API serves
  the Angular build. The app is stateless (files in S3-compatible storage).
- **Swappable LLM provider.** One `LlmProvider` interface; provider, model
  and key come from environment variables and any Anthropic-compatible
  endpoint works (`docs/llm.md`). The LLM always runs on the server, never
  in the client, and receipt photos are deleted right after the scan.
- **SaaS basics from the start:** email verification, password reset,
  registration gated by `REGISTRATION_OPEN`, an LLM quota per household,
  data export and deletion.
- **Offline is out of the MVP**, but every create carries an idempotent
  `client_id` so an outbox can be added without changing the API.
- **Private movements** (`is_private`) are masked for the other partner.
- **iPhone limits are accepted:** no reliable push for PWAs, and the camera
  opens through `<input type="file" capture>`, which is enough for the
  scanner.
- **Quality bar:** Japa, Vitest, Playwright E2E and a Bruno smoke run
  behind `npm run verify`; Conventional Commits drive release-please and
  `CHANGELOG.md`.

## MVP scope and phases

The MVP is done when the couple records a full month of movements and the
app shows where the money went.

| Phase                 | Delivers                                                                                  | Done when                                                      |
| --------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 1. Foundation         | Monorepo, Postgres, auth, multi-household data model, deploy, installable PWA             | Both partners log in from their phones with the app installed. |
| 2. Recording          | Accounts, categories, manual expense/income/transfer, monthly view by category and person | A real month captured by hand.                                 |
| 3. Import             | Bank CSV upload, matching against hand entries, confirmation of doubtful rows             | A real export imported without duplicates.                     |
| 4. Scanner            | Receipt photo to split transaction, reviewed before saving                                | Ten supermarket receipts read correctly.                       |
| 5. Goals and insights | Savings goals with projection, monthly summary written by the LLM                         | A first useful monthly summary.                                |
| 6. Product            | Open registration, partner invitation, subscription                                       | Only if the app is offered to other households.                |
