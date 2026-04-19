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

## Coupling with other skills

- **`cross-check-invariants`** — promoting a literal to a shared constant is exactly the kind of edit that requires checking every consumer.
- **`pre-commit-gates`** — a magic-number scan should be one of the gates.
- **`architecture-decision-records`** — calibration constants whose values are non-obvious (severity weights, tolerance multipliers, tier thresholds) deserve a one-line ADR cross-reference in their docstring.

## Failure modes this skill prevents

1. **Silent cross-file drift.** Same number in two files, one updated, the other forgotten.
2. **Lost meaning.** A literal whose purpose was clear to its author is opaque to the next reviewer six months later.
3. **Re-derivation.** The same calibration is re-discovered, re-tuned, and re-introduced as a different literal in a sibling module.
4. **Untestable invariants.** "The high-conviction threshold is 80" is a fact you can grep for once it's a constant. As a literal, it's a fact you can't even find.
5. **Invisible business rules.** Tax rates, retention rules, and authority-cited values get buried inside function bodies where no admin UI, no audit, and no agent can find them.

## The one-line summary

If your code contains a number whose meaning is not on the same line, it is a magic number. Name it.
