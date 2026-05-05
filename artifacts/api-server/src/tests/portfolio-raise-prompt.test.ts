/**
 * Portfolio raise prompt tests — guards that all PortfolioRaiseAnalysisSummary
 * fields are serialized into the user prompt (silent-drop prevention), and that
 * the system prompt contains LP-grade analysis norms and engine integrity caveats.
 */
import { describe, it, expect } from "vitest";
import {
  buildPortfolioRaiseSystemPrompt,
  buildPortfolioRaiseUserPrompt,
} from "../ai/specialists/portfolio-raise-prompt";
import type {
  PortfolioRaisePromptInputContext,
  PortfolioPropertyEquityRow,
} from "../ai/specialists/portfolio-raise-prompt-input-builder";
import type { LpDealComparable } from "../ai/specialists/portfolio-raise-runner";

// ────────────────────────────────────────────────────────────────────────────
// Stubs

const STUB_PROPERTY_ROW: PortfolioPropertyEquityRow = {
  propertyIndex: 0,
  propertyLabel: "Property A",
  equityRequired: 2_500_000,
  deploymentMonth: 2,
  ltv: 0.65,
  estimatedDscr: 1.35,
};

const STUB_PROPERTY_ROW_2: PortfolioPropertyEquityRow = {
  propertyIndex: 1,
  propertyLabel: "Property B",
  equityRequired: 1_800_000,
  deploymentMonth: 8,
  ltv: 0.60,
  estimatedDscr: 1.28,
};

const STUB_CTX: PortfolioRaisePromptInputContext = {
  analysisSummary: {
    totalEquityRequired: 4_300_000,
    firstCloseMinimum: 1_500_000,
    portfolioDscrBlended: 1.32,
    rampOverlapWindowCount: 1,
    peakConcurrentRampCount: 2,
    impliedIrr: 0.148,
    rampCarryUnderstated: true,
    perPropertyEquity: [STUB_PROPERTY_ROW, STUB_PROPERTY_ROW_2],
  },
  persona: { verticalSlug: "boutique-luxury", marketTier: "L+B", locale: "US" },
};

const STUB_COMPARABLES: readonly LpDealComparable[] = [
  {
    operator: "Boutique Fund I",
    vintage: 2022,
    vertical: "boutique-luxury",
    propertyCount: 3,
    totalEquityUsd: 9_000_000,
    firstClosePct: 0.40,
    dscrAtStabilization: 1.30,
    leveredIrr: 0.155,
    source: "public disclosure",
    asOf: "2022-06-01",
  },
];

// ────────────────────────────────────────────────────────────────────────────
// System prompt tests

describe("buildPortfolioRaiseSystemPrompt", () => {
  it("contains the primary question for LP capital raise", () => {
    const prompt = buildPortfolioRaiseSystemPrompt();
    expect(prompt).toContain("Can this portfolio of investment properties support a fundable LP capital raise");
  });

  it("contains European waterfall reference", () => {
    const prompt = buildPortfolioRaiseSystemPrompt();
    expect(prompt.toLowerCase()).toContain("european waterfall");
  });

  it("contains engine integrity caveat for refi understated", () => {
    const prompt = buildPortfolioRaiseSystemPrompt();
    expect(prompt).toContain("refi-at-exit equity projections may be understated");
  });

  it("contains LP preferred return and GP carry", () => {
    const prompt = buildPortfolioRaiseSystemPrompt();
    expect(prompt).toContain("Preferred return");
    expect(prompt).toContain("GP carry");
  });

  it("contains all 5 portfolio raise dimension keys", () => {
    const prompt = buildPortfolioRaiseSystemPrompt();
    expect(prompt).toContain("totalEquityRequired");
    expect(prompt).toContain("firstCloseMinimum");
    expect(prompt).toContain("portfolioDscr");
    expect(prompt).toContain("rampCapitalBuffer");
    expect(prompt).toContain("achievableIrr");
  });

  it("contains DSCR covenant floor reference", () => {
    const prompt = buildPortfolioRaiseSystemPrompt();
    // 1.25x is the standard lender covenant floor
    expect(prompt).toContain("1.25");
  });

  it("contains IRR target range reference", () => {
    const prompt = buildPortfolioRaiseSystemPrompt();
    // 12–18% IRR range
    expect(prompt).toContain("12");
    expect(prompt).toContain("18");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// User prompt — silent-drop tests (every PortfolioRaiseAnalysisSummary field)

describe("buildPortfolioRaiseUserPrompt — silent-drop guard", () => {
  it("serializes totalEquityRequired", () => {
    const prompt = buildPortfolioRaiseUserPrompt(STUB_CTX, STUB_COMPARABLES);
    expect(prompt).toContain("4.30M"); // 4_300_000
  });

  it("serializes firstCloseMinimum", () => {
    const prompt = buildPortfolioRaiseUserPrompt(STUB_CTX, STUB_COMPARABLES);
    expect(prompt).toContain("First close minimum");
    expect(prompt).toContain("1.50M");
  });

  it("serializes portfolioDscrBlended", () => {
    const prompt = buildPortfolioRaiseUserPrompt(STUB_CTX, STUB_COMPARABLES);
    expect(prompt).toContain("Blended portfolio DSCR");
    expect(prompt).toContain("1.32");
  });

  it("serializes rampOverlapWindowCount", () => {
    const prompt = buildPortfolioRaiseUserPrompt(STUB_CTX, STUB_COMPARABLES);
    expect(prompt).toContain("Overlap windows: 1");
  });

  it("serializes peakConcurrentRampCount", () => {
    const prompt = buildPortfolioRaiseUserPrompt(STUB_CTX, STUB_COMPARABLES);
    expect(prompt).toContain("Peak concurrent ramp count: 2");
  });

  it("serializes impliedIrr when present", () => {
    const prompt = buildPortfolioRaiseUserPrompt(STUB_CTX, STUB_COMPARABLES);
    expect(prompt).toContain("Implied IRR");
    expect(prompt).toContain("14.8%");
  });

  it("serializes rampCarryUnderstated caveat", () => {
    const prompt = buildPortfolioRaiseUserPrompt(STUB_CTX, STUB_COMPARABLES);
    expect(prompt).toContain("pre-opening carry costs are understated");
  });

  it("serializes perPropertyEquity rows with property labels", () => {
    const prompt = buildPortfolioRaiseUserPrompt(STUB_CTX, STUB_COMPARABLES);
    expect(prompt).toContain("Property A");
    expect(prompt).toContain("Property B");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// User prompt — content correctness tests

describe("buildPortfolioRaiseUserPrompt — content", () => {
  it("contains per-property equity breakdown section", () => {
    const prompt = buildPortfolioRaiseUserPrompt(STUB_CTX, STUB_COMPARABLES);
    expect(prompt).toContain("Per-property equity breakdown");
    expect(prompt).toContain("2.50M");  // Property A equity
    expect(prompt).toContain("1.80M");  // Property B equity
  });

  it("shows null DSCR as all-cash indicator", () => {
    const nullDscrCtx: PortfolioRaisePromptInputContext = {
      ...STUB_CTX,
      analysisSummary: {
        ...STUB_CTX.analysisSummary,
        perPropertyEquity: [{ ...STUB_PROPERTY_ROW, estimatedDscr: null, ltv: 0 }],
      },
    };
    const prompt = buildPortfolioRaiseUserPrompt(nullDscrCtx, STUB_COMPARABLES);
    expect(prompt).toContain("all-cash");
  });

  it("shows 'not computable' when impliedIrr is null", () => {
    const noIrrCtx: PortfolioRaisePromptInputContext = {
      ...STUB_CTX,
      analysisSummary: { ...STUB_CTX.analysisSummary, impliedIrr: null },
    };
    const prompt = buildPortfolioRaiseUserPrompt(noIrrCtx, STUB_COMPARABLES);
    expect(prompt).toContain("not computable");
    expect(prompt).not.toContain("advisory floor");
  });

  it("shows no-properties placeholder when perPropertyEquity is empty", () => {
    const emptyCtx: PortfolioRaisePromptInputContext = {
      ...STUB_CTX,
      analysisSummary: { ...STUB_CTX.analysisSummary, perPropertyEquity: [] },
    };
    const prompt = buildPortfolioRaiseUserPrompt(emptyCtx, STUB_COMPARABLES);
    expect(prompt).toContain("no properties with computable equity");
  });

  it("renders LP comparable rows with indexed evidence refs", () => {
    const prompt = buildPortfolioRaiseUserPrompt(STUB_CTX, STUB_COMPARABLES);
    expect(prompt).toContain("[0]");
    expect(prompt).toContain("Boutique Fund I");
    expect(prompt).toContain("9.00M");
  });

  it("shows no-comparables note when comparables array is empty", () => {
    const prompt = buildPortfolioRaiseUserPrompt(STUB_CTX, []);
    expect(prompt).toContain("no comparables available");
    expect(prompt).toContain("DEVELOPING conviction");
  });

  it("contains benchmark ranges section for all 5 dimensions", () => {
    const prompt = buildPortfolioRaiseUserPrompt(STUB_CTX, STUB_COMPARABLES);
    expect(prompt).toContain("totalEquityRequired");
    expect(prompt).toContain("firstCloseMinimum");
    expect(prompt).toContain("portfolioDscr");
    expect(prompt).toContain("rampCapitalBuffer");
    expect(prompt).toContain("achievableIrr");
  });

  it("contains engine integrity summary with refi caveat", () => {
    const prompt = buildPortfolioRaiseUserPrompt(STUB_CTX, STUB_COMPARABLES);
    expect(prompt).toContain("Engine integrity summary");
    expect(prompt).toContain("floor estimates");
  });

  it("shows null DSCR blended as no-levered-properties", () => {
    const noDscrCtx: PortfolioRaisePromptInputContext = {
      ...STUB_CTX,
      analysisSummary: { ...STUB_CTX.analysisSummary, portfolioDscrBlended: null },
    };
    const prompt = buildPortfolioRaiseUserPrompt(noDscrCtx, STUB_COMPARABLES);
    expect(prompt).toContain("no levered properties");
  });

  it("includes persona vertical and market tier", () => {
    const prompt = buildPortfolioRaiseUserPrompt(STUB_CTX, STUB_COMPARABLES);
    expect(prompt).toContain("boutique-luxury");
    expect(prompt).toContain("L+B");
  });
});
