# Testing Strategy

## Rule

All financial logic, API routes handling mutations, and calculation tools must have test coverage. Tests validate correctness, not implementation details. The proof system is the final gate — no release may proceed with failing proof tests.

## Test Categories

| Category | Directory | Purpose | Required For |
|----------|-----------|---------|-------------|
| **Proof tests** | `tests/proof/` | Invariant enforcement — financial identities, domain boundaries, data integrity | Every release |
| **Engine tests** | `tests/engine/` | Financial calculation correctness — golden scenarios, edge cases | Any financial change |
| **Calc tool tests** | `tests/calc/` | Deterministic tool input/output verification | Any tool change |
| **Integration tests** | `tests/integration/` | API route behavior, storage operations | Route or storage changes |

## When Tests Are Required

### Must Have Tests

- Any change to `calc/` — every tool must have matching tests in `tests/calc/`
- Any change to `financial/property-engine.ts`, `financial/company-engine.ts`, `calculationChecker.ts`, `loanCalculations.ts` — run `tests/engine/`
- Any new proof invariant — add to `tests/proof/`
- Any new API route that mutates data — add integration test

### Tests Not Required

- CSS/styling changes
- Documentation updates
- Admin UI layout changes (unless they affect data flow)
- Theme/branding changes

## Golden Scenario Pattern

Financial tests should use golden scenarios — hand-calculated expected values at the top of the test file:

```typescript
const GOLDEN = {
  year1Revenue: 1_825_000,
  year1NOI: 730_000,
  exitValue: 12_166_667,
};

it("matches golden revenue", () => {
  expect(result.year1Revenue).toBeCloseTo(GOLDEN.year1Revenue, 0);
});
```

Use 0% growth/inflation in golden scenarios for traceability. Test both values and identities (e.g., `GOP = Revenue - OpEx`).

## Running Tests

```bash
npm run test:summary          # All tests
npm run test:file -- <path>   # Single file
npm run verify:summary        # Proof suite (must show UNQUALIFIED)
```

## Pre-Commit Gate (mandatory)

**Before every commit**, run the full five-gate verification from
`.claude/rules/pre-commit-verification.md`. Tests are not something you
run "when you remember" — they are the gate between "written code" and
"committed code." A test failure means the commit does not land.

## Contract Tests — catch cross-surface drift

TypeScript already catches the easy cases (missing fields, wrong types).
Contract tests catch the subtler ones:

- **Shape assertions at boundaries** — when a client consumes an API
  response, assert the full shape (not a subset). When a server returns
  a typed response, validate against the schema. Use `satisfies` rather
  than `as` for assignment-style typing so mismatches surface at compile.
- **Seed-vs-schema parity** — for any schema column with a `.default()`,
  at least one seed row must exercise it. Missing defaults silently
  produce NULL in production.
- **Type-to-consumer parity** — when exporting a type from `shared/`,
  grep the consumers. If the field count diverges between the type and
  the code that reads it, one of them is wrong.

These tests live in `tests/proof/` and run as part of `verify:summary`.

## Dead Code Detection

Files that nothing imports are either half-finished implementations or
abandoned migrations. Either way they mislead the next reader. When
adding a file:

- It must be imported by at least one code path that reaches production
  OR be explicitly part of a test suite / admin script.
- If a file is intentionally "pending wire-up" (rare), annotate at the
  top with `// UNWIRED — blocking on: <reason>` so future audits know
  why it's there.

The `server/ai/kb/` directory (19 orphan files deleted in Phase 5B) is
the canonical "do not do this" example.

## Test Quality Standards

- Tests must be deterministic — no random data, no timing dependencies
- Financial tests use `toBeCloseTo` for floating-point comparisons
- Test names describe the business rule, not the implementation: "NOI equals GOP minus fees and taxes" not "function returns correct number"
- Proof tests run automatically in the verification pipeline — failures produce ADVERSE opinion
- **Never delete a failing test to "fix" it.** Either fix the code the test is asserting, or update the test with a written justification for why the assertion changed. Deleted tests are deleted guarantees.
