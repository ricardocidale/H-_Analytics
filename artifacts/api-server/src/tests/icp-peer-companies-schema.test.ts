/**
 * icp_peer_companies — Phase B U1 schema test
 *
 * Verifies that the five Specialist output columns added in U1 of the Phase B
 * plan compile against the Drizzle table type and are surfaced as nullable on
 * the inferred select shape.
 *
 * Note on path: the plan suggested
 *   `lib/db/src/schema/__tests__/icp-peer-companies.schema.test.ts`
 * but lib/db has no vitest config. Tests for db schema therefore live under
 * api-server (which already imports the schema for migrations and seed wiring).
 */
import { describe, it, expectTypeOf } from "vitest";
import type { IcpPeerCompany, InsertIcpPeerCompany } from "@workspace/db/schema";
import type {
  BrandArchetypeSplit,
  SplitEvidence,
  CostantinoPeerConfig,
} from "@workspace/db/schema";

describe("icp_peer_companies — Phase B Specialist columns (U1)", () => {
  it("brandArchetypeSplit is jsonb, nullable, and typed as BrandArchetypeSplit", () => {
    expectTypeOf<IcpPeerCompany["brandArchetypeSplit"]>().toEqualTypeOf<
      BrandArchetypeSplit | null
    >();
  });

  it("rosterSizeEstimate is an integer nullable column", () => {
    expectTypeOf<IcpPeerCompany["rosterSizeEstimate"]>().toEqualTypeOf<
      number | null
    >();
  });

  it("splitEvidence is jsonb, nullable, and typed as SplitEvidence", () => {
    expectTypeOf<IcpPeerCompany["splitEvidence"]>().toEqualTypeOf<
      SplitEvidence | null
    >();
  });

  it("lastResearchRunId is an integer nullable column (FK to bracket_mix_runs added in U2)", () => {
    expectTypeOf<IcpPeerCompany["lastResearchRunId"]>().toEqualTypeOf<
      number | null
    >();
  });

  it("costantinoConfig is jsonb, nullable, and typed as CostantinoPeerConfig", () => {
    expectTypeOf<IcpPeerCompany["costantinoConfig"]>().toEqualTypeOf<
      CostantinoPeerConfig | null
    >();
  });

  it("the Specialist columns are all optional on InsertIcpPeerCompany", () => {
    const insert: InsertIcpPeerCompany = {
      name: "Test Peer",
    };
    // If any new column were NOT NULL without a default, this object literal
    // would fail to compile. The assertion below makes the test runtime-active.
    void insert;
  });
});
