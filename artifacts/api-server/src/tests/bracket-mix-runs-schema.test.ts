/**
 * bracket_mix_runs + bracket_mix_dual_run_diffs — Phase B U2 schema test
 *
 * Verifies that the new provenance, diff-log, and override-sentinel shapes
 * compile and have the FK / nullability properties the plan requires.
 *
 * Plan: docs/plans/2026-05-13-001-feat-icp-bracket-mix-peer-derived-phase-b-plan.md
 */
import { describe, it, expectTypeOf } from "vitest";
import type {
  BracketMixRun,
  InsertBracketMixRun,
  BracketMixDualRunDiff,
  InsertBracketMixDualRunDiff,
  GlobalAssumptions,
  BracketMixData,
} from "@workspace/db/schema";

describe("bracket_mix_runs — Phase B U2 (R10)", () => {
  it("mix_value is required and typed as BracketMixData (engine-readable)", () => {
    expectTypeOf<BracketMixRun["mixValue"]>().toEqualTypeOf<BracketMixData>();
  });

  it("target_kind is required text (discriminator: peer | company | global_default)", () => {
    expectTypeOf<BracketMixRun["targetKind"]>().toEqualTypeOf<string>();
  });

  it("target_id is nullable (global_default rows have target_id IS NULL)", () => {
    expectTypeOf<BracketMixRun["targetId"]>().toEqualTypeOf<number | null>();
  });

  it("provisional is a non-null boolean (R4 cold-start marker)", () => {
    expectTypeOf<BracketMixRun["provisional"]>().toEqualTypeOf<boolean>();
  });

  it("optional fields can be omitted on insert", () => {
    const insert: InsertBracketMixRun = {
      targetKind: "global_default",
      mixValue: { entries: [] },
    };
    void insert;
  });
});

describe("bracket_mix_dual_run_diffs — Phase B U2 (R11)", () => {
  it("phase_b_mix is nullable (records error case where Phase B side threw)", () => {
    expectTypeOf<BracketMixDualRunDiff["phaseBMix"]>().toEqualTypeOf<
      BracketMixData | null
    >();
  });

  it("legacy_mix is nullable (records error case where legacy side threw)", () => {
    expectTypeOf<BracketMixDualRunDiff["legacyMix"]>().toEqualTypeOf<
      BracketMixData | null
    >();
  });

  it("phase_b_run_id is nullable FK to bracket_mix_runs.id", () => {
    expectTypeOf<BracketMixDualRunDiff["phaseBRunId"]>().toEqualTypeOf<
      number | null
    >();
  });

  it("notes is nullable text for operator annotations", () => {
    expectTypeOf<BracketMixDualRunDiff["notes"]>().toEqualTypeOf<string | null>();
  });

  it("recompute_at and notes can be omitted on insert (defaults supplied)", () => {
    const insert: InsertBracketMixDualRunDiff = {};
    void insert;
  });
});

describe("global_assumptions — Phase B U2 override sentinel (R7)", () => {
  it("bracket_mix_override_run_id is a nullable FK column", () => {
    expectTypeOf<GlobalAssumptions["bracketMixOverrideRunId"]>().toEqualTypeOf<
      number | null
    >();
  });
});
