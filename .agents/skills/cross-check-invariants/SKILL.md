---
name: cross-check-invariants
description: Apply the "edit one, verify many" discipline to prevent silent cross-surface bugs. Use whenever you change a shared type, schema column, default constant, component prop, route handler, or any value other code depends on. Catches the bugs TypeScript and tests miss because the hole is in the contract, not the implementation.
---

# Cross-Check Invariants

A discipline for treating every edit as multi-file by default. Most "single-file" changes silently break sibling files. This skill names the recurring pairs and the three failure patterns that account for the majority of cross-surface bugs.

## When to use

Before committing **any** non-trivial edit. Especially:

- Changes to shared types, schemas, or constants.
- Adding or modifying a component's prop interface.
- Renaming or restructuring a route, table, or public function.
- Updating a default value, environment-variable schema, or feature flag.

## When NOT to use

- Pure-formatting changes (whitespace, sort imports) where the editor guarantees no semantic shift.
- Single-file changes inside a leaf module with no exports.

## The invariant pairs

When you edit the **left**, also verify the **right**.

| If you edit… | Also verify… | Why |
|---|---|---|
| A shared type or interface | Every consumer of it (grep the field name) | Renames break consumers silently when types are loose |
| A component's `props` interface | Every parent that renders it | TS catches mismatches if props are strictly typed; not if they're `any` |
| A field in a DB schema | Seeds, fixtures, migrations, type generators, ORM models, user-facing forms | Schema/seed drift is the most common production-data bug |
| A default constant | Every call site that imports the old literal | Constants exist precisely so the value isn't repeated; check no copies survive |
| A label or copy string referenced in tests/snapshots | Test assertions, snapshot files, translation files | Renames cascade; missing one leaves stale strings in the wild |
| A route handler signature | The client(s) that call it (typed API client, fetch wrappers, integration tests) | Frontend/backend drift |
| A public function in a library | Every importer; the README; the changelog | Versioning lives or dies by this discipline |
| A schema for an LLM tool / function | The implementation, the dispatch table, the test fixtures | Tool-call drift breaks silently — LLM "succeeds" on the wrong shape |
| Content in a knowledge-base or vector store source | Re-index step (embeddings must be regenerated) | RAG silently serves stale content otherwise |

Add project-specific pairs to your local copy of this rule.

## The three recurring failure patterns

### Pattern 1 — Contract drift hidden by `any`

Any value typed `any` or `any[]` is a future bug. Compiles regardless of underlying shape; renames upstream don't surface.

> **Real example**: a table component took `rows: any[]` and rendered `row.isActive`. The actual row type never had `isActive`. Shipped an "Excluded" badge that displayed for every row.

**Verification**: when adding or refactoring, grep for `: any` and `any[]` in the file you're touching. Replace with the actual type. If you don't know it, derive it from a caller — that act surfaces drift.

### Pattern 2 — Half-finished implementations

Files added "in case we need them" that nothing imports. They mislead later readers, confuse audits, and rot.

> **Real example**: a 19-file directory with ~900 lines of code, never wired into the pipeline. Lived unused for months until an audit caught it.

**Verification**: after creating a file, confirm at least one production code path imports it. If not, either wire it or delete it. If a migration stalls mid-way, finish it or roll it back — never leave half.

### Pattern 3 — Schema / seed / fixture drift

Adding a schema field without updating dev seed, prod seed endpoint, sync helper, fixture generator, or user-facing form. The new column lands NULL or absent in places that need it.

> **Real example**: a `dateField = "2026-06-01"` literal was duplicated across 7+ files because the constant wasn't centralized. Each file drifted independently over time.

**Verification**: after editing a schema, grep the field name across the repo. Every match should be either (a) a reference to the constant, (b) a test fixture, or (c) a generated file. Literal duplicates are drift in waiting.

## The mental checklist (run before commit)

1. **Did I change a type?** → grep the type name; read every consumer.
2. **Did I change a default value?** → grep the old value; replace literals with the constant.
3. **Did I change schema?** → check seeds, sync, manual, tests, ORM models in parallel.
4. **Did I add a file?** → confirm at least one production path imports it.
5. **Did I add user-facing copy?** → run the vocabulary / i18n / a11y checks.
6. **Did I change a tool / function schema?** → schema + impl + dispatch + tests, all four.
7. **Did I change a KB/RAG source?** → re-index.

Then run the five-gate pre-commit verification. The gates will catch what the checklist missed.

## Enforcing it in code

Some pairs can be enforced by tests or lint:

- **Orphan-file detector** — flag files with zero production imports.
- **Literal-drift detector** — flag magic dates / fees / rates appearing in >1 file outside the constants module.
- **`any`-prop detector** — flag component props typed `any`.
- **Schema-seed parity** — for each schema column with a `.default()`, assert at least one seed row exercises it.

Adding these tests is itself a high-leverage cross-check task.

## Anti-patterns

- **"I greppped, looks fine"** — without reading every consumer, grep only confirms presence, not correctness.
- **"The pair is in my head"** — write the pair down. The pair you held in mind today is the one the next contributor will miss.
- **"It's a small change"** — the smallness of the change has no bearing on the size of the blast radius.

## Composition with other skills

- **`pre-commit-gates`** — runs the actual gates after this checklist passes.
- **`architecture-decision-records`** — irreversible cross-cutting changes deserve an ADR explaining the new invariant.
- **`agent-handoff-briefs`** — handoff packages should explicitly call out which invariant pairs the work touches.
