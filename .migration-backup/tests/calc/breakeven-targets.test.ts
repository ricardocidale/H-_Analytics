/**
 * tests/calc/breakeven-targets.test.ts — Pure-math tests for the reverse-solve.
 *
 * Forward-verify integration with the engine lives in
 * tests/integration/breakeven-targets.engine.test.ts (separate file so the
 * pure module stays import-light and quick).
 */
import { describe, it, expect } from "vitest";
import {
  computeBreakevenTargets,
  type BreakevenTargetsInput,
  type BreakevenIrrSample,
} from "../../calc/analysis/breakeven-targets.js";
import {
  BREAKEVEN_TARGET_DSCR_FLOOR,
  BREAKEVEN_PROXIMITY_RATIO,
} from "../../shared/constants.js";

function makeInput(overrides: Partial<BreakevenTargetsInput> = {}): BreakevenTargetsInput {
  // Baseline: 100-key hotel-style numbers chosen so the deal services debt
  // comfortably (ANOI > DS) and the panel returns "above" badges by default.
  return {
    currentAdr: 200,
    currentOccupancy: 0.70,
    currentGoingInCap: 0.085,
    currentDebtRate: 0.065,
    currentTerminalCap: 0.085,
    baseAnoiAnnual: 1_000_000,
    anoiSlopePerRevenueScale: 800_000,
    annualDebtService: 700_000,
    loanAmount: 7_500_000,
    termMonths: 360,
    purchasePrice: 12_000_000,
    irrSamples: [
      { exitCap: 0.06, irr: 0.18 },
      { exitCap: 0.10, irr: 0.10 },
      { exitCap: 0.15, irr: 0.04 },
      { exitCap: 0.22, irr: -0.05 },
    ],
    ...overrides,
  };
}

describe("computeBreakevenTargets — revenue-scale math", () => {
  it("solves ADR/Occupancy/RevPAR with the same implied scale", () => {
    const input = makeInput();
    const out = computeBreakevenTargets(input);
    const adr = out.rows.find((r) => r.key === "adr")!;
    const occ = out.rows.find((r) => r.key === "occupancy")!;
    const revpar = out.rows.find((r) => r.key === "revpar")!;

    expect(adr.breakeven).not.toBeNull();
    expect(occ.breakeven).not.toBeNull();
    expect(revpar.breakeven).not.toBeNull();

    // s* = 1 + (annualDS − ANOI₀) / slope
    //    = 1 + (700_000 − 1_000_000) / 800_000
    //    = 1 + (−300_000 / 800_000) = 0.625
    const expectedScale = 1 + (700_000 - 1_000_000) / 800_000;
    expect(adr.breakeven! / input.currentAdr).toBeCloseTo(expectedScale, 6);
    expect(occ.breakeven! / input.currentOccupancy).toBeCloseTo(expectedScale, 6);
    const currentRevPar = input.currentAdr * input.currentOccupancy;
    expect(revpar.breakeven! / currentRevPar).toBeCloseTo(expectedScale, 6);
  });

  it("returns 'above' status when current ANOI exceeds debt service", () => {
    const out = computeBreakevenTargets(makeInput());
    expect(out.rows.find((r) => r.key === "adr")!.status).toBe("above");
    expect(out.rows.find((r) => r.key === "occupancy")!.status).toBe("above");
  });

  it("flags 'close to breakeven' when current is within proximity ratio", () => {
    // Pick numbers so breakeven ≈ 95 % of current → within proximity ratio (10 %).
    // s = 0.95 ⇒ (annualDS − ANOI₀)/slope = −0.05 ⇒ annualDS = ANOI₀ − 0.05·slope.
    const slope = 800_000;
    const baseAnoi = 1_000_000;
    const annualDS = baseAnoi - 0.05 * slope;
    const out = computeBreakevenTargets(
      makeInput({
        baseAnoiAnnual: baseAnoi,
        anoiSlopePerRevenueScale: slope,
        annualDebtService: annualDS,
      }),
    );
    const adr = out.rows.find((r) => r.key === "adr")!;
    expect(adr.status).toBe("close");
    // Sanity: |gap| / current ≤ proximity ratio.
    expect(Math.abs(adr.gap!) / 200).toBeLessThanOrEqual(BREAKEVEN_PROXIMITY_RATIO + 1e-9);
  });

  it("returns null breakeven when slope is non-positive", () => {
    const out = computeBreakevenTargets(
      makeInput({ anoiSlopePerRevenueScale: 0 }),
    );
    const adr = out.rows.find((r) => r.key === "adr")!;
    expect(adr.breakeven).toBeNull();
    expect(adr.status).toBe("unsolvable");
    expect(adr.reason).toMatch(/cannot solve/i);
  });
});

describe("computeBreakevenTargets — going-in cap closed form", () => {
  it("breakeven cap = (annualDS × DSCRfloor) / purchasePrice", () => {
    const input = makeInput();
    const out = computeBreakevenTargets(input);
    const row = out.rows.find((r) => r.key === "goingInCap")!;
    expect(row.breakeven).toBeCloseTo(
      (input.annualDebtService * BREAKEVEN_TARGET_DSCR_FLOOR) / input.purchasePrice,
      8,
    );
  });

  it("treats lower current cap (vs breakeven) as 'below' (worse)", () => {
    const out = computeBreakevenTargets(
      // currentGoingInCap < (DS × DSCR) / PP ⇒ deal yield is below floor.
      makeInput({ currentGoingInCap: 0.04, purchasePrice: 12_000_000, annualDebtService: 700_000 }),
    );
    const row = out.rows.find((r) => r.key === "goingInCap")!;
    expect(row.status).toBe("below");
  });

  it("returns null when purchase price is invalid", () => {
    const out = computeBreakevenTargets(makeInput({ purchasePrice: 0 as unknown as number }));
    const row = out.rows.find((r) => r.key === "goingInCap")!;
    expect(row.breakeven).toBeNull();
  });
});

describe("computeBreakevenTargets — debt-rate PMT inversion", () => {
  it("breakeven rate yields PMT × 12 ≈ ANOI / DSCRfloor", async () => {
    const input = makeInput();
    const out = computeBreakevenTargets(input);
    const row = out.rows.find((r) => r.key === "debtRate")!;
    expect(row.breakeven).not.toBeNull();
    const r = row.breakeven!;
    // Recompute the implied annual payment and compare to ANOI/DSCR floor.
    const { pmt } = await import("../../calc/shared/pmt.js");
    const monthly = pmt(input.loanAmount, r / 12, input.termMonths);
    const annual = monthly * 12;
    const target = input.baseAnoiAnnual / BREAKEVEN_TARGET_DSCR_FLOOR;
    expect(annual).toBeCloseTo(target, 0);
  });

  it("returns null when ANOI cannot service the loan even at zero interest", () => {
    // loan / term × 12 must exceed ANOI/DSCR. Use a huge loan against tiny ANOI.
    const out = computeBreakevenTargets(
      makeInput({
        loanAmount: 100_000_000,
        termMonths: 60,
        baseAnoiAnnual: 100_000,
      }),
    );
    const row = out.rows.find((r) => r.key === "debtRate")!;
    expect(row.breakeven).toBeNull();
    expect(row.status).toBe("unsolvable");
  });
});

describe("computeBreakevenTargets — terminal cap interpolation", () => {
  it("interpolates IRR=0 between bracketing samples", () => {
    const samples: BreakevenIrrSample[] = [
      { exitCap: 0.10, irr: 0.05 },
      { exitCap: 0.20, irr: -0.05 },
    ];
    const out = computeBreakevenTargets(makeInput({ irrSamples: samples }));
    const row = out.rows.find((r) => r.key === "terminalCap")!;
    // Linear midpoint of an exact symmetric bracket.
    expect(row.breakeven).toBeCloseTo(0.15, 6);
  });

  it("returns null when no samples bracket IRR=0", () => {
    const out = computeBreakevenTargets(
      makeInput({
        irrSamples: [
          { exitCap: 0.06, irr: 0.20 },
          { exitCap: 0.22, irr: 0.15 },
        ],
      }),
    );
    const row = out.rows.find((r) => r.key === "terminalCap")!;
    expect(row.breakeven).toBeNull();
    expect(row.status).toBe("unsolvable");
  });

  it("returns null when fewer than 2 samples are provided", () => {
    const out = computeBreakevenTargets(makeInput({ irrSamples: [] }));
    const row = out.rows.find((r) => r.key === "terminalCap")!;
    expect(row.breakeven).toBeNull();
  });
});

describe("computeBreakevenTargets — output shape and metadata", () => {
  it("produces exactly six rows in canonical order", () => {
    const out = computeBreakevenTargets(makeInput());
    expect(out.rows.map((r) => r.key)).toEqual([
      "adr",
      "occupancy",
      "revpar",
      "goingInCap",
      "debtRate",
      "terminalCap",
    ]);
  });

  it("echoes thresholds in meta", () => {
    const out = computeBreakevenTargets(makeInput());
    expect(out.meta.targetDscrFloor).toBe(BREAKEVEN_TARGET_DSCR_FLOOR);
    expect(out.meta.proximityRatio).toBe(BREAKEVEN_PROXIMITY_RATIO);
    expect(out.meta.annualDebtService).toBe(700_000);
    expect(out.meta.baseAnoiAnnual).toBe(1_000_000);
  });
});
