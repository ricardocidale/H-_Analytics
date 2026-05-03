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
| **The path / structure of a source file** (split, rename, move, extract) | **Every test that reads that file via `fs.readFileSync` / `readFile` and asserts on its contents** | Static-analysis tests don't import — they grep. The TS check stays green, the test only fails when actually executed. See Pattern 4 below. |

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

### Pattern 4 — Static-analysis test drift after a refactor

Tests that read source files via `fs.readFileSync(...) + .toContain(...)` (a.k.a. "static-analysis tests" or "audit tests") don't import the code they assert on. They scan it as text. When you split a file, rename a method, or move code between modules, **every static-analysis test pointing at the old location silently goes wrong**:

- If the test reads the now-empty orchestrator and asserts a method exists, it fails with `expected '/** orchestrator */' to contain 'methodName'`.
- If it slices the file by method markers (`indexOf("async foo(")`) and the markers no longer exist, the slice is `''` and every `.toContain` on the empty body fails.
- TypeScript stays green because no import changed. Lint stays green. The hole is invisible until CI actually runs the test.

> **Real example**: splitting `server/storage/financial.ts` into a thin orchestrator + 4 submodules took **three CI cycles** to fully fix because each cycle exposed one more static-analysis test (`storage-layer.test.ts` → `strip-auto-fields.test.ts` → `scenario-roundtrip.test.ts`) that was reading the now-empty orchestrator. Each fix was structurally identical; the wasted iterations were pure batch-failure.

**Verification — do this in one batch, before pushing the refactor:**

1. **Grep for every reader of the moved file**, not just the ones tests/CI happens to mention:
   ```bash
   rg -l "readFileSync.*<oldFileName>|readFile.*<oldFileName>" tests/
   ```
2. **Grep for every method name you moved** as a literal string in tests:
   ```bash
   rg -n "<methodName>" tests/ | rg -v "import|from "
   ```
3. **Run every matched test file locally** (`npx vitest run <file1> <file2> ...`) before the commit lands. The failures cluster — one push, one fix.
4. **If the file was split**, update each affected test to either (a) read the new submodule path, or (b) concatenate all relevant submodule sources into the variable the assertions scan. The latter keeps the assertions behaviour-equivalent without rewriting individual `.toContain` checks.

**Anti-pattern**: "I'll fix the one CI showed me and re-push." That guarantees N+1 cycles for an N-file pattern. The whole pattern is the unit of work.

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
- **`ce-data-integrity-guardian`** (CE agent persona at `.agents/ce-agents/ce-data-integrity-guardian.agent.md`) — for financial or schema invariants, dispatch this persona for a focused deep review. It specialises in migration safety, NULL/default handling, and ACID correctness — exactly the invariant class most often missed by TypeScript checks.
- **`norfolk-code-review`** — the project-specific code review pre-activates `ce-data-integrity-guardian` and `ce-coherence-reviewer` automatically; run it after any schema change to catch cross-surface drift in seeds, engine, and UI in one pass.
