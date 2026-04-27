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
import { FUNDING_SPECIALIST_TRACKED_FIELDS } from "@engine/analyst/surface/mgmt-co/funding-specialist";
import { REVENUE_SPECIALIST_TRACKED_FIELDS } from "@engine/analyst/surface/mgmt-co/revenue-specialist";
import { getFieldRegistryEntry } from "@engine/analyst/registry/field-registry";

interface SpecialistTrackedFields {
  readonly specialistId: string;
  readonly fields: readonly string[];
}

const SPECIALISTS_EMITTING_VERDICT_DIMENSIONS: readonly SpecialistTrackedFields[] = [
  { specialistId: "mgmt-co.funding", fields: FUNDING_SPECIALIST_TRACKED_FIELDS },
  { specialistId: "mgmt-co.revenue", fields: REVENUE_SPECIALIST_TRACKED_FIELDS },
];

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
