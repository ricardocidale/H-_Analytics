/**
 * calc/analysis/structure-comparison.ts
 *
 * Side-by-side comparison engine for the six canonical hospitality operating
 * structures (own / franchise / HMA / master-lease tenant / master-lease
 * landlord / hybrid). Takes a single property's baseline yearly engine output
 * and overlays each structure's fee, lease, and capex assumptions to produce
 * a comparable bundle of metrics:
 *
 *   - GOP / EBITDA / NOI (averages over the projection horizon)
 *   - Unlevered IRR (from operating cash flows + exit value)
 *   - Levered IRR (from FCFE — operating + financing flows)
 *   - Equity multiple (MOIC)
 *   - Peak negative cash flow (worst single-year cash drawdown)
 *   - Year of first positive cash flow
 *   - Downside NOI under stress (per-structure haircut)
 *   - Revenue distribution (rooms / F&B / events / other)
 *   - Key contract terms
 *
 * The output also carries a `recommendation` field — the structure with the
 * highest *risk-adjusted* unlevered IRR, where the adjustment penalises
 * higher risk tiers and persistent cash drawdowns. This is the structure
 * surfaced at the top of the page and used in the "what changes if you
 * switch" callout.
 *
 * This module is pure: same input → same output. The server endpoint wires
 * it to the engine; the client renders the bundle.
 */

import {
  getOperatingStructureOverlay,
  mergeStructureOverlay,
  OPERATING_STRUCTURE_IDS,
  type OperatingStructureDefaults,
  type OperatingStructureId,
  type StructureOverlayPatch,
} from "@shared/constants-operating-structures";
import type { YearlyPropertyFinancials } from "@engine/aggregation/yearlyAggregator";
import { computeIRR } from "@analytics/returns/irr";
import { dPow } from "../shared/decimal.js";

const SINGLE_PERIOD_PER_YEAR = 1;
const STABILIZATION_YEAR_INDEX = 2; // Year 3 (zero-indexed) is the stabilization anchor

// Risk-adjustment penalties applied to unlevered IRR when ranking structures.
// Magnitudes calibrated against HVS 2024 risk-tier spread (≈25 bps low → very-high).
const RISK_PENALTY_LOW = 0.0;
const RISK_PENALTY_MEDIUM = 0.01;
const RISK_PENALTY_HIGH_BPS_DECIMAL = 0.025; // 250 bps
const RISK_PENALTY_VERY_HIGH_BPS_DECIMAL = 0.045; // 450 bps
const PEAK_DRAWDOWN_PENALTY_BPS_DECIMAL = 0.005; // 50 bps haircut for any negative-CF year

const RISK_TIER_PENALTY: Record<string, number> = {
  low: RISK_PENALTY_LOW,
  medium: RISK_PENALTY_MEDIUM,
  high: RISK_PENALTY_HIGH_BPS_DECIMAL,
  "very-high": RISK_PENALTY_VERY_HIGH_BPS_DECIMAL,
};
const SAFE_DIVIDE_GUARD = 1e-9;

// Recommendation banding: structures whose risk-adjusted score is within
// CLOSE_CALL_THRESHOLD_BPS of the leader are flagged as a "close call".
// 75 bps follows the audit-committee tolerance used elsewhere in the platform.
const CLOSE_CALL_THRESHOLD_BPS_DECIMAL = 0.0075;

// --- Master-lease tenant capital model -------------------------------------
// In a master-lease tenant structure the user does NOT buy the building. Their
// only Year-0 outflow is a leasehold security deposit + opening working
// capital, conventionally sized as a multiple of stabilized base rent. We
// model that as a 6-month deposit (industry-standard range 3–12 months for
// hotel master leases — HVS Lease Survey 2024). The deposit is returned at
// lease end (terminal year), so the terminal cash flow includes a +deposit.
// Tenants have no real-estate debt → unlevered == levered for tenant mode.
const TENANT_LEASEHOLD_DEPOSIT_MONTHS = 6;
const MONTHS_PER_YEAR = 12;
const TENANT_LEASEHOLD_DEPOSIT_YEARS_DECIMAL =
  TENANT_LEASEHOLD_DEPOSIT_MONTHS / MONTHS_PER_YEAR;

const RISK_LABEL: Record<string, string> = {
  low: "low risk",
  medium: "medium risk",
  high: "high risk",
  "very-high": "very high risk",
};

export interface StructureComparisonInput {
  propertyId: number;
  propertyName: string;
  /** Project country — drives country-level overlay deltas. */
  country?: string | null;
  /**
   * Total project cost at acquisition (purchase price + acquisition costs).
   * This is the unlevered investment that anchors Year 0 of the unlevered IRR.
   * Equals `initialEquity + initialDebt` — must NOT be confused with end-of-hold
   * debt balance.
   */
  totalProjectCost: number;
  /** Hold period equity outlay — drives levered IRR sign of Year 0. */
  initialEquity: number;
  /** Outstanding debt at exit (used for levered terminal proceeds). */
  exitDebtBalance: number;
  /** Exit cap rate to convert stabilized NOI into terminal value. */
  exitCapRate: number;
  /** Baseline yearly financials (full hold period), already engine-computed. */
  yearly: YearlyPropertyFinancials[];
  /** Optional: subset of structures to include (defaults to all six). */
  structures?: OperatingStructureId[];
  /**
   * Optional per-structure overrides applied on top of the country-resolved
   * overlay. Used by the scenario editor to answer "what if I push the HMA
   * incentive fee to 12% on this deal?" without touching admin-level
   * registry overrides. Any field omitted falls through to the resolved
   * value via `mergeStructureOverlay()`.
   */
  overlays?: Partial<Record<OperatingStructureId, StructureOverlayPatch>>;
}

export interface StructureMetrics {
  id: OperatingStructureId;
  label: string;
  shortLabel: string;
  description: string;
  cashFlowMode: OperatingStructureDefaults["cashFlowMode"];
  riskProfile: OperatingStructureDefaults["riskProfile"];
  keyTerms: string[];

  /** Average GOP across the hold period (USD). */
  avgGop: number;
  /** Average EBITDA (NOI + interest add-back) across the hold period. */
  avgEbitda: number;
  /** Average NOI across the hold period. */
  avgNoi: number;
  /** Stabilized NOI (Year 3 or last year if hold < 3y). */
  stabilizedNoi: number;
  /** Terminal value at exit (= stabilized NOI / exit cap). */
  exitValue: number;

  /** Unlevered IRR from operating cash flows + exit value. */
  unleveredIrr: number | null;
  /** Levered IRR from equity cash flows (FCFE proxy: NOI - interest - principal). */
  leveredIrr: number | null;
  /** Equity multiple (total distributions / total invested). */
  equityMultiple: number;
  /** Worst single-year operating cash flow (most-negative or smallest). */
  peakNegativeCashFlow: number;
  /** Year (1-indexed) of first positive operating cash flow; null if never. */
  yearOfFirstPositiveCashFlow: number | null;
  /** Downside NOI = stabilized NOI × (1 − haircut). */
  downsideNoi: number;

  /**
   * Where each gross-revenue dollar ends up across the hold period
   * (sum across all years, USD). The four buckets sum to gross revenue
   * (operatingExpenses captures everything outside the four headline
   * stakeholders so that residualSponsor stays comparable across structures).
   */
  revenueDistribution: {
    /** Operator (HMA / management fee — base + incentive). */
    operator: number;
    /** Brand (royalty + marketing + reservation, or franchise fee). */
    brand: number;
    /** Lender (debt service — interest + principal). */
    lender: number;
    /** Sponsor (residual NOI − debt service, after operator/brand fees). */
    sponsor: number;
    /** All other operating expenses (USALI departmental + undistributed). */
    operatingExpenses: number;
    /** Gross revenue across the hold (rooms + F&B + events + other). */
    grossRevenue: number;
  };

  /** Per-year operating cash flow used for IRR (for chart rendering). */
  yearlyCashFlows: number[];
  /** Per-year NOI after structure overlay (for chart rendering). */
  yearlyNoi: number[];
}

export interface StructureComparisonResult {
  propertyId: number;
  propertyName: string;
  country: string | null;
  computedAt: string;
  structures: StructureMetrics[];
  /** ID of the recommended structure (highest risk-adjusted unlevered IRR). */
  recommendation: OperatingStructureId;
  /** Score breakdown for transparency. */
  recommendationScores: { id: OperatingStructureId; score: number }[];
  /**
   * Plain-language rationale for why `recommendation` won — references the
   * winning structure's risk-adjusted IRR vs the runner-up and the dominant
   * scoring driver (raw IRR, risk tier, drawdown).
   */
  recommendationRationale: string;
  /**
   * True when the runner-up's risk-adjusted score is within
   * CLOSE_CALL_THRESHOLD_BPS_DECIMAL of the winner. The UI surfaces this as a
   * caution so users don't treat the pick as decisive.
   */
  isCloseCall: boolean;
  /**
   * IDs of every structure within the close-call band of the leader (always
   * includes the winner). Empty until at least one runner-up qualifies.
   */
  closeCallStructures: OperatingStructureId[];
  /** Threshold (decimal, e.g. 0.0075 = 75 bps) used for the close-call test. */
  closeCallThreshold: number;
}

function stabilizedYearIndex(yearly: YearlyPropertyFinancials[]): number {
  return Math.min(STABILIZATION_YEAR_INDEX, yearly.length - 1);
}

interface YearlyOverlayResult {
  noi: number;
  gop: number;
  ebitda: number;
  operatingCashFlow: number;
  /** Operator (HMA/management) fees paid this year. */
  operatorFees: number;
  /** Brand (royalty/marketing/reservation/franchise) fees paid this year. */
  brandFees: number;
  /** Total debt service paid this year (interest + principal). */
  debtService: number;
  /** Sponsor cash flow this year (operating CF, can be negative). */
  sponsorCashFlow: number;
  /** All other operating expenses (revenue minus the 4 stakeholders, can drop). */
  operatingExpenses: number;
}

function applyOperatingOverlay(
  year: YearlyPropertyFinancials,
  overlay: OperatingStructureDefaults,
): YearlyOverlayResult {
  const baselineRoomsRevenue = year.revenueRooms;
  const baselineTotalRevenue = year.revenueTotal;

  // Brand fees (only on rooms revenue)
  const royalty = baselineRoomsRevenue * overlay.feeOverlay.brandRoyaltyOnRooms;
  const marketing = baselineRoomsRevenue * overlay.feeOverlay.brandMarketingOnRooms;
  const reservation = baselineRoomsRevenue * overlay.feeOverlay.brandReservationOnRooms;
  const brandFees = royalty + marketing + reservation;

  // HMA fees
  const hmaBase = baselineTotalRevenue * overlay.feeOverlay.hmaBaseOnTotalRevenue;
  // Approximate baseline GOP before any management fee, then take HMA incentive on it
  const baselineGopPreMgmt = year.gop + year.feeBase + year.feeIncentive;
  const hmaIncentive = Math.max(0, baselineGopPreMgmt) * overlay.feeOverlay.hmaIncentiveOnGop;

  // Strip baseline mgmt fee if structure replaces it
  const baselineMgmtAddback = overlay.feeOverlay.keepBaselineMgmtFee
    ? 0
    : year.feeBase + year.feeIncentive;
  const operatorFees = baselineMgmtAddback === 0
    ? hmaBase + hmaIncentive
    : year.feeBase + year.feeIncentive + hmaBase + hmaIncentive;

  // Capex factor adjusts FFE reserve line
  const ffeAdjustment = (overlay.capexFactor - 1) * year.expenseFFE;

  const adjustedGop =
    year.gop + baselineMgmtAddback - brandFees - hmaBase - hmaIncentive;
  const adjustedNoi = year.noi + baselineMgmtAddback - brandFees - hmaBase - hmaIncentive - ffeAdjustment;
  const adjustedEbitda = adjustedNoi + year.interestExpense; // EBITDA = NOI + interest (depreciation already excluded from NOI in this engine)

  // Operating cash flow proxy: NOI minus debt service (NOI excludes interest)
  const operatingCashFlow = adjustedNoi - year.debtPayment;

  // Operating expenses bucket = gross revenue minus the four headline
  // stakeholder buckets minus sponsor residual. Anchors the stacked-bar
  // chart so columns sum to gross revenue.
  const operatingExpenses =
    baselineTotalRevenue - operatorFees - brandFees - year.debtPayment - operatingCashFlow;

  return {
    noi: adjustedNoi,
    gop: adjustedGop,
    ebitda: adjustedEbitda,
    operatingCashFlow,
    operatorFees,
    brandFees,
    debtService: year.debtPayment,
    sponsorCashFlow: operatingCashFlow,
    operatingExpenses,
  };
}

function applyLeaseOverlay(
  year: YearlyPropertyFinancials,
  overlay: OperatingStructureDefaults,
  yearIndex: number,
  stabilizedRevenue: number,
): YearlyOverlayResult {
  if (!overlay.lease) {
    return {
      noi: 0,
      gop: 0,
      ebitda: 0,
      operatingCashFlow: 0,
      operatorFees: 0,
      brandFees: 0,
      debtService: 0,
      sponsorCashFlow: 0,
      operatingExpenses: 0,
    };
  }
  const escalator = dPow(1 + overlay.lease.rentEscalator, Math.max(0, yearIndex - 1));
  const baseRent = stabilizedRevenue * overlay.lease.baseRentRevenueShare * escalator;
  const incrementalRevenue = Math.max(0, year.revenueTotal - stabilizedRevenue);
  const percentageRent = incrementalRevenue * overlay.lease.percentageRentOnRevenue;
  const totalRent = baseRent + percentageRent;

  if (overlay.cashFlowMode === "leaseTenant") {
    // User IS the operating tenant. They pay rent to the landlord and capture
    // the residual after operating expenses + rent + tenant capex. Critically,
    // the tenant has NO real-estate debt at their level — that debt sits with
    // the landlord (modelled separately under `leaseLandlord`). Mixing tenant
    // NOI with landlord rent receipts (the prior bug) corrupted levered IRR,
    // peak-CF, and ranking.
    const gopPreRent = year.gop + year.feeBase + year.feeIncentive;
    const tenantNoi = gopPreRent - totalRent - year.expenseFFE * overlay.capexFactor;
    // Tenant has no real-estate debt → levered cash flow == unlevered (NOI).
    return {
      noi: tenantNoi,
      gop: gopPreRent,
      ebitda: tenantNoi,
      operatingCashFlow: tenantNoi,
      operatorFees: 0,
      brandFees: 0,
      debtService: 0,
      sponsorCashFlow: tenantNoi,
      // Revenue-distribution bucket: hotel opex + rent paid out to landlord
      // (rent flows out of the tenant, so from the tenant's POV it's an
      // expense). Sum-to-revenue identity: opex + sponsor ≈ revenueTotal.
      operatingExpenses: Math.max(0, year.revenueTotal - tenantNoi),
    };
  }
  // leaseLandlord: receives rent only, no operating risk.
  const landlordNoi =
    totalRent - year.expenseTaxes - year.expenseInsurance - year.expenseFFE * overlay.capexFactor;
  const sponsorCashFlow = landlordNoi - year.debtPayment;
  return {
    noi: landlordNoi,
    gop: totalRent,
    ebitda: landlordNoi,
    operatingCashFlow: sponsorCashFlow,
    operatorFees: 0,
    brandFees: 0,
    debtService: year.debtPayment,
    sponsorCashFlow,
    operatingExpenses: Math.max(0, totalRent - landlordNoi),
  };
}

function computeStructureMetrics(
  input: StructureComparisonInput,
  structureId: OperatingStructureId,
): StructureMetrics {
  const baseOverlay = getOperatingStructureOverlay(structureId, input.country);
  const overlay = mergeStructureOverlay(baseOverlay, input.overlays?.[structureId]);
  const yearly = input.yearly;
  const stabIdx = stabilizedYearIndex(yearly);
  const stabilizedRevenue = yearly[stabIdx]?.revenueTotal ?? 0;

  const yearlyNoi: number[] = [];
  const yearlyGop: number[] = [];
  const yearlyEbitda: number[] = [];
  const yearlyOperatingCashFlow: number[] = [];

  let operatorTotal = 0;
  let brandTotal = 0;
  let lenderTotal = 0;
  let sponsorTotal = 0;
  let opexTotal = 0;
  let grossRevenueTotal = 0;

  yearly.forEach((y, idx) => {
    const adjusted =
      overlay.cashFlowMode === "operating"
        ? applyOperatingOverlay(y, overlay)
        : applyLeaseOverlay(y, overlay, idx, stabilizedRevenue);
    yearlyNoi.push(adjusted.noi);
    yearlyGop.push(adjusted.gop);
    yearlyEbitda.push(adjusted.ebitda);
    yearlyOperatingCashFlow.push(adjusted.operatingCashFlow);

    operatorTotal += adjusted.operatorFees;
    brandTotal += adjusted.brandFees;
    lenderTotal += adjusted.debtService;
    sponsorTotal += adjusted.sponsorCashFlow;
    opexTotal += adjusted.operatingExpenses;
    grossRevenueTotal += y.revenueTotal;
  });

  const stabilizedNoi = yearlyNoi[stabIdx] ?? 0;
  const exitValue =
    input.exitCapRate > SAFE_DIVIDE_GUARD ? stabilizedNoi / input.exitCapRate : 0;

  // Cash-flow templates differ by ownership mode. In owner modes (fee-simple,
  // franchise, HMA, lease-LANDLORD, hybrid) the user buys the building and
  // sells it at exit. In TENANT mode the user signs a master lease — Y0
  // outlay is a leasehold deposit, terminal returns the deposit, and there is
  // no real-estate sale value or debt payoff at the tenant level.
  const isTenantMode = overlay.cashFlowMode === "leaseTenant";

  let unleveredCfs: number[];
  let leveredCfs: number[];
  let initialOutlayForMoic: number;

  if (isTenantMode) {
    // Tenant: leasehold deposit at Y0, returned at terminal. No sale, no debt.
    // Stabilized base rent drives the deposit size (lease overlay is required
    // for tenant mode; if missing, deposit = 0 → IRR is undefined and we
    // gracefully return null below).
    const stabilizedBaseRent = overlay.lease
      ? stabilizedRevenue * overlay.lease.baseRentRevenueShare
      : 0;
    const leaseholdDeposit = stabilizedBaseRent * TENANT_LEASEHOLD_DEPOSIT_YEARS_DECIMAL;
    const tenantTerminalReturn = leaseholdDeposit; // deposit returned at lease end
    unleveredCfs = [
      -leaseholdDeposit,
      ...yearlyNoi.slice(0, -1),
      (yearlyNoi[yearlyNoi.length - 1] ?? 0) + tenantTerminalReturn,
    ];
    // Tenant has no real-estate debt → levered == unlevered. Use the same
    // template so leveredIrr equals unleveredIrr by construction (this is the
    // correct invariant for an unlevered tenant capital structure).
    leveredCfs = unleveredCfs.slice();
    initialOutlayForMoic = leaseholdDeposit;
  } else {
    // Owner modes. Unlevered IRR anchors at total project cost (purchase
    // price + acquisition costs); levered IRR anchors at initial equity and
    // pays off exit debt at terminal. Negative terminal proceeds are
    // intentional — they represent the sponsor bringing cash to the closing
    // table when the loan exceeds sale value, and must NOT be floored to
    // zero (that would mask downside risk and bias rankings).
    unleveredCfs = [
      -input.totalProjectCost,
      ...yearlyNoi.slice(0, -1),
      (yearlyNoi[yearlyNoi.length - 1] ?? 0) + exitValue,
    ];
    const terminalEquityProceeds = exitValue - input.exitDebtBalance;
    leveredCfs = [
      -input.initialEquity,
      ...yearlyOperatingCashFlow.slice(0, -1),
      (yearlyOperatingCashFlow[yearlyOperatingCashFlow.length - 1] ?? 0) +
        terminalEquityProceeds,
    ];
    initialOutlayForMoic = input.initialEquity;
  }

  const unleveredIrrResult = computeIRR(unleveredCfs, SINGLE_PERIOD_PER_YEAR);
  const leveredIrrResult = computeIRR(leveredCfs, SINGLE_PERIOD_PER_YEAR);

  const totalDistributions = leveredCfs
    .filter((cf) => cf > 0)
    .reduce((sum, cf) => sum + cf, 0);
  const equityMultiple =
    initialOutlayForMoic > SAFE_DIVIDE_GUARD ? totalDistributions / initialOutlayForMoic : 0;

  const peakNegativeCashFlow = yearlyOperatingCashFlow.reduce(
    (worst, cf) => (cf < worst ? cf : worst),
    yearlyOperatingCashFlow[0] ?? 0,
  );

  const firstPositiveIdx = yearlyOperatingCashFlow.findIndex((cf) => cf > 0);
  const yearOfFirstPositiveCashFlow = firstPositiveIdx >= 0 ? firstPositiveIdx + 1 : null;

  const downsideNoi = stabilizedNoi * (1 - overlay.downsideNoiHaircut);

  const avg = (xs: number[]) =>
    xs.length === 0 ? 0 : xs.reduce((s, x) => s + x, 0) / xs.length;

  return {
    id: structureId,
    label: overlay.label,
    shortLabel: overlay.shortLabel,
    description: overlay.description,
    cashFlowMode: overlay.cashFlowMode,
    riskProfile: overlay.riskProfile,
    keyTerms: overlay.keyTerms,
    avgGop: avg(yearlyGop),
    avgEbitda: avg(yearlyEbitda),
    avgNoi: avg(yearlyNoi),
    stabilizedNoi,
    exitValue,
    unleveredIrr: unleveredIrrResult.irr_annualized,
    leveredIrr: leveredIrrResult.irr_annualized,
    equityMultiple,
    peakNegativeCashFlow,
    yearOfFirstPositiveCashFlow,
    downsideNoi,
    revenueDistribution: {
      operator: operatorTotal,
      brand: brandTotal,
      lender: lenderTotal,
      sponsor: sponsorTotal,
      operatingExpenses: opexTotal,
      grossRevenue: grossRevenueTotal,
    },
    yearlyCashFlows: yearlyOperatingCashFlow,
    yearlyNoi,
  };
}

interface ScoredStructure {
  id: OperatingStructureId;
  score: number;
  baseIrr: number;
  riskPenalty: number;
  drawdownPenalty: number;
}

function scoreStructure(s: StructureMetrics): ScoredStructure {
  // Risk-adjusted unlevered IRR. Penalise risk tier + persistent negative CF.
  const baseIrr = s.unleveredIrr ?? -1;
  const riskPenalty = RISK_TIER_PENALTY[s.riskProfile] ?? 0;
  const drawdownPenalty = s.peakNegativeCashFlow < 0 ? PEAK_DRAWDOWN_PENALTY_BPS_DECIMAL : 0;
  return {
    id: s.id,
    score: baseIrr - riskPenalty - drawdownPenalty,
    baseIrr,
    riskPenalty,
    drawdownPenalty,
  };
}

function formatPct(decimal: number): string {
  return `${(decimal * 100).toFixed(1)}%`;
}

function formatBps(decimal: number): string {
  return `${Math.round(decimal * 10_000)} bps`;
}

function buildRationale(
  winner: StructureMetrics,
  winnerScore: ScoredStructure,
  runnerUp: { metrics: StructureMetrics; score: ScoredStructure } | null,
  closeCallStructures: OperatingStructureId[],
): string {
  const parts: string[] = [];
  parts.push(
    `${winner.label} leads with a risk-adjusted IRR of ${formatPct(winnerScore.score)} ` +
      `(${formatPct(winnerScore.baseIrr)} unlevered IRR less ${formatBps(winnerScore.riskPenalty + winnerScore.drawdownPenalty)} risk haircut).`,
  );
  if (runnerUp) {
    const gap = winnerScore.score - runnerUp.score.score;
    parts.push(
      `Runner-up ${runnerUp.metrics.label} scores ${formatPct(runnerUp.score.score)} — a ${formatBps(gap)} gap.`,
    );
  }
  // Identify dominant driver.
  const driver = winnerScore.baseIrr >= 0
    ? `unlevered IRR (${formatPct(winnerScore.baseIrr)})`
    : `lowest negative-IRR structure`;
  parts.push(`The dominant driver is ${driver} given a ${RISK_LABEL[winner.riskProfile] ?? winner.riskProfile} profile.`);
  if (closeCallStructures.length > 1) {
    parts.push(
      `Close call: ${closeCallStructures.length - 1} other structure(s) score within ` +
        `${formatBps(CLOSE_CALL_THRESHOLD_BPS_DECIMAL)} — treat the recommendation as directional.`,
    );
  }
  return parts.join(" ");
}

export function compareOperatingStructures(
  input: StructureComparisonInput,
): StructureComparisonResult {
  const ids = input.structures ?? OPERATING_STRUCTURE_IDS;
  const structures = ids.map((id) => computeStructureMetrics(input, id));
  const metricById = new Map(structures.map((s) => [s.id, s]));

  const scored = structures.map(scoreStructure).sort((a, b) => b.score - a.score);
  const winnerScore = scored[0];
  const runnerUpScore = scored[1] ?? null;
  const winnerId = winnerScore?.id ?? ids[0]!;
  const winnerMetrics = metricById.get(winnerId)!;

  const closeCallStructures: OperatingStructureId[] = winnerScore
    ? scored
        .filter((s) => winnerScore.score - s.score <= CLOSE_CALL_THRESHOLD_BPS_DECIMAL)
        .map((s) => s.id)
    : [];
  const isCloseCall = closeCallStructures.length > 1;

  const runnerUpEntry = runnerUpScore
    ? { metrics: metricById.get(runnerUpScore.id)!, score: runnerUpScore }
    : null;
  const recommendationRationale = winnerScore
    ? buildRationale(winnerMetrics, winnerScore, runnerUpEntry, closeCallStructures)
    : "Unable to score structures (insufficient cash flow data).";

  return {
    propertyId: input.propertyId,
    propertyName: input.propertyName,
    country: input.country ?? null,
    computedAt: new Date().toISOString(),
    structures,
    recommendation: winnerId,
    recommendationScores: scored.map(({ id, score }) => ({ id, score })),
    recommendationRationale,
    isCloseCall,
    closeCallStructures,
    closeCallThreshold: CLOSE_CALL_THRESHOLD_BPS_DECIMAL,
  };
}
