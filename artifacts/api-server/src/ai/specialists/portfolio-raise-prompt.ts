/**
 * portfolio-raise-prompt.ts — system + user prompt builders for the
 * Portfolio Capital Raise Specialist (portfolio.capitalRaise v1).
 *
 * The system prompt grounds Opus in LP-grade boutique hospitality fund
 * analysis norms: European waterfall, DSCR covenants, first-close sizing
 * conventions, IRR targets, and engine integrity caveats.
 *
 * The user prompt serializes all engine-computed portfolio financials so
 * Opus reasons from numbers, not abstractions. Every field on
 * PortfolioRaiseAnalysisSummary must appear — silent-drop tests guard this.
 *
 * Anti-pattern guards (same as mgmt-co-funding-prompt.ts):
 *   - No backtick-delimited text inside template literals (esbuild parse error)
 *   - No raw numeric literals — all numbers via @shared/constants-funding
 *   - No filler preamble in system prompt ("you are a helpful assistant…")
 */

import {
  PORTFOLIO_RAISE_DIMENSION_KEYS,
  PORTFOLIO_RAISE_DIMENSIONS,
} from "./portfolio-raise-prompt-input-builder";
import type {
  PortfolioRaisePromptInputContext,
  PortfolioPropertyEquityRow,
} from "./portfolio-raise-prompt-input-builder";
import type { LpDealComparable } from "./portfolio-raise-runner";
import {
  PORTFOLIO_RAISE_DSCR_BENCHMARK_LOW,
  PORTFOLIO_RAISE_DSCR_BENCHMARK_MID,
  PORTFOLIO_RAISE_DSCR_BENCHMARK_HIGH,
  PORTFOLIO_RAISE_IRR_BENCHMARK_LOW,
  PORTFOLIO_RAISE_IRR_BENCHMARK_MID,
  PORTFOLIO_RAISE_IRR_BENCHMARK_HIGH,
  PORTFOLIO_RAISE_RAMP_BUFFER_MONTHS_LOW,
  PORTFOLIO_RAISE_RAMP_BUFFER_MONTHS_MID,
  PORTFOLIO_RAISE_RAMP_BUFFER_MONTHS_HIGH,
  PORTFOLIO_RAISE_FIRST_CLOSE_FRACTION,
  PORTFOLIO_RAISE_FIRST_CLOSE_BENCHMARK_MID,
  PORTFOLIO_RAISE_FIRST_CLOSE_BENCHMARK_HIGH,
  PORTFOLIO_RAISE_LP_PREFERRED_RETURN_PCT,
  PORTFOLIO_RAISE_GP_CARRY_PCT,
  PORTFOLIO_RAISE_ASSET_CONCENTRATION_MAX_PCT,
  PORTFOLIO_RAISE_REASONING_MIN_CHARS,
  PORTFOLIO_RAISE_REASONING_MAX_CHARS,
  PORTFOLIO_RAISE_NARRATIVE_MIN_CHARS,
  PORTFOLIO_RAISE_NARRATIVE_MAX_CHARS,
} from "@shared/constants-funding";

// ────────────────────────────────────────────────────────────────────────────
// Formatting helpers

function fmtM(usd: number): string {
  return `$${(usd / 1_000_000).toFixed(2)}M`;
}

function fmtPct(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`;
}

function fmtDscr(v: number | null): string {
  return v !== null ? `${v.toFixed(2)}x` : "n/a";
}

// ────────────────────────────────────────────────────────────────────────────
// System prompt

export function buildPortfolioRaiseSystemPrompt(): string {
  const irrLowPct  = Math.round(PORTFOLIO_RAISE_IRR_BENCHMARK_LOW  * 100);
  const irrMidPct  = Math.round(PORTFOLIO_RAISE_IRR_BENCHMARK_MID  * 100);
  const irrHighPct = Math.round(PORTFOLIO_RAISE_IRR_BENCHMARK_HIGH * 100);
  const dscrLow  = PORTFOLIO_RAISE_DSCR_BENCHMARK_LOW;
  const dscrMid  = PORTFOLIO_RAISE_DSCR_BENCHMARK_MID;
  const dscrHigh = PORTFOLIO_RAISE_DSCR_BENCHMARK_HIGH;
  const firstCloseLow  = Math.round(PORTFOLIO_RAISE_FIRST_CLOSE_FRACTION          * 100);
  const firstCloseMid  = Math.round(PORTFOLIO_RAISE_FIRST_CLOSE_BENCHMARK_MID     * 100);
  const firstCloseHigh = Math.round(PORTFOLIO_RAISE_FIRST_CLOSE_BENCHMARK_HIGH    * 100);
  const rampLow  = PORTFOLIO_RAISE_RAMP_BUFFER_MONTHS_LOW;
  const rampMid  = PORTFOLIO_RAISE_RAMP_BUFFER_MONTHS_MID;
  const rampHigh = PORTFOLIO_RAISE_RAMP_BUFFER_MONTHS_HIGH;
  const prefReturn  = PORTFOLIO_RAISE_LP_PREFERRED_RETURN_PCT;
  const carry       = PORTFOLIO_RAISE_GP_CARRY_PCT;
  const concenMax   = PORTFOLIO_RAISE_ASSET_CONCENTRATION_MAX_PCT;

  return `You are The Analyst — a senior advisor at Norfolk AI specializing in LP capital raises for boutique-luxury hospitality property portfolios. You have direct experience structuring boutique fund vehicles: PropCo SPVs under a fund entity, LP allocations, European waterfall dynamics, and DSCR covenant negotiation with senior lenders in the mid-market hospitality space.

Sophisticated LP investors are reading your output. Write like a Goldman Sachs real estate research analyst: precise, opinionated, concise, authoritative, range-first, investor-aware.

# The primary question (answer this first, always)

**Can this portfolio of investment properties support a fundable LP capital raise — and how should it be structured?**

Your ${PORTFOLIO_RAISE_DIMENSION_KEYS.length} dimensions are evidence. Your overallNarrative must answer this question directly — with a clear yes, conditional yes, or honest no — even if at DEVELOPING conviction. No overallNarrative that sidesteps this question is acceptable.

# What you do

You analyze the engine-computed portfolio financials against:
1. LP benchmark anchors per dimension (low/mid/high from boutique luxury fund industry norms).
2. The canned LP comparable fund deals provided in the user message.
- The persona context (vertical, brand tier, locale) that frames what "right" looks like.
- Per-property equity breakdown and DSCR figures from the engine.

You produce a structured verdict: ${PORTFOLIO_RAISE_DIMENSION_KEYS.length} dimensions, each with a range, conviction, tight reasoning, and one to five evidence references (indexes into the comparables array).

# LP fund structure (European waterfall default)

Boutique luxury property portfolios are typically structured as:
- **Fund entity** (LLC or LP) holds equity interests in each PropCo SPV
- Each PropCo SPV owns one property; senior debt sits at the SPV level
- **European waterfall** (whole-fund return): LP capital is returned across all assets before GP promote is earned. This differs from American waterfall (deal-by-deal carry) and is the LP-protective default for boutique funds.
- **Preferred return:** ${prefReturn}% non-compounded, paid before any carry
- **GP carry:** ${carry}% above the preferred return hurdle
- **First close sizing:** PE convention is ${firstCloseLow}–${firstCloseHigh}% of total fund equity at first close. The ${firstCloseLow}% floor covers Property 1 equity at minimum; LP expectation is ${firstCloseMid}% (mid) to ${firstCloseHigh}% (aggressive). A first close below ${firstCloseLow}% of total equity is fundability-critical.
- **Asset concentration limit:** no single property should exceed ${concenMax}% of total fund equity — LP diversification covenant standard.

# Engine integrity caveats (always flag when relevant)

The engine provides per-property pro-forma data with two known conservative limitations:

1. **Refi-at-exit equity understated (MAJOR-2):** Debt is modeled on acquisition cost basis, not income-cap valuation. Refi-at-exit equity projections may be understated — exit refinancing proceeds are excluded from the engine output. Achievable IRR and equity returns are floor estimates; actual returns will likely be higher once refi proceeds are modeled.

2. **Pre-ops carry costs understated (MAJOR-FIVE):** Some operating costs (property taxes, insurance) are gated on the operations start date rather than the acquisition date. Pre-opening carry during the renovation/conversion gap is understated for properties with a gap between acquisition and operations start. DSCR and ramp buffer figures for those properties are optimistic by this margin.

When commenting on achievableIrr or portfolioDscr, reference these caveats: state they are floor estimates and the actual figures are likely higher. Do not fabricate higher figures — name the directional bias and stop.

# Dimension-specific guidance

**totalEquityRequired:** Assess whether the total equity requirement is fundable at this LP audience's minimum check size. Flag concentration risk if any single property exceeds ${concenMax}% of total. Cite comparable fund sizes from the LP comparables dataset.

**firstCloseMinimum:** Validate the first-close requirement against PE convention (${firstCloseLow}–${firstCloseHigh}%). If first-close minimum is below ${firstCloseLow}% of total equity, flag it as fundability risk — LPs will question GP commitment. Cite comparable first-close sizings.

**portfolioDscr:** The blended DSCR is the most LP-legible risk signal for a levered portfolio. Lender covenant floor is ${dscrLow}x (breach risk). ${dscrMid}x is the standard covenant minimum most institutional lenders require. ${dscrHigh}x+ is healthy. If blended DSCR is null (all-cash portfolio), output HIGH conviction on this dimension with reasoning that debt-free structure eliminates DSCR risk — do not penalize.

**rampCapitalBuffer:** Quantify concurrent ramp exposure in months of working capital. If 2+ properties are ramping simultaneously, LP expectations are a buffer of ${rampMid}–${rampHigh} months covering the longest overlap window plus ${rampLow} months. Flag the rampCarryUnderstated caveat: actual buffer need may be higher.

**achievableIrr:** The engine-computed implied IRR is an arithmetic-mean floor estimate (not a discounted IRR). Use it as the directional anchor. If impliedIrr is absent, output DEVELOPING conviction with explicit reasoning that cap rate or NOI data was insufficient — do not fabricate an IRR. If present, validate against the ${irrLowPct}–${irrHighPct}% levered IRR target range (mid: ${irrMidPct}%).

# Forbidden patterns

- Never invent per-property NOI, IRR, or equity figures not present in the engine section.
- Never cite comparable deals not in the user message.
- Never "Absolutely!", "Great question!", "I'd be happy to help!" — you are an advisor, not a chatbot.
- Never use "the system" as the subject of action. The Analyst is.
- Never emit a range where low > mid or mid > high.

# Conviction calibration (binding)

- **HIGH** — multiple comparables agree, benchmark supports, persona aligns. LP-defensible.
- **MODERATE** — one signal supports (comparables or benchmarks or persona, not all three).
- **DEVELOPING** — sparse data, missing engine inputs, or underrepresented persona. Honest signal.

# Output format (strict)

Emit exactly ${PORTFOLIO_RAISE_DIMENSION_KEYS.length} dimensions, one per portfolio raise key:
${PORTFOLIO_RAISE_DIMENSION_KEYS.map((k) => `  - ${k}`).join("\n")}

Per dimension:
- key: one of the ${PORTFOLIO_RAISE_DIMENSION_KEYS.length} above
- low, mid, high: numbers satisfying low <= mid <= high
- conviction: "high" | "moderate" | "developing"
- reasoning: ${PORTFOLIO_RAISE_REASONING_MIN_CHARS}–${PORTFOLIO_RAISE_REASONING_MAX_CHARS} chars, references engine inputs and at least one comparable
- evidenceRefs: one to five integer indexes into the comparables array

Required: overallNarrative of ${PORTFOLIO_RAISE_NARRATIVE_MIN_CHARS}–${PORTFOLIO_RAISE_NARRATIVE_MAX_CHARS} chars directly answering the primary question with investor-aware framing.`;
}

// ────────────────────────────────────────────────────────────────────────────
// Per-property table row

function formatPropertyRow(row: PortfolioPropertyEquityRow): string {
  const dscr = row.estimatedDscr !== null ? `${row.estimatedDscr.toFixed(2)}x` : "n/a (all-cash)";
  const ltvPct = row.ltv > 0 ? fmtPct(row.ltv) : "0% (all-cash)";
  return `  ${row.propertyLabel}: equity ${fmtM(row.equityRequired)}, deployment month ${row.deploymentMonth}, LTV ${ltvPct}, DSCR at stabilization ${dscr}`;
}

// ────────────────────────────────────────────────────────────────────────────
// User prompt

export function buildPortfolioRaiseUserPrompt(
  ctx: PortfolioRaisePromptInputContext,
  comparables: readonly LpDealComparable[],
): string {
  const { analysisSummary, persona } = ctx;

  // ── Portfolio overview ──────────────────────────────────────────────────
  const totalEquityLine  = `Total equity required: ${fmtM(analysisSummary.totalEquityRequired)}`;
  const firstCloseLine   = `First close minimum: ${fmtM(analysisSummary.firstCloseMinimum)} (${fmtPct(analysisSummary.firstCloseMinimum / (analysisSummary.totalEquityRequired || 1))} of total)`;
  const dscrLine         = analysisSummary.portfolioDscrBlended !== null
    ? `Blended portfolio DSCR: ${fmtDscr(analysisSummary.portfolioDscrBlended)}`
    : "Blended portfolio DSCR: n/a (no levered properties)";
  const rampWindowsLine  = `Ramp overlap windows: ${analysisSummary.rampOverlapWindowCount} (peak concurrent properties in ramp: ${analysisSummary.peakConcurrentRampCount})`;
  const irrLine          = analysisSummary.impliedIrr !== null
    ? `Implied IRR (advisory floor, arithmetic mean): ${fmtPct(analysisSummary.impliedIrr)}`
    : "Implied IRR: not computable (missing cap rate or stabilized NOI data)";
  const carryLine        = analysisSummary.rampCarryUnderstated
    ? "Engine integrity note: pre-opening carry costs are understated — ramp buffer figures are optimistic for properties with an acquisition-to-operations gap."
    : "";

  // ── Per-property equity breakdown ───────────────────────────────────────
  const propertyRows = analysisSummary.perPropertyEquity.length > 0
    ? analysisSummary.perPropertyEquity.map(formatPropertyRow).join("\n")
    : "  (no properties with computable equity)";

  // ── LP comparables ──────────────────────────────────────────────────────
  const comparableRows = comparables.length > 0
    ? comparables.map((row, i) => {
        const equityM   = fmtM(row.totalEquityUsd);
        const irrStr    = row.leveredIrr !== null ? fmtPct(row.leveredIrr) : "n/a";
        const dscrStr   = row.dscrAtStabilization !== null ? `${row.dscrAtStabilization.toFixed(2)}x` : "n/a";
        return `  [${i}] ${row.operator} (${row.vintage}, ${row.vertical}, ${row.propertyCount} properties): equity ${equityM}, first close ${fmtPct(row.firstClosePct)}, DSCR ${dscrStr}, levered IRR ${irrStr} — source: ${row.source} (${row.asOf})`;
      }).join("\n")
    : "  (no comparables available — use DEVELOPING conviction on all evidence-dependent dimensions)";

  // ── Benchmark ranges (dimension anchors) ───────────────────────────────
  const benchmarkRows = PORTFOLIO_RAISE_DIMENSIONS.map((d) => {
    const lowStr  = d.unit === "pct"   ? fmtPct(d.benchmarks.low)  : d.unit === "usd" ? fmtM(d.benchmarks.low)  : String(d.benchmarks.low);
    const midStr  = d.unit === "pct"   ? fmtPct(d.benchmarks.mid)  : d.unit === "usd" ? fmtM(d.benchmarks.mid)  : String(d.benchmarks.mid);
    const highStr = d.unit === "pct"   ? fmtPct(d.benchmarks.high) : d.unit === "usd" ? fmtM(d.benchmarks.high) : String(d.benchmarks.high);
    return `  ${d.key} (${d.label}): low=${lowStr}, mid=${midStr}, high=${highStr}`;
  }).join("\n");

  const personaLine = `${persona.verticalSlug} vertical, ${persona.marketTier} tier, ${persona.locale} locale`;

  return [
    "# Portfolio overview",
    totalEquityLine,
    firstCloseLine,
    dscrLine,
    rampWindowsLine,
    irrLine,
    carryLine,
    "",
    "# Per-property equity breakdown",
    propertyRows,
    "",
    "# Ramp overlap exposure",
    `Overlap windows: ${analysisSummary.rampOverlapWindowCount}`,
    `Peak concurrent ramp count: ${analysisSummary.peakConcurrentRampCount}`,
    analysisSummary.rampCarryUnderstated
      ? "Carry caveat: refi-at-exit equity projections may be understated (cost-basis debt model). Pre-ops carry costs understated for properties with acquisition-to-operations gap."
      : "",
    "",
    "# Persona",
    personaLine,
    "",
    "# LP comparables (indexed 0-based — use these indexes in evidenceRefs)",
    comparableRows,
    "",
    "# Benchmark ranges per dimension",
    benchmarkRows,
    "",
    "# Engine integrity summary",
    "The implied IRR and DSCR figures above are floor estimates. Actual returns will be higher once refi-at-exit proceeds are modeled (MAJOR-2 unresolved). Flag this directionally — do not fabricate higher figures.",
  ].filter(line => line !== null).join("\n");
}
