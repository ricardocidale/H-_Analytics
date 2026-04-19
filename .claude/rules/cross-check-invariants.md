# Cross-Check Invariants — Edit One, Verify Many

This rule exists because we keep shipping "single-file" edits that
silently break sibling files. A React component gets a new prop; the
parent forgets to pass it. A schema field is added; the seed forgets to
populate it. A type drifts; a consumer no longer matches.

**Whenever you edit one surface, verify the related surfaces before committing.**

## The invariant pairs

Every pair below is a real failure mode we've hit. When you touch the
left column, also verify the right column.

| If you edit… | Also verify… | Why |
|---|---|---|
| A shared type in `shared/schema/**` or `client/src/lib/api/types.ts` | Every client that reads it (grep the field name) | Contract drift — e.g., missing `isActive` on `PortfolioPropertySummary` caused a silent "Excluded" badge bug |
| A component's props interface | Every parent that renders it (grep the component name) | TS catches mismatches if types are strict; do not use `any` props |
| A field in a DB schema (`shared/schema/*.ts`) | Seed files that populate rows for that table + sync helpers + user-manual tables + tests that assume defaults | Seeds go out-of-sync silently; prod gets rows with wrong columns |
| A default constant in `shared/constants.ts` | Every call site that imports the old literal | Drift pattern D-1/D-1-B; multiple literal copies scattered across schema/seeds/manual |
| A citation in `shared/citations.ts` | Server surfaces that reference the same label (research seeds, ambient fetchers, KB content) | Drift pattern D-2; client UI renames while server-emitted data stays stale |
| A vocabulary rule in `.claude/rules/branding-vocabulary-enforcement.md` | Every client component + server prompt + KB chunk + tooltip string | Forbidden phrases leak into UI; audit by running vocabulary-compliance test |
| A financial formula in `calc/**` | Tests in `tests/calc/**` that assert its I/O | Untested tool changes break proof suite silently |
| A business rule in `financial/**-engine.ts` | Golden scenarios in `tests/engine/**` | Silent NOI/ANOI/cash drift; also run `tests/engine/operating-reserve-cash.test.ts` |
| A proof invariant | Add/modify the corresponding test in `tests/proof/**` | Rules without proof tests are suggestions, not invariants |
| A route handler | The `IStorage` method it calls (`server/storage/**`) + integration test | Route/storage drift — new fields missed in storage returns |
| A research tool schema in `.claude/tools/**` | The implementation in `calc/**` + the registration in `calc/dispatch.ts` + tests in `tests/calc/**` | 4-surface drift; enforced by `tests/proof/tool-registry.test.ts` |
| A KB markdown file (if loader exists) or `server/ai/kb-content.ts` | Pinecone re-index is required for changes to reach Rebecca | Silent staleness; Rebecca serves old content |

## Three failure patterns that keep recurring

### Pattern 1 — Contract drift via `any`

Any prop, state, or argument typed `any` or `any[]` is a future bug. It
compiles regardless of the underlying shape, so a rename elsewhere never
flags. The Phase 4 #15 bug is the canonical example: `PropertyFeeSummaryTable`
took `properties: any[]`; the `.isActive` field it rendered never existed
on the actual shape.

**Verification:** when adding a component or refactoring, grep for `: any`
and `any[]` in the file. Replace with the actual type. If you don't know
the actual type, find a consumer and derive it from the caller.

### Pattern 2 — Half-finished implementations

Code added "in case we need it" that is never wired up. The `server/ai/kb/`
directory (19 files, never loaded) is the canonical example. These files
mislead later readers, confuse audits, and rot silently.

**Verification:** when adding a new file or directory, add at least one
import of it from a code path that reaches production. If you cannot,
do not commit the file. If a migration stalls mid-way, either finish it
or delete the half.

### Pattern 3 — Seed/schema drift

Adding a schema field without updating the dev seed, production seed
endpoint, sync helper, and user manual. Caught in audits as
`"2026-06-01"` literals scattered across 7+ files.

**Verification:** after editing `shared/schema/**`, grep the field name
across the repo. Confirm every match is either (a) a reference to the
constant from `shared/constants.ts`, or (b) a test fixture. Literal
duplicates are drift.

## Before committing a multi-file edit

Run this mental checklist:

1. **Did I change a type?** → grep the type name; read every consumer.
2. **Did I change a default value?** → grep the old value; replace literals
   with the constant.
3. **Did I change schema?** → check seeds, sync, manual, tests in parallel.
4. **Did I add a file?** → confirm at least one production code path imports it.
5. **Did I add prose to user-facing code?** → run the vocabulary test.
6. **Did I add a calc tool?** → schema + impl + dispatch + test, all four.
7. **Did I change a KB/RAG source?** → re-index Pinecone namespace.

Then run `pre-commit-verification.md`'s five gates.

## Relationship to other rules

- **`pre-commit-verification.md`** — the actual gate. This rule tells you
  what to look at BEFORE you run the gate, so the gate passes on the first try.
- **`testing-strategy.md`** — defines which tests cover which surfaces.
  This rule maps edits → tests that need re-running.
- **`claude-replit-split.md` §Guardrail #4** — "tests must pass after every
  commit" lives here too. Same spirit, different framing: guardrails stop
  bad commits; invariants stop bad edits.

## Enforcement via proof tests (current + suggested)

Existing proof tests that catch cross-check failures:

- `tests/proof/tool-registry.test.ts` — calc/dispatch ↔ schema ↔ tests
- `tests/proof/domain-boundaries.test.ts` — prohibited cross-domain imports
- `tests/proof/data-integrity.test.ts` — shared singleton uniqueness
- `tests/proof/recalculation-enforcement.test.ts` — financial mutations call `invalidateAllFinancialQueries`
- `tests/proof/portfolio-dynamics.test.ts` — no hardcoded property count
- `tests/proof/rule-compliance.test.ts` — docs structure

Suggested additions (not yet built; next audit candidate):

- **Orphan-file detector** — flag files with zero imports from code reaching production
- **Literal drift detector** — flag magic-string dates, fees, rates that appear in more than one file and aren't in `shared/constants.ts`
- **`any`-prop detector** — flag component props typed `any` or `any[]`
- **Seed/schema sync detector** — for every `shared/schema` column, assert at least one seed row includes it
