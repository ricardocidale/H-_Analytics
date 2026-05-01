import { describe, it, expect } from "vitest";
import { computeRevPARIndex } from "../../calc/analysis/revpar-index.js";
import type { RevPARIndexInput } from "../../calc/analysis/revpar-index.js";

const rounding = { precision: 2, bankers_rounding: false };

function makeInput(overrides: Partial<RevPARIndexInput> = {}): RevPARIndexInput {
  return {
    room_count: 30,
    adr: 350,
    occupancy: 0.75,
    market_adr: 300,
    market_occupancy: 0.70,
    rounding_policy: rounding,
    ...overrides,
  };
}

describe("RevPAR Index Calculator", () => {
  it("computes property and market RevPAR", () => {
    const result = computeRevPARIndex(makeInput());
    expect(result.property_revpar).toBe(262.5);
    expect(result.market_revpar).toBe(210);
  });

  it("computes MPI (occupancy penetration)", () => {
    const result = computeRevPARIndex(makeInput());
    expect(result.mpi).toBeCloseTo(1.0714, 3);
  });

  it("computes ARI (rate penetration)", () => {
    const result = computeRevPARIndex(makeInput());
    expect(result.ari).toBeCloseTo(1.1667, 3);
  });

  it("computes RGI (revenue generation index)", () => {
    const result = computeRevPARIndex(makeInput());
    expect(result.rgi).toBe(1.25);
  });

  it("flags outperforming when RGI > 1.05", () => {
    const result = computeRevPARIndex(makeInput());
    expect(result.penetration_assessment).toBe("outperforming");
  });

  it("flags underperforming when RGI < 0.95", () => {
    const result = computeRevPARIndex(makeInput({ adr: 200, occupancy: 0.55 }));
    expect(result.penetration_assessment).toBe("underperforming");
  });

  it("flags at_market when RGI is near 1.0", () => {
    const result = computeRevPARIndex(makeInput({ adr: 300, occupancy: 0.70 }));
    expect(result.penetration_assessment).toBe("at_market");
  });

  it("computes comp set indices when provided", () => {
    const result = computeRevPARIndex(makeInput({
      comp_set_adr: 320,
      comp_set_occupancy: 0.72,
    }));
    expect(result.comp_set_revpar).toBe(230.4);
    expect(result.comp_mpi).not.toBeNull();
    expect(result.comp_ari).not.toBeNull();
    expect(result.comp_rgi).not.toBeNull();
  });

  it("returns null comp indices when no comp set", () => {
    const result = computeRevPARIndex(makeInput());
    expect(result.comp_set_revpar).toBeNull();
    expect(result.comp_mpi).toBeNull();
    expect(result.comp_ari).toBeNull();
    expect(result.comp_rgi).toBeNull();
  });

  it("computes available and sold room nights", () => {
    const result = computeRevPARIndex(makeInput());
    expect(result.available_room_nights).toBe(10950);
    expect(result.sold_room_nights).toBe(8213);
  });

  it("computes total room revenue", () => {
    const result = computeRevPARIndex(makeInput());
    expect(result.room_revenue).toBe(2874550);
  });

  it("handles zero market values gracefully", () => {
    const result = computeRevPARIndex(makeInput({ market_adr: 0, market_occupancy: 0 }));
    expect(result.mpi).toBe(0);
    expect(result.ari).toBe(0);
    expect(result.rgi).toBe(0);
  });
});
