import { describe, it, expect } from "vitest";
import { computeMIRR } from "./mirr.js";

describe("computeMIRR()", () => {
  it("returns null and is_valid=false when fewer than 2 periods are supplied", () => {
    const out = computeMIRR({
      cash_flow_vector: [-1000],
      finance_rate: 0.10,
      reinvestment_rate: 0.12,
    });
    expect(out.is_valid).toBe(false);
    expect(out.mirr).toBeNull();
    expect(out.warnings[0]).toContain("at least 2 periods");
  });

  it("returns null and is_valid=false when there are no negative cash flows", () => {
    const out = computeMIRR({
      cash_flow_vector: [0, 500, 500, 500],
      finance_rate: 0.10,
      reinvestment_rate: 0.12,
    });
    expect(out.is_valid).toBe(false);
    expect(out.mirr).toBeNull();
    expect(out.warnings[0]).toContain("No negative cash flows");
  });

  it("returns null and is_valid=false when there are no positive cash flows", () => {
    const out = computeMIRR({
      cash_flow_vector: [-1000, 0, 0, 0],
      finance_rate: 0.10,
      reinvestment_rate: 0.12,
    });
    expect(out.is_valid).toBe(false);
    expect(out.mirr).toBeNull();
    expect(out.warnings[0]).toContain("No positive cash flows");
  });

  it("computes MIRR correctly for a terminal-only payoff (golden value)", () => {
    // cash_flows: [-1000, 0, 0, 0, 0, 1500]  — 5 periods
    // PV of negatives: -1000 / 1.10^0 = -1000
    // FV of positives: 1500 * 1.12^0 = 1500  (terminal period; 0 remaining)
    // MIRR = (1500 / 1000)^(1/5) - 1 = 1.5^0.2 - 1 ≈ 0.08447
    const out = computeMIRR({
      cash_flow_vector: [-1000, 0, 0, 0, 0, 1500],
      finance_rate: 0.10,
      reinvestment_rate: 0.12,
    });
    expect(out.is_valid).toBe(true);
    expect(out.mirr).not.toBeNull();
    expect(out.mirr!).toBeCloseTo(0.08447, 3);
  });

  it("computes MIRR correctly for equal annual cash flows (golden value)", () => {
    // cash_flows: [-1000, 200, 200, 200, 200, 200]  — 5 periods
    // PV of negatives: -1000 / 1.10^0 = -1000
    // FV of positives:
    //   t=1: 200 * 1.12^4 = 314.70   t=2: 200 * 1.12^3 = 280.99
    //   t=3: 200 * 1.12^2 = 250.88   t=4: 200 * 1.12^1 = 224.00
    //   t=5: 200 * 1.12^0 = 200.00   total FV ≈ 1270.57
    // MIRR = (1270.57 / 1000)^(1/5) - 1 ≈ 0.04895
    const out = computeMIRR({
      cash_flow_vector: [-1000, 200, 200, 200, 200, 200],
      finance_rate: 0.10,
      reinvestment_rate: 0.12,
    });
    expect(out.is_valid).toBe(true);
    expect(out.mirr!).toBeCloseTo(0.04895, 3);
  });

  it("uses the finance_rate to discount negative flows and reinvestment_rate for positive flows independently", () => {
    // When finance_rate changes but reinvestment_rate and cash flows are the same,
    // only the PV of negatives changes; since there is only one negative at t=0,
    // PV = cf / (1+r)^0 = cf, so different finance rates produce the same MIRR here.
    const base = computeMIRR({
      cash_flow_vector: [-1000, 0, 0, 0, 1500],
      finance_rate: 0.05,
      reinvestment_rate: 0.12,
    });
    const alt = computeMIRR({
      cash_flow_vector: [-1000, 0, 0, 0, 1500],
      finance_rate: 0.20,
      reinvestment_rate: 0.12,
    });
    // Both should be valid with the same value (t=0 negative; finance_rate not applied at t=0)
    expect(base.is_valid).toBe(true);
    expect(alt.is_valid).toBe(true);
    expect(base.mirr!).toBeCloseTo(alt.mirr!, 6);
  });

  it("produces a lower MIRR when the reinvestment_rate is lower (all else equal)", () => {
    const high = computeMIRR({
      cash_flow_vector: [-1000, 200, 200, 200, 200, 200],
      finance_rate: 0.10,
      reinvestment_rate: 0.15,
    });
    const low = computeMIRR({
      cash_flow_vector: [-1000, 200, 200, 200, 200, 200],
      finance_rate: 0.10,
      reinvestment_rate: 0.05,
    });
    expect(high.mirr!).toBeGreaterThan(low.mirr!);
  });

  it("handles a two-period case (minimum valid input)", () => {
    // cash_flows: [-500, 600]  — 1 period
    // FV of positives: 600 * 1.12^(1-1) = 600
    // PV of negatives: -500 / 1.10^0 = -500
    // MIRR = (600/500)^(1/1) - 1 = 0.20
    const out = computeMIRR({
      cash_flow_vector: [-500, 600],
      finance_rate: 0.10,
      reinvestment_rate: 0.12,
    });
    expect(out.is_valid).toBe(true);
    expect(out.mirr!).toBeCloseTo(0.20, 6);
  });
});
