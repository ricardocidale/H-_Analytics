---
name: no-magic-numbers
description: Forbid raw numeric literals in code. Every number is either a named constant, an enumerated math/physics derivation with the formula in a comment, a documented unit conversion, or a structural index/length. Use whenever you write or review code that contains numbers — especially in financial, engine, calibration, threshold, weight, or limit code. Catches the failure mode where a tier threshold gets duplicated across files and silently drifts, where a calibration weight gets re-tuned in one place but not its sibling, and where the meaning of a literal is lost the day after it was written.
---

# No Magic Numbers

A discipline for treating every numeric literal in code as a question: *what does this number mean, and where else does it live?* Magic numbers are the most reliable source of cross-file drift in financial, calibration, and threshold code, and they are invisible to TypeScript and most lint rules.

## The rule (one sentence)

**Every numeric literal in source code must be either a named constant, a math/physics derivation accompanied by its formula in a comment, a documented unit conversion factor, or a structural index/length/clamp.** Anything else is a violation.

## When to use

Before writing or merging any code that contains a number. Especially:

- Financial calibration values (tax rates, discount rates, expense ratios, exit caps).
- Engine thresholds (conviction floors, severity boundaries, tier cutoffs).
- Weighting tables (severity weights, tier weights, persona-fit multipliers).
- Display caps (max items shown, max characters, decimal precision).
- Time windows, retry counts, batch sizes, timeouts.
- Default fallback values when a database read returns null.

## When NOT to use

- Pure formatting or whitespace changes.
- Generated code (e.g. Drizzle migrations, codegen output) — file the issue against the generator, not the output.
- Test fixture data where the literal *is* the input under test (e.g. `expect(score(input)).toBe(72)` — `72` is the answer being asserted, not a magic number).

## The four allowed categories

A numeric literal is permitted *only* if it falls cleanly into one of these four buckets. If you have to argue for a fifth category, you have a magic number.

### 1. Named constant

```ts
// ALLOWED — the literal lives in exactly one place, named, with a docstring.
export const CONVICTION_HIGH_THRESHOLD = 80;

if (qualityScore >= CONVICTION_HIGH_THRESHOLD) return "high conviction";
```

The named constant must live in the file (module-scope) or in a shared module that all callers import. **A literal that appears in two files is a bug, even if it's the same value today.**

### 2. Math / physics derivation with the formula in a comment

```ts
// ALLOWED — derivation is explicit; the literal is the result, not an opinion.
const DAYS_PER_MONTH = 30.5;          // 365 / 12, industry standard
const DAY_MS = 86_400_000;            // 24 * 60 * 60 * 1000
const RADIANS_PER_DEGREE = Math.PI / 180;
```

The comment must contain the actual derivation. *"Industry standard"* is a derivation note. *"because that works"* is not.

### 3. Documented unit conversion factor

```ts
// ALLOWED — physical conversions are constants of nature.
const LBS_TO_KG = 0.45359237;         // NIST exact definition
const KM_TO_MILES = 0.621371;
const PERCENT_SCALE = 100;            // decimal-to-percent
```

If it isn't a true physical constant or a definitional unit relationship, it doesn't qualify here — promote it to category 1.

#### Universal vs. authority-dictated — a critical distinction

A literal qualifies for category 2 or 3 (and the cross-file allowlist) **only** when its value is fixed by math, by the calendar, by physics, or by a unit definition that is the same in every country. Examples that qualify:

- `30.5` — days per month, derives from `365 / 12`. Same arithmetic everywhere.
- `365.25` — days in a Julian year. Astronomy, not policy.
- `86400` — seconds per day. Definitional.
- `10000` — basis points per 100%. The definition of a basis point.
- `Math.PI`, `Math.E`, `√2` — constants of nature.

Examples that **do NOT qualify** (these vary by jurisdiction and belong in the country-scoped Constants table — see the `constants-vs-defaults` skill):

- Depreciation lives — 39 years (US IRS Pub 946), 40 years (Canada CRA Class 1), different again under Spanish, French, Colombian tax codes. Not universal.
- Tax rates, brackets, withholding rules.
- Day-count conventions tied to a debt instrument — `30/360`, `ACT/360`, `ACT/ACT`. The fact that US commercial mortgages use 360-day banker's years is a *convention*, not arithmetic. A different country, a different instrument, may use a different convention.
- Trading-day counts — 252 for NYSE, different for Tokyo, different again for São Paulo.
- "Standard" cap rates, "standard" mgmt fee bps, "industry" labor burden.

**The rule:** if the number could legitimately be different under a different country's rules, it is policy, not math. Promote it to the database-backed, country-scoped Constants table. The cross-file duplication detector EXISTS to catch jurisdictional values that have been hardcoded in multiple files instead of being sourced from the table.

### 4. Structural index / length / clamp

```ts
// ALLOWED — these literals are properties of the data structure, not opinions.
const first = list[0];
if (parts.length > 0) ...
for (let i = 0; i < items.length; i++) ...
const ratio = Math.min(n / DENOMINATOR, 1);   // 1 = clamp ceiling
const clamped = Math.max(0, raw);             // 0 = clamp floor
return arr.slice(0, MAX_ITEMS).join(", ");    // 0 = start index
```

Allowed values in this category are typically `0`, `1`, `-1`, and structural expressions like `arr.length`. **Any literal larger than 1 in this category should be reviewed once more — it is usually a display cap (category 1) in disguise.**

## The decision tree

For every numeric literal you are about to write, ask in order:

1. **Is it `0`, `1`, or `-1` used as a structural clamp/index/identity?** → Allowed (category 4).
2. **Is it the result of a physical or mathematical derivation I can write in one line?** → Allowed if I write that derivation as a comment (category 2/3).
3. **Will any other file ever need this same number?** → If yes, it MUST be a named constant in a shared module (category 1).
4. **Could this number ever change without changing the file it lives in?** → If yes, it MUST be a named constant (category 1). The name is the explanation.
5. **None of the above?** → It is a magic number. Promote it.

## Cross-file duplication is the worst failure mode

The single most common bug this skill prevents:

```ts
// File A — voice-renderer.ts
if (qualityScore >= 80) return "high conviction";    // ← magic 80
if (qualityScore >= 60) return "moderate conviction"; // ← magic 60

// File B — confidence-scorer.ts
if (score >= 80) return "high";                       // ← LOOKS like the same 80
if (score >= 50) return "medium";                     // ← but actually 50, not 60
```

Six months later someone "unifies" the tier thresholds in one file. The other file silently drifts. No test catches it because the tests in each file pass against their own (now divergent) literal. Production behavior changes for half the surfaces and nobody notices until an LP question.

**The fix is mechanical:** named constant in a shared module, both files import. The discipline is that **the moment a number appears in two files, it must move to a shared module in the same commit**.

## Examples in context

### Bad: inline calibration weight

```ts
function computeOverallQuality(dimensions) {
  const severityWeight = { ok: 1, advisory: 1.25, warning: 1.5, block: 2 };
  ...
}
```

The weights are calibration parameters. They will be re-tuned. Burying them inside a function makes them invisible to tooling, hard to find, and impossible to cite from an ADR. Hoist to module scope:

```ts
/**
 * Per-severity weights used by computeOverallQuality. Calibrated against
 * persona-keyed test bench (ADR-003).
 */
export const SEVERITY_QUALITY_WEIGHTS = { ok: 1, advisory: 1.25, warning: 1.5, block: 2 };
```

### Bad: half-credit fallback

```ts
if (range.mid === 0) return cap * 0.5;   // ← what does 0.5 mean?
if (benchmark <= 0) return cap * 0.5;    // ← duplicated
```

The `0.5` is a calibration choice ("half-credit when we can't compute the real score"). It deserves a name:

```ts
const RANGE_SPREAD_FALLBACK_CREDIT = 0.5;

if (range.mid === 0) return cap * RANGE_SPREAD_FALLBACK_CREDIT;
if (benchmark <= 0) return cap * RANGE_SPREAD_FALLBACK_CREDIT;
```

### Bad: display cap repeated three times

```ts
const sources = evidence.slice(0, 3).map(...).join(", ");
const more = evidence.length > 3 ? ` (+${evidence.length - 3} more)` : "";
const flagged = dimensions.filter(...).slice(0, 3).map(...);
```

Three repetitions of `3` with three different meanings *today* but no contract preventing them from drifting *tomorrow*. Two named constants, one purpose each:

```ts
const MAX_SOURCES_IN_DETAIL = 3;
const MAX_DIMENSIONS_FLAGGED = 3;
```

### Bad: duplicating a value that already has a name in the same file

```ts
import { MIN_SOURCES_FOR_ADVICE } from "@shared/conviction";
// ...
if (totalEvidence >= 3) ...   // ← MIN_SOURCES_FOR_ADVICE is right there
```

Most insidious form. The named constant exists, is imported, and the literal is *still* used. Audit: any file that imports a `*_THRESHOLD`, `*_MIN`, `*_MAX`, or `*_LIMIT` constant must not contain a raw integer in the same range. Grep your own file before committing.

## Audit checklist (run before every commit that adds numbers)

1. `grep -nE '\b[0-9]+\.?[0-9]*\b' <new-or-modified-file>` — list every literal.
2. For each literal, classify it into one of the four allowed categories. If it doesn't fit, promote it.
3. For each named constant you added, search the rest of the codebase for its value (`grep -rn '0\.85' src/`). If the same value already lives somewhere with a different name, you have duplication — unify.
4. If you added a constant to a shared module, check every file that should import it (especially older callers that might still hardcode the old literal).

## Enforcement

This skill is enforced by a two-layer gate. Both layers must stay healthy — the ratchet catches what the audit test validates.

### Layer 1 — Cross-file duplication ratchet (the hard gate)

ESLint cannot see across files, which is exactly where the worst failure mode lives. The script `scripts/src/check-magic-numbers.ts` walks `lib/calc/src`, `lib/engine/src`, `lib/shared/src`, `lib/domain/src`, `lib/analytics/src`, and `artifacts/api-server/src` (excluding migrations) and groups every numeric literal by the set of files it appears in. Any value that appears in `>= 4` distinct files (after content-hash deduplication for identical mirror files) is a "duplication suspect"; the script then ratchets the current state against the snapshot at `scripts/src/_magic-numbers-baseline.json`.

The ratchet **fails** when:

- A value already in the baseline appears in MORE files than baseline (someone added a new occurrence of an already-known magic number).
- A brand-new value crosses the duplication threshold (someone introduced a fresh cross-file duplication).

It does **not** fail on improvements (a baseline value's file-count shrank). After an intentional cleanup, re-snapshot with `--init` to lock in the gain.

Note: test files (`.test.ts`, `.spec.ts`, etc.) are excluded — test fixture values are assertions, not production magic numbers.

Common commands:

| Goal | Command |
|------|---------|
| Default ratchet check (CI gate) | `scripts/node_modules/.bin/tsx scripts/src/check-magic-numbers.ts` |
| Show every duplication, no baseline check | `scripts/node_modules/.bin/tsx scripts/src/check-magic-numbers.ts --show` |
| Re-snapshot the baseline after a cleanup | `scripts/node_modules/.bin/tsx scripts/src/check-magic-numbers.ts --init` |
| Fail on ANY duplication (aspirational, when baseline reaches 0) | `scripts/node_modules/.bin/tsx scripts/src/check-magic-numbers.ts --strict` |

The ratchet is wired into:

- The **Magic Numbers Check** workflow (run from the workflow pane or via the command above).
- `script/audit-quick.ts` as a critical finding labelled "Magic-numbers ratchet".
- `tests/audit/no-magic-numbers.test.ts`, which runs in the regular vitest suite (`npm run test:summary`).

### Layer 2 — Vitest guard test

`tests/audit/no-magic-numbers.test.ts` asserts every contract that holds the layers together: the ratchet script exists, the baseline is checked in, the workflow is registered, the SKILL points at the actual command, audit:quick wires the guard, and a probe that plants the same novel literal in four files is correctly rejected. Don't delete this test — it is what prevents future agents from quietly bypassing the enforcement.

### How to fix a failing ratchet

When `tsx script/check-magic-numbers.ts` reports a regression:

1. Read the offending value and the new file(s) the script names.
2. Find the canonical home for that value — usually `shared/constants.ts`, the relevant `calc/` helper, or `shared/model-constants-registry.ts` for locality-aware financial values.
3. Define a named constant (or reuse an existing one) in the canonical home.
4. Replace the literal in EVERY listed file with the named import in the SAME commit. Partial promotion is the failure mode this skill exists to prevent.
5. Re-run `tsx script/check-magic-numbers.ts`. The ratchet should pass.

If the value is genuinely universal — calendar math (12 months, 365 days, 30.5 days/month, 60 seconds), unit definition (basis points, percent), or a constant of nature (π, e) — add it to `ALLOWED_DUPLICATED_VALUES` in `script/check-magic-numbers.ts` with a one-line justification.

If the value varies by jurisdiction (depreciation life, tax rate, day-count convention, trading-day count, "industry-standard" anything that an authority has codified differently in different countries), do **not** allowlist it. Promote it to the country-scoped Constants table per the `constants-vs-defaults` skill — the ratchet exists precisely to catch jurisdictional values that have been hardcoded in multiple files.

## Coupling with other skills

- **`hplus-variable-taxonomy`** — for H+ Analytics specifically: defines the four categories of numbers (TRUE CONSTANTS, DEFAULT VARIABLES, ASSUMPTION VARIABLES, TABLE-SOURCED VALUES) and the exact code pattern for each. The masking anti-pattern documented above (`DEFAULT_INFLATION_RATE = 0.03`) is the same violation in both skills. Country-specific rates (tax, inflation, depreciation lives) must route through `getFactoryNumber(key, country)`, not a flat `DEFAULT_*` constant.
- **`hplus-assumption-lifecycle`** — the Default → Assumption → Confirmed UX lifecycle. Explains when a null-coalescing fallback is correct and when the value should come from the DB instead.
- **`cross-check-invariants`** — promoting a literal to a shared constant is exactly the kind of edit that requires checking every consumer.
- **`pre-commit-gates`** — a magic-number scan should be one of the gates.
- **`architecture-decision-records`** — calibration constants whose values are non-obvious (severity weights, tolerance multipliers, tier thresholds) deserve a one-line ADR cross-reference in their docstring.

## The masking anti-pattern — do NOT do this

The most common wrong fix is wrapping the literal in a named constant purely to satisfy the ratchet:

```ts
// BAD — this does not fix anything
export const DEFAULT_INFLATION_RATE = 0.03;   // ← still a magic number, just one level up

// Later...
inflationRate: Number(ga.inflationRate ?? DEFAULT_INFLATION_RATE)  // ← 0.03 still hardcoded
```

Why it's wrong:
- `0.03` now lives in TWO places: the constants file AND the DB seed that seeds `inflationRate = 0.03`. The ratchet still has two copies — it just moved to a different file pair.
- If `inflationRate` is a **user-configurable assumption** (stored in the database, editable via UI), the fallback should come from `getFactoryNumber('inflationRate', country)` — the model constants registry — not from a hardcoded constant.
- If `interestRate` is a **market-driven value** that changes quarterly, a constant named `DEFAULT_DEBT_INTEREST_RATE_FALLBACK = 0.065` locks in a stale market observation as a code artifact.

**The right fix depends on what the number IS**:

| What the number is | Right fix |
|---|---|
| A user assumption (inflation rate, tax rate, interest rate) | Trace to `getFactoryNumber(key, country)` from the model constants registry |
| A seed/ramp-up default used only in the initial DB seed | Define a `DEFAULT_*` constant in `lib/shared/src/constants*.ts`; reference it from the seed file. **Never a raw literal in seed data.** Run `--init` after to lock the baseline. |
| A domain constant for a specific algorithm (EDGAR row threshold, IMF band delta) | Named export in the relevant constants file (`constants-funding.ts`, `constants-benchmarks.ts`) |
| A genuinely cross-file reused calibration | Named constant in `lib/shared/src/constants*.ts`, import everywhere it's used |

**When `--init` is the right answer**: After a cleanup pass that removes some magic numbers, the baseline improves. After a migration that introduces new seed-only literals that can't yet be traced to a registry, running `--init` locks in the accepted state so the ratchet tracks FUTURE regressions, not acknowledged pre-existing ones.

## Failure modes this skill prevents

1. **Silent cross-file drift.** Same number in two files, one updated, the other forgotten.
2. **Lost meaning.** A literal whose purpose was clear to its author is opaque to the next reviewer six months later.
3. **Re-derivation.** The same calibration is re-discovered, re-tuned, and re-introduced as a different literal in a sibling module.
4. **Untestable invariants.** "The high-conviction threshold is 80" is a fact you can grep for once it's a constant. As a literal, it's a fact you can't even find.
5. **Invisible business rules.** Tax rates, retention rules, and authority-cited values get buried inside function bodies where no admin UI, no audit, and no agent can find them.

## The one-line summary

If your code contains a number whose meaning is not on the same line, it is a magic number. Name it.
