/**
 * OT-A.3 Path 3 (respec) — Tier-based verdict-parity harness.
 *
 * Reads v4 A/B raw output (docs/operational-tooling/OT-A-3-ab-raw.json) and
 * evaluates per-field tier-based gates per docs/operational-tooling/
 * OT-A-3-path3-respec.md (approved 2026-04-19).
 *
 * Why offline (no $22 rerun): every metric below is a deterministic transform
 * of low/mid/high already in the v4 raw — no fresh stochastic samples needed.
 *
 * Spec: docs/operational-tooling/OT-A-3-path3-respec.md
 *       docs/operational-tooling/OT-A-3-field-tiering.md
 *
 * Run:  tsx script/ot-a-3-verdict-parity.ts
 */
import { readFileSync, writeFileSync } from "node:fs";

// ---------------------------------------------------------------------------
// Tiering (per OT-A-3-field-tiering.md, approved)
// ---------------------------------------------------------------------------

type Tier = "T1" | "T2" | "T3";

const T1_FIELDS: ReadonlySet<string> = new Set([
  "adr", "occupancy", "capRate", "ltv", "incentiveFee",
  "adrGrowth", "inflationRate", "interestRate",
]);

const T2_FIELDS: ReadonlySet<string> = new Set([
  "startOccupancy", "occupancyStep", "rampMonths", "catering", "revShareFB",
  "landValue", "saleCommission", "costHousekeeping", "costFB", "costAdmin",
  "costMarketing", "costPropertyOps", "costUtilities", "costFFE",
  "costPropertyTaxes", "preOpeningCosts", "incomeTax",
]);

const T3_FIELDS: ReadonlySet<string> = new Set([
  "revShareEvents", "revShareOther", "costIT", "costOther",
  "costSeg5yrPct", "costSeg7yrPct", "costSeg15yrPct",
  "svcFeeMarketing", "svcFeeTechRes", "svcFeeAccounting",
  "svcFeeRevMgmt", "svcFeeGeneralMgmt", "svcFeeProcurement",
  "arDays", "apDays", "platformFee",
]);

const KNOWN_COLLAPSE_EXEMPT: ReadonlySet<string> = new Set(["incentiveFee"]);

// ---------------------------------------------------------------------------
// Exemption classes (per docs/operational-tooling/OT-A-3-parity-exemptions.md)
//
// Adding a field here requires the exemptions doc to be updated with the
// rationale + class + the metric (signed Δ, σ, uniq) that justifies the class.
// The script reports BOTH raw and exemption-adjusted verdicts so the audit
// trail is preserved.
// ---------------------------------------------------------------------------

type ExemptionClass = "industry-standard" | "legacy-inaccurate" | "noise-floor" | "under-reasoned";

interface FieldExemption {
  class: ExemptionClass;
  rationale: string;
}

const FIELD_EXEMPTIONS: ReadonlyMap<string, FieldExemption> = new Map([
  ["incentiveFee",  { class: "industry-standard", rationale: "uniq=1, signed +5.0%±10%, mid-hit 80% — canonical industry fee level." }],
  ["adrGrowth",     { class: "noise-floor",       rationale: "unbiased-noise, |Δ|<<σ, mid-hit miss 10pp." }],
  ["interestRate",  { class: "noise-floor",       rationale: "small bias (+3.4%) ≈ σ (5%), mid-hit miss 5pp." }],
  ["ltv",           { class: "noise-floor",       rationale: "mid-hit 100% (values agree); bucket fail is range-width artifact." }],
  // inflationRate: Class 2 reclassified to Class 4 on 2026-04-19 after legacy
  // code review (research-value-extractor.ts:108–119) showed legacy parses LEA
  // panel output, NOT a hard-coded USA CPI. No exemption. See
  // docs/operational-tooling/OT-A-3-parity-exemptions.md Q1 finding.
  ["svcFeeMarketing", { class: "industry-standard", rationale: "Reclassified Class 4 → Class 1 on 2026-04-19. For L+B branded boutique-luxury, 1.5–2.0% of total revenue IS the canonical marketing-services fee (operator-contract standardization, like incentiveFee at 10% of GOP). uniq=1 is correct, not under-reasoning. σ (8%) > |Δ| (2.5%) means the small Δ vs legacy is persona-narrowing, not drift." }],
]);

// An exemption class with effect "skip-all" makes the field a PASS in the
// adjusted scoring. "name-and-pause" (Class 4 = under-reasoned) does NOT
// exempt — the field still counts as a real FAIL.
function isExempting(c: ExemptionClass): boolean {
  return c !== "under-reasoned";
}

function tierOf(field: string): Tier | null {
  if (T1_FIELDS.has(field)) return "T1";
  if (T2_FIELDS.has(field)) return "T2";
  if (T3_FIELDS.has(field)) return "T3";
  return null;
}

// ---------------------------------------------------------------------------
// Gate thresholds (per OT-A-3-path3-respec.md)
// ---------------------------------------------------------------------------

const T1_BUCKET_MIN = 0.55;
const T1_MID_TOL_REL = 0.10;
const T1_MID_HIT_MIN = 0.90;
const T1_ABS_FALLBACK = 1.0;  // ±1pp/day/mo/etc

const T2_MID_TOL_REL = 0.20;
const T2_MID_HIT_MIN = 0.85;
const T2_ABS_FALLBACK = 2.0;

const T3_INCLUSION_MIN = 0.80;
const T3_ABS_FALLBACK = 3.0;

const ABS_FALLBACK_THRESHOLD = 0.5;

const COLLAPSE_MIN_UNIQUE = 3;

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

interface RawComparison {
  field: string;
  oldMid: number;
  newMid: number;
  oldLow: number | null;
  oldHigh: number | null;
  newLow: number | null;
  newHigh: number | null;
  midDeltaPct: number;
  withinFivePct: boolean;
  bucketMatch: boolean;
}

interface RawCase {
  id: string;
  market: string;
  oldOk: boolean;
  newOk: boolean;
  comparisons: RawComparison[];
}

const RAW_PATH = "docs/operational-tooling/OT-A-3-ab-raw.json";
const OUT_PATH = "docs/operational-tooling/OT-A-3-verdict-parity.md";

// ---------------------------------------------------------------------------
// Per-case predicates
// ---------------------------------------------------------------------------

function midpointWithinTolerance(
  legacyMid: number,
  newMid: number,
  relTol: number,
  absFallback: number,
): boolean {
  const delta = newMid - legacyMid;
  if (Math.abs(legacyMid) >= ABS_FALLBACK_THRESHOLD) {
    return Math.abs(delta) / Math.abs(legacyMid) <= relTol;
  }
  return Math.abs(delta) <= absFallback;
}

function legacyPointInNewRange(
  legacyMid: number,
  newLow: number | null,
  newHigh: number | null,
  absFallback: number,
): boolean {
  if (newLow === null || newHigh === null) {
    // Degenerate: new path didn't emit a range. Compare midpoints with absolute fallback.
    return false;
  }
  // Inclusion test with a small epsilon = absFallback to absorb rounding.
  return legacyMid >= newLow - 1e-9 && legacyMid <= newHigh + 1e-9;
}

// ---------------------------------------------------------------------------
// Per-field aggregation
// ---------------------------------------------------------------------------

interface FieldEval {
  field: string;
  tier: Tier;
  n: number;
  uniqueRanges: number;
  // T1
  bucketMatchPct: number;
  midHitPct: number;
  // T2
  midHitPctT2: number;
  // T3
  inclusionPct: number;
  // Direction-of-failure
  signedMeanRelDelta: number;
  stdRelDelta: number;
  directionTag: "bias-up" | "bias-down" | "unbiased-noise";
  // Verdict (raw — pre-exemption)
  passes: boolean;
  failReasons: string[];
  // Exemption-adjusted verdict
  exemption: FieldExemption | null;
  passesAdjusted: boolean;  // true if passes raw OR is exempted by a non-"under-reasoned" class
}

function evalField(
  field: string,
  tier: Tier,
  comparisons: RawComparison[],
): FieldEval {
  const n = comparisons.length;
  const bucketHits = comparisons.filter((c) => c.bucketMatch).length;
  const bucketMatchPct = n > 0 ? bucketHits / n : 0;

  // Midpoint within tolerance — choose tolerance by tier
  const midHitT1 = comparisons.filter((c) =>
    midpointWithinTolerance(c.oldMid, c.newMid, T1_MID_TOL_REL, T1_ABS_FALLBACK),
  ).length;
  const midHitT2 = comparisons.filter((c) =>
    midpointWithinTolerance(c.oldMid, c.newMid, T2_MID_TOL_REL, T2_ABS_FALLBACK),
  ).length;
  const midHitPct = n > 0 ? midHitT1 / n : 0;
  const midHitPctT2 = n > 0 ? midHitT2 / n : 0;

  // T3 inclusion
  const inclusionHits = comparisons.filter((c) =>
    legacyPointInNewRange(c.oldMid, c.newLow, c.newHigh, T3_ABS_FALLBACK),
  ).length;
  const inclusionPct = n > 0 ? inclusionHits / n : 0;

  // Unique ranges from the new path
  const uniq = new Set<string>();
  for (const c of comparisons) {
    uniq.add(`${c.newLow}-${c.newMid}-${c.newHigh}`);
  }
  const uniqueRanges = uniq.size;

  // Direction of failure: signed relative delta with absolute-fallback
  // for near-zero legacy midpoints.
  const relDeltas: number[] = [];
  for (const c of comparisons) {
    const denom = Math.max(Math.abs(c.oldMid), ABS_FALLBACK_THRESHOLD);
    relDeltas.push((c.newMid - c.oldMid) / denom);
  }
  const meanRel =
    relDeltas.reduce((s, x) => s + x, 0) / Math.max(relDeltas.length, 1);
  const variance =
    relDeltas.reduce((s, x) => s + (x - meanRel) ** 2, 0) /
    Math.max(relDeltas.length, 1);
  const stdRel = Math.sqrt(variance);
  let directionTag: "bias-up" | "bias-down" | "unbiased-noise";
  if (Math.abs(meanRel) > 0.5 * stdRel && Math.abs(meanRel) > 0.02) {
    directionTag = meanRel > 0 ? "bias-up" : "bias-down";
  } else {
    directionTag = "unbiased-noise";
  }

  // Verdict per tier
  const failReasons: string[] = [];
  if (tier === "T1") {
    if (bucketMatchPct < T1_BUCKET_MIN) failReasons.push(`bucket ${(bucketMatchPct * 100).toFixed(0)}% < 55%`);
    if (midHitPct < T1_MID_HIT_MIN) failReasons.push(`±10% mid-hit ${(midHitPct * 100).toFixed(0)}% < 90%`);
  } else if (tier === "T2") {
    if (midHitPctT2 < T2_MID_HIT_MIN) failReasons.push(`±20% mid-hit ${(midHitPctT2 * 100).toFixed(0)}% < 85%`);
  } else {
    if (inclusionPct < T3_INCLUSION_MIN) failReasons.push(`inclusion ${(inclusionPct * 100).toFixed(0)}% < 80%`);
  }
  if (uniqueRanges < COLLAPSE_MIN_UNIQUE && !KNOWN_COLLAPSE_EXEMPT.has(field)) {
    failReasons.push(`unique ranges ${uniqueRanges} < 3 (mode collapse)`);
  }

  const passes = failReasons.length === 0;
  const exemption = FIELD_EXEMPTIONS.get(field) ?? null;
  const passesAdjusted = passes || (exemption !== null && isExempting(exemption.class));

  return {
    field, tier, n, uniqueRanges,
    bucketMatchPct, midHitPct, midHitPctT2, inclusionPct,
    signedMeanRelDelta: meanRel, stdRelDelta: stdRel, directionTag,
    passes,
    failReasons,
    exemption,
    passesAdjusted,
  };
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function fmtPct(n: number): string { return `${(n * 100).toFixed(0)}%`; }
function fmtPctSigned(n: number): string {
  const sign = n >= 0 ? "+" : "";
  return `${sign}${(n * 100).toFixed(1)}%`;
}

function buildReport(evals: FieldEval[]): string {
  const t1 = evals.filter((e) => e.tier === "T1");
  const t2 = evals.filter((e) => e.tier === "T2");
  const t3 = evals.filter((e) => e.tier === "T3");

  const t1Pass = t1.filter((e) => e.passes).length;
  const t2Pass = t2.filter((e) => e.passes).length;
  const t3Pass = t3.filter((e) => e.passes).length;
  const t1PassAdj = t1.filter((e) => e.passesAdjusted).length;
  const t2PassAdj = t2.filter((e) => e.passesAdjusted).length;
  const t3PassAdj = t3.filter((e) => e.passesAdjusted).length;

  const t1AllPass = t1Pass === t1.length;
  const t2AllPass = t2Pass === t2.length;
  const t3AllPass = t3Pass === t3.length;
  const t1AllPassAdj = t1PassAdj === t1.length;
  const t2AllPassAdj = t2PassAdj === t2.length;
  const t3AllPassAdj = t3PassAdj === t3.length;
  const collapsePass = evals.every((e) =>
    e.uniqueRanges >= COLLAPSE_MIN_UNIQUE || KNOWN_COLLAPSE_EXEMPT.has(e.field),
  );
  const collapsePassAdj = evals.every((e) =>
    e.uniqueRanges >= COLLAPSE_MIN_UNIQUE
      || KNOWN_COLLAPSE_EXEMPT.has(e.field)
      || (e.exemption !== null && isExempting(e.exemption.class)),
  );

  const allPass = t1AllPass && t2AllPass && t3AllPass && collapsePass;
  const allPassAdj = t1AllPassAdj && t2AllPassAdj && t3AllPassAdj && collapsePassAdj;
  const t1UnblockMet = t1PassAdj >= 7;  // OT-A.4 unblock criterion: T1 ≥ 7/8

  const t1Rows = t1.map((e) =>
    `| \`${e.field}\` | ${e.n} | ${fmtPct(e.bucketMatchPct)} | ${fmtPct(e.midHitPct)} | ${e.uniqueRanges} | ${fmtPctSigned(e.signedMeanRelDelta)} ± ${fmtPct(e.stdRelDelta)} | ${e.directionTag} | ${e.passes ? "✓" : "✗ " + e.failReasons.join("; ")} |`,
  ).join("\n");
  const t2Rows = t2.map((e) =>
    `| \`${e.field}\` | ${e.n} | ${fmtPct(e.midHitPctT2)} | ${e.uniqueRanges} | ${fmtPctSigned(e.signedMeanRelDelta)} ± ${fmtPct(e.stdRelDelta)} | ${e.directionTag} | ${e.passes ? "✓" : "✗ " + e.failReasons.join("; ")} |`,
  ).join("\n");
  const t3Rows = t3.map((e) =>
    `| \`${e.field}\` | ${e.n} | ${fmtPct(e.inclusionPct)} | ${e.uniqueRanges} | ${fmtPctSigned(e.signedMeanRelDelta)} ± ${fmtPct(e.stdRelDelta)} | ${e.directionTag} | ${e.passes ? "✓" : "✗ " + e.failReasons.join("; ")} |`,
  ).join("\n");

  const exemptList = evals.filter((e) => e.exemption !== null);
  const exemptRows = exemptList.map((e) =>
    `| \`${e.field}\` | ${e.tier} | ${e.exemption!.class} | ${e.passes ? "PASS (already)" : (isExempting(e.exemption!.class) ? "FAIL → PASS (exempt)" : "FAIL (not exempt)")} | ${e.exemption!.rationale} |`,
  ).join("\n");

  return `# OT-A.3 Path 3 — Verdict-layer Parity (respec evaluation)

**Generated:** ${new Date().toISOString()}
**Source:** \`${RAW_PATH}\` (offline transform — no Opus rerun)
**Spec:** \`docs/operational-tooling/OT-A-3-path3-respec.md\`
**Exemptions:** \`docs/operational-tooling/OT-A-3-parity-exemptions.md\`

## Verdict (raw) — ${allPass ? "PASS — OT-A.4 unblocked" : "FAIL — see misses below"}

| Gate | Pass | Detail |
|---|---|---|
| Tier 1 (8 fields, per-field) | ${t1AllPass ? "✓" : "✗"} | ${t1Pass}/${t1.length} fields pass |
| Tier 2 (17 fields, per-field) | ${t2AllPass ? "✓" : "✗"} | ${t2Pass}/${t2.length} fields pass |
| Tier 3 (16 fields, per-field) | ${t3AllPass ? "✓" : "✗"} | ${t3Pass}/${t3.length} fields pass |
| Mode-collapse (unique ≥ 3, exempt incentiveFee) | ${collapsePass ? "✓" : "✗"} | — |

## Verdict (exemption-adjusted) — ${allPassAdj ? "PASS — OT-A.4 unblocked" : (t1UnblockMet ? "PARTIAL — T1 unblock criterion MET; T2/T3/collapse still blocking full parity" : "FAIL — T1 unblock criterion NOT MET")}

| Gate | Pass | Detail |
|---|---|---|
| **Tier 1** (OT-A.4 unblock criterion ≥ 7/8) | ${t1UnblockMet ? "✓" : "✗"} | ${t1PassAdj}/${t1.length} fields pass (raw ${t1Pass}/${t1.length} + ${t1PassAdj - t1Pass} exempted) |
| Tier 2 | ${t2AllPassAdj ? "✓" : "✗"} | ${t2PassAdj}/${t2.length} fields pass |
| Tier 3 | ${t3AllPassAdj ? "✓" : "✗"} | ${t3PassAdj}/${t3.length} fields pass |
| Mode-collapse | ${collapsePassAdj ? "✓" : "✗"} | — |

## Exemptions applied

| Field | Tier | Class | Effect | Rationale |
|---|---|---|---|---|
${exemptRows}

See \`docs/operational-tooling/OT-A-3-parity-exemptions.md\` for the
full class definitions and qualification bars.

## Tier 1 — foundational

Gate: bucket-match ≥ 55% AND midpoint within ±10% of legacy ≥ 90%
(absolute fallback ±1pp when |legacy| < 0.5).

| Field | n | Bucket | ±10% mid | Unique | Signed Δ ± σ | Bias | Verdict |
|---|---|---|---|---|---|---|---|
${t1Rows}

## Tier 2 — structural

Gate: midpoint within ±20% of legacy ≥ 85% (absolute fallback ±2pp).

| Field | n | ±20% mid | Unique | Signed Δ ± σ | Bias | Verdict |
|---|---|---|---|---|---|---|
${t2Rows}

## Tier 3 — technical

Gate: legacy point within new range ≥ 80% (absolute fallback ±3pp).

| Field | n | Inclusion | Unique | Signed Δ ± σ | Bias | Verdict |
|---|---|---|---|---|---|---|
${t3Rows}

## Direction-of-failure summary

For any failing field, **bias** column distinguishes:
  - **bias-up / bias-down** — new path is systematically higher / lower
    than legacy. Field-level fix likely required (definition tighten,
    prompt anchor, benchmark injection).
  - **unbiased-noise** — new path drifts symmetrically around legacy.
    This is two stochastic Opus runs disagreeing within their natural
    spread; not blocking under the noise-floor argument.

\`signed Δ ± σ\` is mean ± std dev of \`(new.mid − legacy.mid) / max(|legacy.mid|, 0.5)\`
across the 20 cases.

## Adapter rules
None — this revision drops the verdict adapter entirely. The respec
measures value-agreement (midpoint + range inclusion), not
representation-agreement (severity + action). See respec doc for
the full rationale.
`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  const raw: RawCase[] = JSON.parse(readFileSync(RAW_PATH, "utf8"));

  // Bucket comparisons by field
  const byField = new Map<string, RawComparison[]>();
  for (const c of raw) {
    if (!c.oldOk || !c.newOk) continue;
    for (const cmp of c.comparisons) {
      const t = tierOf(cmp.field);
      if (t === null) continue;  // only score canonical/tiered fields
      const arr = byField.get(cmp.field) ?? [];
      arr.push(cmp);
      byField.set(cmp.field, arr);
    }
  }

  const evals: FieldEval[] = [];
  for (const [field, comps] of byField) {
    const tier = tierOf(field)!;
    evals.push(evalField(field, tier, comps));
  }

  // Sort: failing first within each tier, then by tier
  evals.sort((a, b) => {
    const tierOrder = { T1: 0, T2: 1, T3: 2 };
    if (tierOrder[a.tier] !== tierOrder[b.tier]) return tierOrder[a.tier] - tierOrder[b.tier];
    if (a.passes !== b.passes) return a.passes ? 1 : -1;
    return a.field.localeCompare(b.field);
  });

  const report = buildReport(evals);
  writeFileSync(OUT_PATH, report);

  // Console summary
  const t1 = evals.filter((e) => e.tier === "T1");
  const t2 = evals.filter((e) => e.tier === "T2");
  const t3 = evals.filter((e) => e.tier === "T3");
  const collapsePass = evals.every((e) =>
    e.uniqueRanges >= COLLAPSE_MIN_UNIQUE || KNOWN_COLLAPSE_EXEMPT.has(e.field),
  );

  const t1AdjPass = t1.filter((e) => e.passesAdjusted).length;
  const t2AdjPass = t2.filter((e) => e.passesAdjusted).length;
  const t3AdjPass = t3.filter((e) => e.passesAdjusted).length;
  const collapsePassAdj = evals.every((e) =>
    e.uniqueRanges >= COLLAPSE_MIN_UNIQUE
      || KNOWN_COLLAPSE_EXEMPT.has(e.field)
      || (e.exemption !== null && isExempting(e.exemption.class)),
  );

  console.log(`\nOT-A.3 verdict-layer parity (offline, tier-based)\n`);
  console.log(`  RAW:`);
  console.log(`    Tier 1: ${t1.filter((e) => e.passes).length}/${t1.length} fields pass`);
  console.log(`    Tier 2: ${t2.filter((e) => e.passes).length}/${t2.length} fields pass`);
  console.log(`    Tier 3: ${t3.filter((e) => e.passes).length}/${t3.length} fields pass`);
  console.log(`    Mode collapse gate: ${collapsePass ? "PASS" : "FAIL"}`);
  console.log(`  EXEMPTION-ADJUSTED:`);
  console.log(`    Tier 1: ${t1AdjPass}/${t1.length} fields pass  ${t1AdjPass >= 7 ? "[OT-A.4 unblock criterion MET]" : "[OT-A.4 unblock criterion NOT MET]"}`);
  console.log(`    Tier 2: ${t2AdjPass}/${t2.length} fields pass`);
  console.log(`    Tier 3: ${t3AdjPass}/${t3.length} fields pass`);
  console.log(`    Mode collapse gate: ${collapsePassAdj ? "PASS" : "FAIL"}`);

  console.log(`\n  Wrote ${OUT_PATH}\n`);

  console.log("Tier 1 detail:");
  for (const e of t1) {
    const rawV = e.passes ? "PASS" : "FAIL";
    const adjV = e.passesAdjusted ? "PASS" : "FAIL";
    const exemptTag = e.exemption ? `  [${e.exemption.class}]` : "";
    const verdictStr = rawV === adjV ? rawV.padEnd(5) : `${rawV}→${adjV}`;
    console.log(`  ${e.field.padEnd(18)} ${verdictStr.padEnd(10)} bucket=${fmtPct(e.bucketMatchPct).padStart(4)} mid±10=${fmtPct(e.midHitPct).padStart(4)} uniq=${String(e.uniqueRanges).padStart(2)} bias=${e.directionTag}${exemptTag}${e.passes ? "" : "  | " + e.failReasons.join("; ")}`);
  }

  console.log("\nTier 2 misses:");
  for (const e of t2.filter((x) => !x.passes)) {
    console.log(`  ${e.field.padEnd(20)} mid±20=${fmtPct(e.midHitPctT2).padStart(4)} uniq=${e.uniqueRanges} bias=${e.directionTag} signed=${fmtPctSigned(e.signedMeanRelDelta)}±${fmtPct(e.stdRelDelta)}  | ${e.failReasons.join("; ")}`);
  }
  console.log("\nTier 3 misses:");
  for (const e of t3.filter((x) => !x.passes)) {
    console.log(`  ${e.field.padEnd(20)} inclusion=${fmtPct(e.inclusionPct).padStart(4)} uniq=${e.uniqueRanges} bias=${e.directionTag} signed=${fmtPctSigned(e.signedMeanRelDelta)}±${fmtPct(e.stdRelDelta)}  | ${e.failReasons.join("; ")}`);
  }

  const allPass =
    t1.every((e) => e.passes) &&
    t2.every((e) => e.passes) &&
    t3.every((e) => e.passes) &&
    collapsePass;
  console.log(`\n  VERDICT: ${allPass ? "PASS — OT-A.4 unblocked" : "FAIL — field-level remediation list above"}`);
  process.exit(allPass ? 0 : 1);
}

main();
