-- Read-only production numbers for the /pulse skill. Aggregates and ids only:
-- never select emails, names, payees or amounts per person.
--
-- ssh "$MONKIMONEY_SSH_HOST" 'docker exec -i $(docker ps -q -f name=monkimoney-db) \
--   psql -U monkimoney -d monkimoney -X -q -v ON_ERROR_STOP=1 -f -' < .claude/skills/pulse/pulse.sql
--
-- Tables that later work packages create (transactions, llm_usage) are
-- guarded with to_regclass + \if, so the file runs on any schema version.

SET default_transaction_read_only = on;
SET statement_timeout = '15s';
\pset footer off

\echo '== households'
SELECT status,
       count(*) AS households,
       count(*) FILTER (WHERE created_at > now() - interval '7 days') AS new_7d
FROM households
GROUP BY status
ORDER BY status;

\echo '== users'
SELECT count(*) AS users,
       count(*) FILTER (WHERE email_verified_at IS NOT NULL) AS verified,
       count(*) FILTER (WHERE created_at > now() - interval '7 days') AS new_7d
FROM users;

\echo '== accounts'
SELECT count(*) AS accounts,
       count(*) FILTER (WHERE is_active) AS active
FROM accounts;

SELECT to_regclass('public.transactions') IS NOT NULL AS has_transactions \gset
\if :has_transactions
\echo '== transactions (rows created)'
SELECT count(*) FILTER (WHERE created_at > now() - interval '24 hours') AS last_24h,
       count(*) FILTER (WHERE created_at > now() - interval '7 days') AS last_7d,
       count(*) AS total,
       max(created_at) AS newest
FROM transactions;
\else
\echo '== transactions: table not created yet (ledger not deployed)'
\endif

SELECT to_regclass('public.llm_usage') IS NOT NULL AS has_llm_usage \gset
\if :has_llm_usage
\echo '== llm_usage, this month (UTC) by household and purpose'
SELECT coalesce(household_id::text, 'operator') AS household,
       purpose,
       count(*) AS calls,
       count(*) FILTER (WHERE status <> 'ok') AS failed,
       sum(input_tokens) AS input_tokens,
       sum(output_tokens) AS output_tokens,
       round(avg(latency_ms)) AS avg_ms,
       round(sum(cost_micros) / 1000000.0, 4) AS cost_usd
FROM llm_usage
WHERE created_at >= date_trunc('month', now())
GROUP BY 1, 2
ORDER BY 1, 2;

\echo '== llm_usage, last 24 hours by status'
SELECT status,
       count(*) AS calls,
       max(created_at) AS newest
FROM llm_usage
WHERE created_at > now() - interval '24 hours'
GROUP BY status
ORDER BY status;

\echo '== llm_usage, last 3 failures'
SELECT created_at,
       purpose,
       model,
       status,
       left(error_message, 160) AS error
FROM llm_usage
WHERE status <> 'ok'
ORDER BY created_at DESC
LIMIT 3;
\else
\echo '== llm_usage: table not created yet (LLM package not deployed)'
\endif
