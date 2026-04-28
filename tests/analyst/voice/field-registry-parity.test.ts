/**
 * Field-registry parity — every field id any built Specialist emits as
 * `VerdictDimension.field` MUST have an entry in `FIELD_REGISTRY`.
 *
 * Why this test exists:
 * The Voice Renderer's `humanField` consults `FIELD_REGISTRY` first and
 * only falls back to a string-pattern heuristic when the registry is
 * silent. The heuristic produces acceptable output for clean ids but it
 * cannot encode the display unit or the UI mount point — so any
 * Analyst-tracked field that lives only in the heuristic path stays
 * unreachable for deep-link CTAs and for form-label parity.
 *
 * This test enforces the long-tail invariant: as soon as a Specialist
 * emits a new field id (whether by extending `DIMENSION_META` in an
 * existing Specialist or by graduating a new one), that id has to land
 * in the registry at the same time. The test fails loudly if it doesn't,
 * so reviewers don't silently accept a "the heuristic happens to work"
 * regression.
 *
 * Coverage scope:
 * Only Specialists with `status: "built"` in the catalog actually emit
 * `VerdictDimension`s today (mgmt-co.funding and mgmt-co.revenue).
 * Future-built Specialists should add their tracked-fields export here in
 * the same PR that wires their evaluator. Photos / Renders is intentionally
 * excluded — the Photo Enhancer's "output" is a render written to object
 * storage, not a verdict dimension, so its fields don't need a registry
 * entry.
 */
import { describe, expect, it } from "vitest";
import {
  FUNDING_SPECIALIST_TRACKED_FIELDS,
  createFundingSpecialist,
} from "@engine/analyst/surface/mgmt-co/funding-specialist";
import {
  REVENUE_SPECIALIST_TRACKED_FIELDS,
  createRevenueSpecialist,
} from "@engine/analyst/surface/mgmt-co/revenue-specialist";
import { getFieldRegistryEntry } from "@engine/analyst/registry/field-registry";
import { SPECIALIST_CATALOG } from "@engine/analyst/registry/specialist-catalog";
import type { CapitalRaiseInputs } from "@engine/watchdog/capitalRaiseEvaluator";
import type { RevenueInputs } from "@engine/watchdog/revenueEvaluator";
import type { SpecialistContext } from "@engine/analyst/router/surface-router";
import type { AnalystWatchdogBenchmarks } from "@shared/schema";
import type { RevenueBenchmarks } from "@shared/constants-revenue-benchmarks";

interface SpecialistTrackedFields {
  readonly specialistId: string;
  readonly fields: readonly string[];
}

const SPECIALISTS_EMITTING_VERDICT_DIMENSIONS: readonly SpecialistTrackedFields[] = [
  { specialistId: "mgmt-co.funding", fields: FUNDING_SPECIALIST_TRACKED_FIELDS },
  { specialistId: "mgmt-co.revenue", fields: REVENUE_SPECIALIST_TRACKED_FIELDS },
];

/**
 * Catalog ids that are `status: "built"` but legitimately do NOT emit
 * `VerdictDimension`s — and therefore have no tracked-fields export to
 * register in `SPECIALISTS_EMITTING_VERDICT_DIMENSIONS`.
 *
 * Adding a Specialist here is a deliberate opt-out: the meta-check below
 * uses this set to subtract non-verdict-emitting Specialists from the
 * built list before asserting parity coverage. Each entry needs a
 * one-line justification so future reviewers can decide quickly whether
 * a new Specialist genuinely belongs here.
 *
 * If you find yourself adding a Specialist here just to silence the
 * meta-check: stop. The failure is telling you the Specialist will emit
 * verdicts whose fields aren't being parity-checked, which means the
 * Voice Renderer's "Adjust" deep-link CTA will silently disappear for
 * any field it adds. Wire the tracked-fields export instead.
 */
const BUILT_SPECIALISTS_WITHOUT_VERDICT_DIMENSIONS: ReadonlySet<string> = new Set([
  // Letícia: maintains the deterministic toolbox the other Specialists
  // call. Her work product is the `SPECIALIST_TOOLS` registry, not a
  // `VerdictDimension`, so there are no fields for the Adjust CTA to
  // target. See `specialist-catalog.ts` for the rationale on her
  // `status: "built"`.
  "resources.builder",
]);

describe("FIELD_REGISTRY parity — every Specialist-emitted field has an entry", () => {
  it("the parity check has at least one Specialist + one field to cover", () => {
    // Guards against an accidental "I forgot to wire the new Specialist's
    // tracked-fields export, so the loop below ran zero assertions and
    // the test silently passed" regression.
    expect(SPECIALISTS_EMITTING_VERDICT_DIMENSIONS.length).toBeGreaterThan(0);
    for (const { specialistId, fields } of SPECIALISTS_EMITTING_VERDICT_DIMENSIONS) {
      expect(fields.length, `${specialistId} reports zero tracked fields`).toBeGreaterThan(0);
    }
  });

  // Meta-check: catch the "new built Specialist forgot to wire its
  // tracked-fields export" regression class.
  //
  // The per-field assertions below only run for Specialists explicitly
  // listed in `SPECIALISTS_EMITTING_VERDICT_DIMENSIONS`. Without this
  // meta-check, graduating a Specialist from `status: "needs-page"` to
  // `status: "built"` and shipping it without registering its
  // tracked-fields export would leave the new Specialist's verdict
  // fields completely unchecked — the parity loop would skip them,
  // every field that's missing from `FIELD_REGISTRY` would silently
  // fall back to the Voice Renderer's string-pattern heuristic, and
  // the "Adjust" deep-link CTA would silently disappear from the UI
  // because the heuristic cannot encode a `mountPoint`.
  //
  // Driving the check off `SPECIALIST_CATALOG` (the locked single source
  // of truth for the 12 Specialists, see replit.md) means the failure
  // mode is impossible to ignore: the moment `status` flips to "built"
  // in the catalog, this test reads the new id and demands either
  //   (a) a tracked-fields entry in `SPECIALISTS_EMITTING_VERDICT_DIMENSIONS`, or
  //   (b) an explicit opt-out in `BUILT_SPECIALISTS_WITHOUT_VERDICT_DIMENSIONS`
  //       with a written justification.
  // Either path forces a deliberate decision instead of a silent gap.
  it("every built Specialist either emits parity-checked fields or is opted out with a justification", () => {
    const builtSpecialistIds = SPECIALIST_CATALOG.filter((d) => d.status === "built").map(
      (d) => d.id,
    );
    expect(
      builtSpecialistIds.length,
      "SPECIALIST_CATALOG has zero status:'built' entries — the meta-check below would vacuously pass.",
    ).toBeGreaterThan(0);

    const wiredIds = new Set(
      SPECIALISTS_EMITTING_VERDICT_DIMENSIONS.map((s) => s.specialistId),
    );
    const optedOut = BUILT_SPECIALISTS_WITHOUT_VERDICT_DIMENSIONS;

    const unwired = builtSpecialistIds.filter((id) => !wiredIds.has(id) && !optedOut.has(id));
    expect(
      unwired,
      [
        `These built Specialists are neither parity-checked nor opted out: [${unwired.join(", ")}].`,
        "If they emit VerdictDimensions, export a *_SPECIALIST_TRACKED_FIELDS array from the Specialist module and append an entry to SPECIALISTS_EMITTING_VERDICT_DIMENSIONS in this test.",
        "If they legitimately do not emit verdicts, add the id to BUILT_SPECIALISTS_WITHOUT_VERDICT_DIMENSIONS with a one-line justification.",
      ].join(" "),
    ).toEqual([]);

    // Mirror invariant: nothing in the parity array or opt-out set
    // should reference an id that isn't actually in the catalog. Catches
    // typos and rename drift (e.g. someone refactors a Specialist id and
    // leaves a stale entry pointing at the old id, masking the gap).
    const catalogIds = new Set(SPECIALIST_CATALOG.map((d) => d.id));
    const ghostsInWired = [...wiredIds].filter((id) => !catalogIds.has(id));
    expect(
      ghostsInWired,
      `SPECIALISTS_EMITTING_VERDICT_DIMENSIONS references ids absent from SPECIALIST_CATALOG: [${ghostsInWired.join(", ")}]. Likely a Specialist rename — update or remove the entry.`,
    ).toEqual([]);
    const ghostsInOptOut = [...optedOut].filter((id) => !catalogIds.has(id));
    expect(
      ghostsInOptOut,
      `BUILT_SPECIALISTS_WITHOUT_VERDICT_DIMENSIONS references ids absent from SPECIALIST_CATALOG: [${ghostsInOptOut.join(", ")}]. Likely a Specialist rename — update or remove the entry.`,
    ).toEqual([]);
  });

  // Defensive shape check on the registry itself: every entry the parity
  // tests below assert the existence of must have a non-empty `mountPoint`.
  // Done up front (not inside the per-field loop) so a registry-wide
  // mountPoint regression — e.g. a refactor that accidentally clears the
  // slug for a whole tab — fires a single clear failure instead of one
  // failure per field.
  it("every Specialist-tracked field's registry entry carries a non-empty mountPoint", () => {
    const offenders: string[] = [];
    for (const { specialistId, fields } of SPECIALISTS_EMITTING_VERDICT_DIMENSIONS) {
      for (const field of fields) {
        const entry = getFieldRegistryEntry(field);
        if (!entry) {
          offenders.push(`${specialistId}/${field} → no FIELD_REGISTRY entry`);
          continue;
        }
        if (typeof entry.mountPoint !== "string" || entry.mountPoint.trim() === "") {
          offenders.push(`${specialistId}/${field} → empty mountPoint`);
        }
      }
    }
    expect(
      offenders,
      `Fields with missing or empty mountPoint: ${offenders.join("; ")}. The Adjust CTA needs mountPoint to deep-link the user to the right tab.`,
    ).toEqual([]);
  });

  for (const { specialistId, fields } of SPECIALISTS_EMITTING_VERDICT_DIMENSIONS) {
    describe(specialistId, () => {
      for (const field of fields) {
        it(`registry has an entry for "${field}"`, () => {
          const entry = getFieldRegistryEntry(field);
          expect(
            entry,
            `${specialistId} emits VerdictDimension.field="${field}" but FIELD_REGISTRY has no entry. Add one to engine/analyst/registry/field-registry.ts (label + unit + mountPoint).`,
          ).not.toBeNull();
          // Defensive shape check — the entry should carry the three
          // pieces of metadata downstream (Voice Renderer label,
          // formatter unit, deep-link mount point).
          expect(entry?.label).toBeTruthy();
          expect(typeof entry?.unit).toBe("string");
          expect(entry?.mountPoint).toBeTruthy();
        });
      }
    });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// Unit parity — the unit a Specialist actually emits in `range.unit` MUST
// match the registry entry for the same field. Catches the drift class the
// task `Use the registry's display unit instead of duplicating it inside
// each Specialist` was written to eliminate: a Specialist hard-coding its
// own `unit` strings can silently disagree with the registry, so the Voice
// Renderer formats numbers with one unit while the registry-driven UI label
// implies another.
//
// The test exercises each Specialist with stressed inputs that drive every
// dimension out-of-range, which is the path that produces a non-null
// `range` (and therefore a `range.unit` to compare). For ok dimensions
// `range` is null by design — there is nothing to assert there.

const FUNDING_BENCHMARKS: AnalystWatchdogBenchmarks = {
  runwayBufferMonthsLow: 6,
  runwayBufferMonthsMid: 12,
  runwayBufferMonthsHigh: 18,
  sizingOvershootPctLow: 0.1,
  sizingOvershootPctMid: 0.2,
  sizingOvershootPctHigh: 0.3,
  trancheGapMonthsLow: 6,
  trancheGapMonthsMid: 9,
  trancheGapMonthsHigh: 12,
  revenueRampDelayMonthsLow: 3,
  revenueRampDelayMonthsMid: 6,
  revenueRampDelayMonthsHigh: 9,
  burnFlexDownPctLow: 0.15,
  burnFlexDownPctMid: 0.25,
  burnFlexDownPctHigh: 0.35,
} as unknown as AnalystWatchdogBenchmarks;

// All values pinned below the low end of every band so every dimension
// classifies as "below-range" → non-ok severity → range is preserved on
// the emitted RawVerdictDimension.
const FUNDING_STRESSED_INPUTS: CapitalRaiseInputs = {
  runwayBufferMonths: 1,
  sizingOvershootPct: 0.01,
  trancheGapMonths: 1,
  revenueRampDelayMonths: 1,
  burnFlexDownPct: 0.01,
};

const REVENUE_BENCHMARKS: RevenueBenchmarks = {
  marketingRate: { low: 0.04, mid: 0.06, high: 0.08 },
  fbRevenueShare: { low: 0.25, mid: 0.32, high: 0.4 },
  eventsRevenueShare: { low: 0.08, mid: 0.15, high: 0.22 },
  otherRevenueShare: { low: 0.01, mid: 0.03, high: 0.05 },
  cateringBoostPct: { low: 0.0, mid: 0.05, high: 0.15 },
};

const REVENUE_STRESSED_INPUTS: RevenueInputs = {
  marketingRate: 0.5,
  fbRevenueShare: 0.99,
  eventsRevenueShare: 0.99,
  otherRevenueShare: 0.99,
  cateringBoostPct: 0.99,
};

const TEST_CONTEXT: SpecialistContext = {
  persona: { segment: "L+B", tier: "luxury", market: "US" },
  now: new Date("2026-04-26T00:00:00Z"),
};

const TEST_EVIDENCE_AS_OF = "2026-04-26";

describe("FIELD_REGISTRY unit parity — Specialists emit registry-matching units", () => {
  it("Funding Specialist Tier-0 path: every emitted range.unit equals FIELD_REGISTRY.unit", async () => {
    const specialist = createFundingSpecialist(FUNDING_BENCHMARKS, {
      evidenceAsOf: TEST_EVIDENCE_AS_OF,
    });
    const out = await specialist(FUNDING_STRESSED_INPUTS, TEST_CONTEXT);
    expect(out.dimensions.length).toBeGreaterThan(0);
    for (const dim of out.dimensions) {
      const entry = getFieldRegistryEntry(dim.field);
      expect(entry, `no FIELD_REGISTRY entry for "${dim.field}"`).not.toBeNull();
      expect(
        dim.range,
        `Funding Specialist emitted range=null for stressed dimension "${dim.field}" — fixture drift means the unit assertion below cannot run; tighten the fixture so this dimension classifies as out-of-range.`,
      ).not.toBeNull();
      expect(
        dim.range?.unit,
        `Funding Specialist range.unit drifted from FIELD_REGISTRY for "${dim.field}". The Specialist must read its display unit from FIELD_REGISTRY (see funding-specialist.ts:unitFor) rather than carrying its own copy.`,
      ).toBe(entry?.unit);
    }
  });

  it("Revenue Specialist Tier-0 path: every emitted range.unit equals FIELD_REGISTRY.unit", async () => {
    const specialist = createRevenueSpecialist(REVENUE_BENCHMARKS, {
      evidenceAsOf: TEST_EVIDENCE_AS_OF,
    });
    const out = await specialist(REVENUE_STRESSED_INPUTS, TEST_CONTEXT);
    expect(out.dimensions.length).toBeGreaterThan(0);
    for (const dim of out.dimensions) {
      const entry = getFieldRegistryEntry(dim.field);
      expect(entry, `no FIELD_REGISTRY entry for "${dim.field}"`).not.toBeNull();
      expect(
        dim.range,
        `Revenue Specialist emitted range=null for stressed dimension "${dim.field}" — fixture drift means the unit assertion below cannot run; tighten the fixture so this dimension classifies as out-of-range.`,
      ).not.toBeNull();
      expect(
        dim.range?.unit,
        `Revenue Specialist range.unit drifted from FIELD_REGISTRY for "${dim.field}". The Specialist must read its display unit from FIELD_REGISTRY (see revenue-specialist.ts:unitFor) rather than carrying its own copy.`,
      ).toBe(entry?.unit);
    }
  });
});
