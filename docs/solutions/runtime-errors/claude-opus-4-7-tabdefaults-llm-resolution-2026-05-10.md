---
title: claude-opus-4-7 surfaces in insight calls because tabDefaults LLM was never patched
date: 2026-05-10
category: docs/solutions/runtime-errors
module: ai-llm-config
problem_type: runtime_error
component: database
symptoms:
  - "Insight route returns UNSUPPORTED_MODEL error from Anthropic"
  - "research_config still references claude-opus-4-7 even after migration 009 ran"
  - "tabDefaults.{exports,research,assistants,operations}.primaryLlm = claude-opus-4-7 with llmVendor: anthropic"
root_cause: incomplete_setup
resolution_type: migration
severity: high
related_components:
  - service_object
tags:
  - llm
  - migration
  - admin-resources
  - rebecca
  - claude
  - gemini
---

# claude-opus-4-7 surfaces in insight calls because tabDefaults LLM was never patched

## Problem

Rebecca's chat-insight route was failing with `UNSUPPORTED_MODEL` errors from Anthropic. Migration 009 had supposedly retired `claude-opus-4-7` from every per-domain LLM config (`chatbotLlm`, `companyLlm`, etc.), but the model identifier was still leaking into runtime LLM calls — and the deprecated model normalizer in `ai/clients.ts` did not know about it.

## Symptoms

- Chat insight calls returned `Anthropic: model claude-opus-4-7 is not supported`
- `global_assumptions.research_config::text LIKE '%claude-opus-4-7%'` still matched after migration 009
- Top-level `research_config.primaryLlm` was already correct, but **`research_config.tabDefaults.{exports,research,assistants,operations}.primaryLlm = "claude-opus-4-7"`** with `llmVendor: "anthropic"`
- The insight route always uses `getGeminiClient()`, so the Anthropic vendor mismatch caused the request to be misrouted

## What Didn't Work

- **Re-running migration 009.** It only patched the per-domain LLM keys (`chatbotLlm`, `companyLlm`, etc.) and the top-level `primaryLlm`/`llmVendor`. It never traversed `research_config.tabDefaults.*`.
- **Assuming the normalizer covered it.** `DEPRECATED_MODEL_MAP` in `artifacts/api-server/src/ai/clients.ts` had entries for older Claude IDs (`claude-3-5-sonnet`, `claude-3-opus-20240229`) but not the synthetic `claude-opus-4-7` placeholder, so `normalizeModelId("claude-opus-4-7")` returned the deprecated string unchanged.

## Solution

Two complementary fixes, applied together:

### 1. Code safety net — extend the deprecated model map

`artifacts/api-server/src/ai/clients.ts`:

```ts
const DEPRECATED_MODEL_MAP: Record<string, string> = {
  "claude-3-5-sonnet-20241022": "claude-sonnet-4-5",
  "claude-3-5-sonnet": "claude-sonnet-4-5",
  "claude-3-opus-20240229": "claude-sonnet-4-5",
  "claude-opus-4-7": "claude-sonnet-4-5", // ← added
};
```

Now any future row that still leaks `claude-opus-4-7` is normalized at call time.

### 2. DB fix — new migration `admin-resources-010`

`artifacts/api-server/src/migrations/admin-resources-010.ts` patches all four `tabDefaults.*` paths in a single idempotent UPDATE, gated by `WHERE research_config::text LIKE '%claude-opus-4-7%'`:

```ts
UPDATE global_assumptions
SET research_config = jsonb_set(
  jsonb_set(
    /* ...nested for exports/research/assistants/operations... */
    '{tabDefaults,operations,llmVendor}',
    '"google"'::jsonb,
    true
  ),
  /* ... */
)
WHERE research_config::text LIKE '%claude-opus-4-7%'
```

Registered in `artifacts/api-server/src/index.ts` immediately after `admin-resources-009`.

After the API server restart, the deep search returned **no `claude-opus` strings anywhere** in `research_config`.

## Why This Works

The LLM resolver (`artifacts/api-server/src/ai/resolve-llm.ts`) walks a fallback chain:

```
cfg.primaryLlm  →  tabDef.primaryLlm  →  defaults.model
```

For `chatbotLlm` (used by the insight route), `cfg.primaryLlm` was `null`, so the resolver fell through to `tabDefaults.assistants.primaryLlm = "claude-opus-4-7"` with vendor `"anthropic"`. The request was sent to Anthropic with an unknown model identifier, which Anthropic rejected.

Patching `tabDefaults` removes the bad value at the source. The normalizer entry is the belt-and-suspenders safety net for any other code path or future seed that recreates the leak.

## Prevention

- **When a migration retires a deprecated model, scan every JSONB path that can store a model identifier** — not just the top-level keys. For `global_assumptions.research_config`, the audit must include both per-domain `*Llm` keys *and* `tabDefaults.{exports,research,assistants,operations}`. A single `WHERE research_config::text LIKE '%<deprecated>%'` query against the live DB is the fastest way to find leaks.

- **Always pair a DB migration with a `DEPRECATED_MODEL_MAP` entry.** The map is the only thing that catches values still living in user-edited rows, scenario snapshots, exported configs, or freshly-seeded environments. Without it, the bug returns the next time someone restores from a backup or seeds a fresh tenant.

- **The `executeSql()` notebook callback hits Replit's built-in DB, not Neon.** Verify any DB query against the real Neon DB by writing a one-off Node script that uses `process.env.POSTGRES_URL` with the `pg` client from `artifacts/api-server/node_modules/pg`. See `replit.md` § Gotchas.

- **For deep JSONB inspection, walk the object client-side.** A recursive `search(obj, path)` helper is far more reliable than chained PostgreSQL operators when you don't know which sub-path holds the offending string.

## Related Issues

- `docs/solutions/database-issues/drizzle-migration-state-drift-missing-tables-2026-05-07.md` — sibling migration-state hygiene learning
- `docs/solutions/database-issues/replit-managed-db-vs-neon-postgres-url-2026-05-02.md` — why `executeSql()` lies about DB queries
- `replit.md` § Gotchas — Drizzle migration state sync runbook
