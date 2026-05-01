---
name: session-plans
description: Verify-before-execute discipline for any session plan, task brief, or directive that proposes work which may already be done. Triggered whenever a plan arrives that says "create X", "scrape Y", "build Z" — before the first tool call, prove the work is not already complete.
priority: high
---

# Session Plans — Verify Before Executing

## When this applies
Any time a session plan, task brief, or external directive arrives describing work to perform — especially work that creates database tables, runs scrapers, generates reports, or seeds data. Plans get reused, regenerated, and re-sent. They are not proof that the work is needed.

## The rule
**Before the first execution tool call, run a state check.** Compare what the plan claims to do against what already exists.

For each artifact the plan would produce, check the corresponding evidence:

| Plan claims it will produce | Evidence to check first |
|---|---|
| A new DB table | `SELECT table_name FROM information_schema.tables WHERE table_name = '…'` |
| Rows in a table | `SELECT COUNT(*) FROM …` and a recency filter (`MAX(created_at)`) |
| A new file (script, schema, doc, report) | `ls` the path; if missing, also grep for similar names — projects often use `shared/schema/foo.ts` when a plan said `shared/foo-schema.ts` |
| A web scrape | Both: the output table count AND the report file `mtime`. Either one alone can mislead. |
| A migration | `information_schema.columns` for the new columns the plan adds |
| A documented decision | grep the doc file for a sentinel phrase from the plan |

If state matches, **refuse the plan** and report what already exists. Do not no-op the scraper "to be safe" — idempotency is a property of the script, not a guarantee from the plan author. Re-running may duplicate or simply waste minutes.

## What "refuse" looks like
A short, factual reply:

1. State that the work appears already complete.
2. List the evidence (counts, file paths, timestamps).
3. Note any drift between the plan's named paths and the actual paths (e.g. plan said `shared/billing-schema.ts`; actual file is `shared/schema/replit-billing.ts`).
4. Pivot back to the actual current task or ask the user what they meant.

Do not start executing partial steps "in case some are missing." Either every step has evidence of completion (refuse the plan), or there's a real gap (do that gap and only that gap).

## Pattern triggers
This pattern is most likely to fire when:
- A plan arrives that mentions an explicit token, UUID, or external resource that has the smell of having been used before.
- The current session memory or `progress` notes already log the same outcome.
- The plan was clearly authored by another agent or another session.
- The plan's `Acceptance` lines describe end-states that a state check can directly query.

## Anti-patterns
- **"I'll just run it; it's idempotent"** — even idempotent scripts re-hit external APIs, re-spawn browsers, and burn budget.
- **"The user sent the plan, so they want it run"** — users forward plans without reviewing them; the agent's job is to verify before acting.
- **"I'll do task T001 just to confirm"** — T001 has its own side effects (installing packages, mutating the Replit container). Verify by querying state, not by executing the plan's first task.

## Acceptance for this skill itself
You have followed this skill correctly when, on receiving any session plan, your first message contains either:
- Evidence that the work is already done + a refusal + a pivot, OR
- Evidence that the work is not done + a one-line confirmation that you're proceeding.

A plan that arrives and immediately gets executed without a state check is a violation of this skill, regardless of whether the work happens to need doing.
