# Handoff — NaN-coercion fix in extractGuidance

**From:** Claude Code
**To:** Either agent (pure logic fix, no live-runtime verification needed)
**Date filed:** 2026-04-19
**Blocks:** OT-B (downstream-extractor hardening track). Not a blocker for OT-A.5.
**Do NOT execute before:** T+72h post-OT-A.4 observation window closes cleanly (2026-04-22 18:14 UTC). Reason: committing logic changes to `server/ai/guidance/extractor.ts` during the observation window would be indistinguishable from OT-A.4 regression if any incident occurred.

---

## Problem statement

`extractGuidance` silently emits `assumption_guidance` rows with `NaN` values for five canonical fields when the upstream Opus synthesis produces non-numeric strings (e.g. `"n/a"`, `"unknown"`, `"TBD"`) in the affected sub-paths. NaN flows through unchecked because the downstream guard uses `== null` (which NaN passes) instead of a finiteness check.

This is the exact bug flagged in `docs/operational-tooling/OT-A-5-known-issues-followup.md` §"Sub-string-path NaN-coercion latent bug" and watched for in the OT-A.5 T+72h Sentry clause (`assumption_guidance` INSERT with `valueMid=0` while `valueLow≠0` OR `valueHigh≠0`).

**Severity:** Affects **two T1 fields** (`ltv`, `inflationRate`) where investor-facing Analyst Notes can ship with silent `0` / NaN. Also three secondary fields (`adrGrowth`, `occupancyStep`, `rampMonths`).

## Root cause

`server/ai/guidance/extractor.ts:147`:

```ts
const num = (v: unknown): number | null =>
  typeof v === "number" ? v : v != null ? Number(v) : null;
```

`Number("n/a")` returns `NaN`. The function returns NaN. The downstream guard at `extractor.ts:183`:

```ts
if (valueMid == null) return null;
```

does not catch NaN (`NaN == null` is `false`). The record ships with `valueMid: NaN`. When the ORM/JSON serializer persists the row, NaN may coerce to `0` or `null` depending on driver — producing the `valueMid=0 with valueLow≠0` signature the OT-A.5 watchlist detects.

## Fix (two-line primary, defense-in-depth secondary)

### Primary — update `num()` to return null on non-finite

```ts
const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : v != null ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
```

This alone closes the bug for all callers of `num()`.

### Secondary — defense-in-depth in `extractRecordFromSection`

Replace the guard at line 183:

```ts
// BEFORE
if (valueMid == null) return null;

// AFTER
if (!Number.isFinite(valueMid)) return null;
if (valueLow != null && !Number.isFinite(valueLow)) valueLow = valueMid;
if (valueHigh != null && !Number.isFinite(valueHigh)) valueHigh = valueMid;
```

Two reasons for defense-in-depth even though the primary fix closes the bug:
1. Future edits to `num()` or its callers could reintroduce NaN. Guard catches it regardless.
2. `parseRange` (line 34) and `parsePct` (line 12) also feed `valueLow/Mid/High` directly. Both are well-behaved today but the guard makes the invariant explicit.

### Tertiary — same pattern in `extractFromCompanyResearch`

If the company-research path has an analogous `extractRecordFromSection` twin, apply the same guard update. Grep for `Number.isFinite` vs `!= null` in the extractor module; any remaining `!= null` checks against what should be a finite number need updating.

## Affected fields (OT-A.5 watchlist priority order)

| Field | Tier | Risk |
|---|---|---|
| `ltv` | T1 | NaN mid → silent 0 → investor Analyst Note reads "0% LTV" |
| `inflationRate` | T1 | NaN mid → silent 0 → investor model propagates 0% inflation over 10-yr hold; compound error |
| `adrGrowth` | Secondary | NaN mid → 0% ADR growth → flat revenue projection |
| `occupancyStep` | Secondary | NaN mid → 0pp ramp step → permanent initial occupancy |
| `rampMonths` | Secondary | NaN mid → 0-month ramp → instant stabilization (physically impossible) |

Any one of these shipping to a live property's `assumption_guidance` row is a silent correctness failure. The T1 pair is investor-defensibility-critical.

## Test plan

New file `tests/ai/extract-guidance-nan-coercion.test.ts` (or add to an existing extractor test file if one exists — check `tests/ai/`). One test per affected field + two edge cases.

### Per-field test template

For each of the 5 fields, simulate upstream Opus output with non-numeric strings in the sub-path, call `extractGuidance`, and assert the returned record is either (a) absent for that field or (b) has finite numeric values:

```ts
import { describe, it, expect } from "vitest";
import { extractGuidance } from "../../server/ai/guidance/extractor";

describe("extractGuidance — NaN coercion (OT-B)", () => {
  it("ltv: non-numeric mid produces NO record (not NaN)", () => {
    const parsed = {
      capitalStructure: {
        ltv: { valueLow: 0.6, valueMid: "unknown", valueHigh: 0.8, display: "60-80%" },
      },
    };
    const result = extractGuidance(parsed, "property");
    const ltv = result.records.find(r => r.assumptionKey === "ltv");
    // Either absent or finite — never NaN
    if (ltv) {
      expect(Number.isFinite(ltv.valueMid)).toBe(true);
    } else {
      expect(ltv).toBeUndefined();
    }
  });

  it("inflationRate: 'n/a' mid produces NO record", () => {
    const parsed = { localEconomics: { inflationRate: { valueMid: "n/a" } } };
    const result = extractGuidance(parsed, "property");
    expect(result.records.find(r => r.assumptionKey === "inflationRate")).toBeUndefined();
  });

  it("adrGrowth: 'TBD' in recommendedGrowthRate produces NO record", () => {
    const parsed = { adrAnalysis: { recommendedGrowthRate: "TBD" } };
    const result = extractGuidance(parsed, "property");
    expect(result.records.find(r => r.assumptionKey === "adrGrowth")).toBeUndefined();
  });

  // occupancyStep, rampMonths, etc.
});
```

### Edge cases

```ts
  it("Infinity is rejected the same as NaN", () => {
    const parsed = { capitalStructure: { ltv: { valueMid: Infinity } } };
    const result = extractGuidance(parsed, "property");
    expect(result.records.find(r => r.assumptionKey === "ltv")).toBeUndefined();
  });

  it("numeric-looking strings parse correctly", () => {
    const parsed = { capitalStructure: { ltv: { valueMid: "0.65" } } };
    const result = extractGuidance(parsed, "property");
    const ltv = result.records.find(r => r.assumptionKey === "ltv");
    expect(ltv?.valueMid).toBeCloseTo(0.65);
  });
```

### Regression guard

Run the full existing extractor test suite before and after. No existing test should flip — this fix adds guards, doesn't change happy-path behavior.

## Five-gate verification

Standard: TS 0, Lint 0 errors, Vocab 11/11, test:summary PASS, Verify UNQUALIFIED. Plus:

- Run `tests/ai/extract-guidance-nan-coercion.test.ts` specifically.
- Run any existing extractor tests (grep `tests/ai/` for `extractor`, `extractGuidance`, `guidance` in test names).
- `tests/proof/field-definitions-no-hints.test.ts` — unaffected, sanity check.

## Detection alignment — what this fix eliminates

The OT-A.5 T+72h Sentry watchlist clause 2 (`assumption_guidance` INSERT with `valueMid=0` while `valueLow≠0` OR `valueHigh≠0`) was added to catch this bug at runtime. After this fix ships:

- The detection pattern should produce zero hits in production.
- Keep the detection active anyway — it's cheap, and catches future regressions (schema drift, new fields, etc.).

If the fix ships AND the detection continues to fire: there's a second NaN path somewhere we haven't found. That's a BLOCKED case worth pausing OT-A.6 for.

## Commit message template

```
fix(guidance): NaN-coercion in extractor num() + defense-in-depth guards

`Number("n/a")` returns NaN. The extractor's num() helper did not guard
for non-finite values; the downstream `valueMid == null` check passes
NaN through, producing `assumption_guidance` rows with NaN for five
canonical fields (ltv, inflationRate, adrGrowth, occupancyStep,
rampMonths). Two are T1 investor-defensibility fields.

Root cause: server/ai/guidance/extractor.ts:147 Number() coercion
without isFinite check.

Fix: num() now returns null on non-finite. Added Number.isFinite
defense-in-depth checks in extractRecordFromSection for valueMid /
valueLow / valueHigh.

Tests: tests/ai/extract-guidance-nan-coercion.test.ts covers all 5
affected fields + Infinity/valid-string-input edge cases.

Aligns with OT-A.5 T+72h NaN-coercion detection clause (filed 2026-04-19).
Post-fix, the detection pattern should produce zero hits; detection
stays active as a regression canary.

Surfaces: S7, S11
Verified: TS 0, Lint 0, Vocab 11/11, test:summary PASS, Verify UNQUALIFIED

Co-Authored-By: <agent>
```

## Owner bias

Either agent. Preference:
- **Claude Code** if no other OT work is in flight — pure logic fix, no runtime verification needed, Claude Code can self-verify via the full test suite.
- **Replit** if bundling with OT-A.5 / OT-A.6 post-v6 work — minor convenience to batch commits, no structural reason.

Either way: commit separately from OT-A.5 / OT-A.6 so rollback is surgical.

## Related

- `docs/operational-tooling/OT-A-5-known-issues-followup.md` §"Sub-string-path NaN-coercion latent bug"
- `docs/operational-tooling/OT-A-5-design.md` §"Out-of-scope for OT-A.5 (parking)" — filed here for OT-B track
- `.claude/rules/financial-safety.md` — "No silent NaN→0 coercion" rule this fix enforces
- `calc/shared/decimal.ts` — `assertFinite` helper (used elsewhere in financial code; could be imported here but simple `Number.isFinite` is sufficient for this path)
