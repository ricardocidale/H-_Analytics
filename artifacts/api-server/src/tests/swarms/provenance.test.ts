/**
 * Tests for the shared `makeProvenance` helper used by all six swarm builders.
 *
 * The helper was extracted in U8 from inline duplicates across Sofia, Bianca,
 * Chiara, Dario, Elisa, and Felix builders. Existing swarm tests cover only
 * the `lucca → llm` mapping; this file covers the `admin → user` mapping and
 * the timestamp fallback so a future refactor that inverts the conditional
 * (or breaks the timestamp) is caught.
 */
import { describe, it, expect } from "vitest";
import { makeProvenance } from "../../slides/swarms/provenance";

describe("makeProvenance — source mapping", () => {
  it("maps source='lucca' to provenance.source='llm'", () => {
    const result = makeProvenance("lucca", "2026-05-01T12:00:00Z");
    expect(result.source).toBe("llm");
  });

  it("maps source='admin' to provenance.source='user'", () => {
    const result = makeProvenance("admin", "2026-05-01T12:00:00Z");
    expect(result.source).toBe("user");
  });
});

describe("makeProvenance — timestamp handling", () => {
  it("uses the provided approvedAt verbatim when non-null", () => {
    const ts = "2026-05-01T12:00:00.000Z";
    const result = makeProvenance("lucca", ts);
    expect(result.updatedAt).toBe(ts);
  });

  it("falls back to a fresh ISO timestamp when approvedAt is null", () => {
    const before = Date.now();
    const result = makeProvenance("admin", null);
    const after = Date.now();
    const parsed = Date.parse(result.updatedAt);
    expect(Number.isNaN(parsed)).toBe(false);
    expect(parsed).toBeGreaterThanOrEqual(before);
    expect(parsed).toBeLessThanOrEqual(after);
  });
});
