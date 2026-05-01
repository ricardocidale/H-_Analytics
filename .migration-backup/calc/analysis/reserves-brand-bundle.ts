/**
 * calc/analysis/reserves-brand-bundle.ts — Aggregator for the
 * "Reserves & Brand Costs" deep-dive panel (Task #808).
 *
 * Bundles five sub-views into a single payload the client can render in
 * one round-trip:
 *
 *   1. FF&E reserve adequacy — wraps `computeCapexReserve` and adds the
 *      USALI 4% benchmark + adequacy badge classification.
 *   2. Brand-fee stack — the boutique franchise/royalty/marketing/loyalty/
 *      reservation/tech rates resolved per-property, with $ and % per
 *      annual revenue.
 *   3. HMA terms — base & incentive mgmt fees + term + termination notice.
 *   4. Capital events timeline — projected PIPs (default 7-yr cycle) and
 *      the post-Surfside FL coastal milestone callout when in scope
 *      (US + FL + coastal/beach + age between 25 and 30 yr).
 *   5. Condo / mixed-use exposure — dues % + free-form notes.
 *
 * Every figure is paired with an `irrImpact` sentence so the panel can
 * show first-order IRR sensitivity inside each tooltip without re-running
 * the full DCF.
 */
import type { RoundingPolicy } from "../../domain/types/rounding.js";
import { rounder, RATIO_ROUNDING } from "../shared/utils.js";
import { roundTo } from "../../domain/types/rounding.js";
import { computeCapexReserve } from "./capex-reserve.js";
import { getFactoryNumber } from "../../shared/model-constants-registry.js";
import {
  USALI_FFE_RESERVE_BENCHMARK,
  DEFAULT_FRANCHISE_FEE_RATE,
  DEFAULT_ROYALTY_FEE_RATE,
  DEFAULT_BRAND_MARKETING_FEE_RATE,
  DEFAULT_LOYALTY_PROGRAM_FEE_RATE,
  DEFAULT_RESERVATION_FEE_RATE,
  DEFAULT_BRAND_TECHNOLOGY_FEE_RATE,
  DEFAULT_HMA_TERM_YEARS,
  DEFAULT_HMA_TERMINATION_NOTICE_MONTHS,
  DEFAULT_HMA_TERMINATION_FEE_MONTHS,
  DEFAULT_PIP_CYCLE_YEARS,
  DEFAULT_PIP_COST_PER_KEY,
  SURFSIDE_COASTAL_FL_MILESTONE_YR_25,
  SURFSIDE_INLAND_FL_MILESTONE_YR_30,
  SURFSIDE_MILESTONE_INSPECTION_COST,
  IRR_BPS_PER_PCT_FFE_RESERVE,
  IRR_BPS_PER_PCT_BRAND_FEE,
  IRR_BPS_PER_MILLION_CAPITAL_EVENT,
} from "../../shared/constants-brand.js";
import { DEFAULT_COST_RATE_FFE } from "../../shared/constants.js";

// ── HMA computation constants ────────────────────────────────────────
const MONTHS_PER_YEAR = 12;

// ── Country normalization (Surfside callout works for ISO + long form) ─
const US_COUNTRY_ALIASES = new Set([
  "US",
  "USA",
  "U.S.",
  "U.S.A.",
  "UNITED STATES",
  "UNITED STATES OF AMERICA",
]);
function isUnitedStates(country: string | null | undefined): boolean {
  if (!country) return false;
  return US_COUNTRY_ALIASES.has(country.trim().toUpperCase());
}

// ── Adequacy badge thresholds (relative to USALI benchmark) ──────────
// Structural ratios (not financial assumptions): ratio = effectiveRate /
// benchmarkRate. The "AT" band is symmetric ±AT_BAND_HALF_WIDTH around 1.0
// so a property within half a percentage point of USALI reads as "at".
const ADEQUACY_AT_OR_ABOVE_BENCHMARK = 1.0;   // ≥ 100% of USALI 4%
const AT_BAND_UPPER_TRIGGER = 1 / 100;         // +1% above benchmark → "above"
const AT_BAND_HALF_WIDTH = 1 / 200;            // ±0.5% around 1.0 → "at"
const ADEQUACY_NEAR_BENCHMARK = 0.85;          // 85–99% of USALI
const ADEQUACY_BELOW_BENCHMARK = 0.6;          // 60–84% of USALI

// ── PIP planning horizon ─────────────────────────────────────────────
const PIP_PROJECTION_HORIZON_YEARS = 30;

// ── Coastal location types (drive the Surfside callout) ──────────────
const COASTAL_LOCATION_TYPES = new Set(["beach", "coastal", "oceanfront", "waterfront"]);

export type AdequacyBadge = "above" | "at" | "near" | "below" | "critical";

export interface BrandFeeLine {
  key: string;
  label: string;
  ratePctOfRoomRevenue: number;   // decimal (0.05 = 5%)
  annualDollars: number;
  source: "property-override" | "factory-default";
  irrImpactBps: number;             // first-order bps reduction in IRR
  irrImpactSentence: string;
}

export interface HmaTerms {
  baseFeeRate: number;
  incentiveFeeRate: number;
  termYears: number;
  terminationNoticeMonths: number;
  termSource: "property-override" | "factory-default";
  // Derived: years remaining on the HMA at `current_year`. Null when the
  // contract start year is unknown (the panel renders "—" in that case).
  termRemainingYears: number | null;
  // Dollar cost to terminate the HMA today, computed as
  // (annualRevenue * baseFeeRate) / 12 * hmaTerminationFeeMonths. Null when
  // the months-of-fee multiplier is unknown.
  terminationCost: number | null;
  terminationFeeMonths: number | null;
  terminationCostSource: "property-override" | "factory-default";
}

export interface CapitalEvent {
  yearOffset: number;
  fiscalYear: number;
  label: string;
  estimatedCost: number;
  category: "pip" | "milestone" | "user-defined";
  source: string;
  irrImpactBps: number;
  irrImpactSentence: string;
  isSurfsideCallout?: boolean;
}

export interface CondoExposure {
  duesPctRevenue: number;
  annualDollars: number;
  pendingSpecialAssessments: number;
  notes: string | null;
  hasExposure: boolean;
}

// Camel-case projection row served to the panel. Keeps the wire payload
// independent of the snake_case capex-reserve internals.
export interface FfeYearProjection {
  year: number;
  contribution: number;
  spending: number;
  endingBalance: number;
}

export interface FfeReserveAdequacy {
  effectiveReserveRate: number;
  benchmarkRate: number;
  ratioToBenchmark: number;
  badge: AdequacyBadge;
  benchmarkSource: string;
  yearlyProjections: FfeYearProjection[];
  fiveYearEndingBalance: number;
  tenYearEndingBalance: number;
  underfundingRisk: "adequate" | "marginal" | "underfunded" | "critical";
  irrImpactBps: number;
  irrImpactSentence: string;
}

export interface ReservesBrandBundleInput {
  property_name?: string;
  room_count: number;
  /** Total revenue (rooms + F&B + other). Drives FF&E reserve dollars
   *  (USALI 4% applies to gross revenue) and HMA base-fee dollars. */
  annual_revenue: number;
  /** Room revenue only. Brand-fee rates (franchise / royalty / marketing /
   *  loyalty / reservation / tech) are defined as % of *room* revenue, so
   *  the fee-dollar math must use this — not total revenue. Optional for
   *  back-compat; falls back to `annual_revenue` when not provided. */
  annual_room_revenue?: number;
  hold_period_years: number;
  ffe_reserve_rate?: number;
  base_management_fee_rate?: number;
  incentive_management_fee_rate?: number;
  franchise_fee_rate?: number | null;
  royalty_fee_rate?: number | null;
  brand_marketing_fee_rate?: number | null;
  loyalty_program_fee_rate?: number | null;
  reservation_fee_rate?: number | null;
  brand_technology_fee_rate?: number | null;
  hma_term_years?: number | null;
  hma_termination_notice_months?: number | null;
  hma_contract_start_year?: number | null;
  hma_termination_fee_months?: number | null;
  pip_schedule?: Array<{ yearOffset: number; scope?: string; estimatedCost?: number }> | null;
  condo_dues_pct_revenue?: number | null;
  condo_exposure_notes?: string | null;
  condo_pending_special_assessments?: number | null;
  country?: string | null;
  state_province?: string | null;
  location_type?: string | null;
  year_built?: number | null;
  last_renovation_year?: number | null;
  current_year: number;
  rounding_policy: RoundingPolicy;
}

export interface ReservesBrandBundleOutput {
  ffe_reserve_adequacy: FfeReserveAdequacy;
  brand_fee_stack: {
    lines: BrandFeeLine[];
    totalRate: number;
    totalAnnualDollars: number;
    totalIrrImpactBps: number;
  };
  hma_terms: HmaTerms;
  capital_events: {
    events: CapitalEvent[];
    surfsideApplies: boolean;
    surfsideMilestoneYear: number | null;
  };
  condo_exposure: CondoExposure;
  meta: {
    benchmarkSource: string;
    pipCycleYears: number;
    generatedAt: string;
  };
}

function classifyBadge(ratio: number): AdequacyBadge {
  if (ratio >= ADEQUACY_AT_OR_ABOVE_BENCHMARK + AT_BAND_UPPER_TRIGGER) return "above";
  if (ratio >= ADEQUACY_AT_OR_ABOVE_BENCHMARK - AT_BAND_HALF_WIDTH) return "at";
  if (ratio >= ADEQUACY_NEAR_BENCHMARK) return "near";
  if (ratio >= ADEQUACY_BELOW_BENCHMARK) return "below";
  return "critical";
}

function pickRate(
  override: number | null | undefined,
  fallback: number,
): { rate: number; source: "property-override" | "factory-default" } {
  if (override != null && Number.isFinite(override)) {
    return { rate: override, source: "property-override" };
  }
  return { rate: fallback, source: "factory-default" };
}

function brandFeeIrrSentence(label: string, ratePct: number, bps: number): string {
  const pct = (ratePct * 100).toFixed(2);
  return `At ${pct}% of room revenue, ${label} trims unlevered IRR by ~${bps} bps over a 10-yr hold (Cornell SHA sensitivity, 2022).`;
}

function eventIrrSentence(label: string, dollars: number, bps: number, fiscalYear: number): string {
  const m = (dollars / 1_000_000).toFixed(2);
  return `${label} ($${m}M in FY${fiscalYear}) trims unlevered IRR by ~${bps} bps if the event lands inside the hold period.`;
}

export function computeReservesBrandBundle(
  input: ReservesBrandBundleInput,
): ReservesBrandBundleOutput {
  const r = rounder(input.rounding_policy);
  const ratioRound = (v: number) => roundTo(v, RATIO_ROUNDING);

  // ── 1. FF&E reserve adequacy ──────────────────────────────────────
  const benchmarkRate = getFactoryNumber("ffeReserveBenchmarkUsali");
  const effectiveRate = input.ffe_reserve_rate ?? DEFAULT_COST_RATE_FFE;
  const ratioToBenchmark = ratioRound(effectiveRate / benchmarkRate);
  const badge = classifyBadge(ratioToBenchmark);

  // Run capex-reserve projections over the larger of (10, hold_period)
  // so the panel can show both 5- and 10-yr ending balances.
  const projectionHold = Math.max(10, input.hold_period_years);
  const reserveResult = computeCapexReserve({
    property_name: input.property_name,
    room_count: input.room_count,
    annual_revenue: input.annual_revenue,
    ffe_reserve_rate: effectiveRate,
    hold_period_years: projectionHold,
    rounding_policy: input.rounding_policy,
  });

  const fiveYear = reserveResult.yearly_projections.find(p => p.year === 5);
  const tenYear = reserveResult.yearly_projections.find(p => p.year === 10);
  const reserveGapPct = Math.max(0, (benchmarkRate - effectiveRate) * 100);
  const reserveIrrBps = Math.round(reserveGapPct * IRR_BPS_PER_PCT_FFE_RESERVE);
  const reserveIrrSentence = reserveGapPct > 0
    ? `Closing the ${reserveGapPct.toFixed(2)} pt gap to the USALI 4% benchmark would cost ~${reserveIrrBps} bps of IRR but eliminate the underfunding risk at exit.`
    : `Reserve rate meets or exceeds the USALI 4% benchmark — no additional IRR drag from under-reserving.`;

  // Project capex-reserve internals (snake_case) into the camelCase wire
  // shape the panel chart consumes — keeps `FfeYearProjection` decoupled
  // from `CapexYearProjection`.
  const yearlyProjections: FfeYearProjection[] = reserveResult.yearly_projections.map(
    (p) => ({
      year: p.year,
      contribution: p.reserve_contribution,
      spending: p.planned_replacements,
      endingBalance: p.ending_balance,
    }),
  );

  const ffeReserveAdequacy: FfeReserveAdequacy = {
    effectiveReserveRate: effectiveRate,
    benchmarkRate,
    ratioToBenchmark,
    badge,
    benchmarkSource: "USALI 11th Edition (4% of gross revenue)",
    yearlyProjections,
    fiveYearEndingBalance: fiveYear?.ending_balance ?? 0,
    tenYearEndingBalance: tenYear?.ending_balance ?? 0,
    underfundingRisk: reserveResult.underfunding_risk,
    irrImpactBps: reserveIrrBps,
    irrImpactSentence: reserveIrrSentence,
  };

  // ── 2. Brand-fee stack ────────────────────────────────────────────
  const stackDefs: Array<{
    key: string;
    label: string;
    override: number | null | undefined;
    factory: number;
  }> = [
    { key: "franchise", label: "Franchise fee", override: input.franchise_fee_rate, factory: DEFAULT_FRANCHISE_FEE_RATE },
    { key: "royalty", label: "Royalty fee", override: input.royalty_fee_rate, factory: DEFAULT_ROYALTY_FEE_RATE },
    { key: "marketing", label: "Brand marketing fee", override: input.brand_marketing_fee_rate, factory: DEFAULT_BRAND_MARKETING_FEE_RATE },
    { key: "loyalty", label: "Loyalty program fee", override: input.loyalty_program_fee_rate, factory: DEFAULT_LOYALTY_PROGRAM_FEE_RATE },
    { key: "reservation", label: "Reservation fee", override: input.reservation_fee_rate, factory: DEFAULT_RESERVATION_FEE_RATE },
    { key: "technology", label: "Brand technology fee", override: input.brand_technology_fee_rate, factory: DEFAULT_BRAND_TECHNOLOGY_FEE_RATE },
  ];

  // Brand-fee rates apply to *room* revenue (per franchise/HMA convention).
  // Use `annual_room_revenue` when provided; fall back to total revenue
  // only when the caller omits it (back-compat).
  const roomRevenue = input.annual_room_revenue ?? input.annual_revenue;
  const lines: BrandFeeLine[] = stackDefs.map(def => {
    const { rate, source } = pickRate(def.override, def.factory);
    const ratePct = rate * 100;
    const bps = Math.round(ratePct * IRR_BPS_PER_PCT_BRAND_FEE);
    return {
      key: def.key,
      label: def.label,
      ratePctOfRoomRevenue: rate,
      annualDollars: r(rate * roomRevenue),
      source,
      irrImpactBps: bps,
      irrImpactSentence: brandFeeIrrSentence(def.label, rate, bps),
    };
  });

  const totalRate = lines.reduce((s, l) => s + l.ratePctOfRoomRevenue, 0);
  const totalAnnualDollars = r(lines.reduce((s, l) => s + l.annualDollars, 0));
  const totalIrrImpactBps = lines.reduce((s, l) => s + l.irrImpactBps, 0);

  // ── 3. HMA terms ──────────────────────────────────────────────────
  const termPick = pickRate(input.hma_term_years, DEFAULT_HMA_TERM_YEARS);
  const baseFeeRate = input.base_management_fee_rate ?? 0;
  // termRemainingYears = max(0, (startYear + termYears) - currentYear).
  // Null when the contract start year is unknown so the panel can show "—"
  // instead of a misleading "10 yrs left" derived from defaults alone.
  const termRemainingYears: number | null =
    input.hma_contract_start_year != null && input.hma_contract_start_year > 0
      ? Math.max(0, input.hma_contract_start_year + termPick.rate - input.current_year)
      : null;
  // terminationCost = (annualRevenue * baseFeeRate) / 12 * termFeeMonths.
  // Falls back to the factory `DEFAULT_HMA_TERMINATION_FEE_MONTHS` so the
  // figure is always populated for boutique-class properties; null only
  // when the base mgmt fee is unknown (no fee → no buyout to compute).
  const termFeePick = pickRate(input.hma_termination_fee_months, DEFAULT_HMA_TERMINATION_FEE_MONTHS);
  const terminationFeeMonths: number | null = termFeePick.rate;
  const terminationCost: number | null =
    baseFeeRate > 0 && terminationFeeMonths != null
      ? r((input.annual_revenue * baseFeeRate / MONTHS_PER_YEAR) * terminationFeeMonths)
      : null;
  const hmaTerms: HmaTerms = {
    baseFeeRate,
    incentiveFeeRate: input.incentive_management_fee_rate ?? 0,
    termYears: termPick.rate,
    terminationNoticeMonths: input.hma_termination_notice_months ?? DEFAULT_HMA_TERMINATION_NOTICE_MONTHS,
    termSource: termPick.source,
    termRemainingYears,
    terminationCost,
    terminationFeeMonths,
    terminationCostSource: termFeePick.source,
  };

  // ── 4. Capital events (PIPs + Surfside callout) ───────────────────
  const events: CapitalEvent[] = [];
  const baseYear = input.last_renovation_year ?? input.year_built ?? input.current_year;

  if (input.pip_schedule && input.pip_schedule.length > 0) {
    for (const entry of input.pip_schedule) {
      const cost = entry.estimatedCost ?? r(input.room_count * DEFAULT_PIP_COST_PER_KEY);
      const fiscalYear = input.current_year + entry.yearOffset;
      const bps = Math.round((cost / 1_000_000) * IRR_BPS_PER_MILLION_CAPITAL_EVENT);
      events.push({
        yearOffset: entry.yearOffset,
        fiscalYear,
        label: entry.scope ?? "Brand-mandated PIP",
        estimatedCost: cost,
        category: "user-defined",
        source: "Per-property PIP schedule",
        irrImpactBps: bps,
        irrImpactSentence: eventIrrSentence(entry.scope ?? "PIP", cost, bps, fiscalYear),
      });
    }
  } else {
    // Project the next two PIP cycles from the base (renovation/built) year.
    const yearsSinceRefresh = input.current_year - baseYear;
    const yearsToNextPip = DEFAULT_PIP_CYCLE_YEARS - (yearsSinceRefresh % DEFAULT_PIP_CYCLE_YEARS);
    const cost = r(input.room_count * DEFAULT_PIP_COST_PER_KEY);
    const bps = Math.round((cost / 1_000_000) * IRR_BPS_PER_MILLION_CAPITAL_EVENT);
    for (let i = 0; i < 2; i++) {
      const offset = yearsToNextPip + i * DEFAULT_PIP_CYCLE_YEARS;
      if (offset > PIP_PROJECTION_HORIZON_YEARS) break;
      const fiscalYear = input.current_year + offset;
      events.push({
        yearOffset: offset,
        fiscalYear,
        label: i === 0 ? "Next brand-mandated PIP" : "Following PIP cycle",
        estimatedCost: cost,
        category: "pip",
        source: `Projected on ${DEFAULT_PIP_CYCLE_YEARS}-yr cycle from ${input.last_renovation_year ? "last renovation" : "year built"} (${baseYear})`,
        irrImpactBps: bps,
        irrImpactSentence: eventIrrSentence("PIP", cost, bps, fiscalYear),
      });
    }
  }

  // Surfside FL coastal milestone (post-2022 SB 4-D). The statute scopes
  // milestone structural inspections to coastal Florida buildings ≥ 3
  // stories. We surface BOTH the 25-yr and 30-yr milestone callouts so the
  // panel can show the next inspection AND the longer-horizon recertification.
  // Inland-FL properties are intentionally NOT flagged: SB 4-D does not
  // mandate recertification for them.
  let surfsideApplies = false;
  let surfsideMilestoneYear: number | null = null;
  const isUsFl = isUnitedStates(input.country) && input.state_province === "FL";
  const isCoastal = input.location_type
    ? COASTAL_LOCATION_TYPES.has(input.location_type.toLowerCase())
    : false;
  if (isUsFl && isCoastal && input.year_built) {
    surfsideApplies = true;
    const ageNow = input.current_year - input.year_built;
    // Track the *next* milestone (whichever 25/30-yr trigger lies ahead) so
    // downstream consumers (e.g. Risk Intel specialist) can sort by urgency.
    const milestoneAges: ReadonlyArray<number> = [
      SURFSIDE_COASTAL_FL_MILESTONE_YR_25,
      SURFSIDE_INLAND_FL_MILESTONE_YR_30,
    ];
    const nextMilestoneAge = milestoneAges.find(age => ageNow <= age) ?? milestoneAges[milestoneAges.length - 1];
    surfsideMilestoneYear = input.year_built + nextMilestoneAge;

    for (const milestoneAge of milestoneAges) {
      const yearsToMilestone = Math.max(0, milestoneAge - ageNow);
      const fiscalYear = input.year_built + milestoneAge;
      const cost = SURFSIDE_MILESTONE_INSPECTION_COST;
      const bps = Math.round((cost / 1_000_000) * IRR_BPS_PER_MILLION_CAPITAL_EVENT);
      events.push({
        yearOffset: yearsToMilestone,
        fiscalYear,
        label: `Florida ${milestoneAge}-yr coastal milestone recertification`,
        estimatedCost: cost,
        category: "milestone",
        source: "Florida SB 4-D (post-Surfside, 2022) — milestone structural inspections",
        irrImpactBps: bps,
        irrImpactSentence: eventIrrSentence(
          `Surfside ${milestoneAge}-yr milestone inspection + structural-engineer report`,
          cost,
          bps,
          fiscalYear,
        ),
        isSurfsideCallout: true,
      });
    }
  }

  // Sort by yearOffset for the timeline.
  events.sort((a, b) => a.yearOffset - b.yearOffset);

  // ── 5. Condo / mixed-use exposure ─────────────────────────────────
  const condoRate = input.condo_dues_pct_revenue ?? 0;
  const pendingAssessments = input.condo_pending_special_assessments ?? 0;
  const condoExposure: CondoExposure = {
    duesPctRevenue: condoRate,
    annualDollars: r(condoRate * input.annual_revenue),
    pendingSpecialAssessments: r(pendingAssessments),
    notes: input.condo_exposure_notes ?? null,
    hasExposure:
      condoRate > 0 ||
      pendingAssessments > 0 ||
      !!input.condo_exposure_notes,
  };

  return {
    ffe_reserve_adequacy: ffeReserveAdequacy,
    brand_fee_stack: { lines, totalRate, totalAnnualDollars, totalIrrImpactBps },
    hma_terms: hmaTerms,
    capital_events: { events, surfsideApplies, surfsideMilestoneYear },
    condo_exposure: condoExposure,
    meta: {
      benchmarkSource: "USALI 11th Edition; HVS 2024 boutique brand-fee guide; FL SB 4-D (2022)",
      pipCycleYears: DEFAULT_PIP_CYCLE_YEARS,
      generatedAt: new Date().toISOString(),
    },
  };
}
