/**
 * stress-scenarios — Deterministic stress test engine for property financial resilience.
 *
 * PURE function — no I/O, no database access. Computes five standard stress
 * scenarios using simplified annual math (no monthly iteration needed).
 *
 * Scenarios:
 *   1. Occupancy -15% (recession)
 *   2. ADR -10% (rate compression)
 *   3. Interest rates +200bps (refinancing risk)
 *   4. Operating costs +20% (inflation)
 *   5. Combined: occupancy -10% AND costs +10% (stagflation)
 */

import { DAYS_PER_MONTH, MONTHS_PER_YEAR } from '@shared/constants';

export interface StressResult {
  scenario: string;
  description: string;
  impactOnNoi: number;
  impactOnNoiPercent: number;
  impactOnDscr: number;
  impactOnCashFlow: number;
  breachesDebtCovenant: boolean;
  severity: "low" | "moderate" | "severe" | "critical";
  narrative: string;
}

export interface StressAssumptions {
  roomCount: number;
  startAdr: number;
  startOccupancy: number;
  maxOccupancy: number;
  revShareFB: number;
  revShareEvents: number;
  revShareOther: number;
  costRateRooms: number;
  costRateAdmin: number;
  costRateMarketing: number;
  costRatePropertyOps: number;
  costRateUtilities: number;
  baseFeePercent: number;
  incentiveFeePercent: number;
  loanAmount?: number;
  interestRate?: number;
  loanTermYears?: number;
  purchasePrice: number;
}

// ── Internal helpers ────────────────────────────────────────────────────────

/** Compute annual debt service from loan parameters using standard PMT formula. */
function annualDebtService(
  loanAmount: number,
  annualRate: number,
  termYears: number,
): number {
  if (loanAmount <= 0 || termYears <= 0) return 0;
  const monthlyRate = annualRate / MONTHS_PER_YEAR;
  const totalPayments = termYears * MONTHS_PER_YEAR;
  if (monthlyRate === 0) return loanAmount / totalPayments * MONTHS_PER_YEAR;
  const factor = (1 + monthlyRate) ** totalPayments;
  const monthlyPayment = (loanAmount * monthlyRate * factor) / (factor - 1);
  return monthlyPayment * MONTHS_PER_YEAR;
}

/** Compute annual revenue, opex, fees, and NOI from assumptions. */
function computeAnnualFinancials(
  a: StressAssumptions,
  overrides?: {
    occupancyMultiplier?: number;
    adrMultiplier?: number;
    costMultiplier?: number;
    interestRateOverride?: number;
  },
) {
  const occMult = overrides?.occupancyMultiplier ?? 1;
  const adrMult = overrides?.adrMultiplier ?? 1;
  const costMult = overrides?.costMultiplier ?? 1;
  const rateOverride = overrides?.interestRateOverride;

  const effectiveOccupancy = a.startOccupancy * occMult;
  const effectiveAdr = a.startAdr * adrMult;

  // Monthly room revenue → annual
  const monthlyRoomRev = a.roomCount * effectiveAdr * effectiveOccupancy * DAYS_PER_MONTH;
  const ancillaryShare = a.revShareFB + a.revShareEvents + a.revShareOther;
  const roomShareOfTotal = Math.max(0.05, 1 - ancillaryShare);
  const monthlyTotalRev = monthlyRoomRev / roomShareOfTotal;
  const annualRevenue = monthlyTotalRev * MONTHS_PER_YEAR;

  // Weighted cost rate: each cost category applied to total revenue
  const totalCostRate = (
    a.costRateRooms * roomShareOfTotal +
    a.costRateAdmin +
    a.costRateMarketing +
    a.costRatePropertyOps +
    a.costRateUtilities
  ) * costMult;

  const annualOpex = annualRevenue * totalCostRate;

  // GOP for incentive fee calculation
  const gop = annualRevenue - annualOpex;
  const gopMargin = annualRevenue > 0 ? gop / annualRevenue : 0;

  // Management fees
  const baseFee = annualRevenue * a.baseFeePercent;
  const incentiveFee = Math.max(0, gop * a.incentiveFeePercent);
  const managementFees = baseFee + incentiveFee;

  const noi = annualRevenue - annualOpex - managementFees;

  // Debt service
  const hasDebt = (a.loanAmount ?? 0) > 0 && (a.interestRate ?? 0) > 0;
  const effectiveRate = rateOverride ?? (a.interestRate ?? 0);
  const ads = hasDebt
    ? annualDebtService(a.loanAmount!, effectiveRate, a.loanTermYears ?? 25)
    : 0;

  const dscr = ads > 0 ? noi / ads : 0;
  const cashFlow = noi - ads;

  return { annualRevenue, annualOpex, managementFees, noi, ads, dscr, cashFlow, gopMargin };
}

function classifySeverity(
  noiPctChange: number,
  dscr: number,
  hasDebt: boolean,
): "low" | "moderate" | "severe" | "critical" {
  if (hasDebt && dscr < 1.0) return "critical";
  if (hasDebt && dscr < 1.25) return "severe";
  if (noiPctChange < -0.20) return "moderate";
  return "low";
}

function formatCurrency(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function formatPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

// ── Main export ─────────────────────────────────────────────────────────────

export function computeStressScenarios(assumptions: StressAssumptions): StressResult[] {
  const base = computeAnnualFinancials(assumptions);
  const hasDebt = (assumptions.loanAmount ?? 0) > 0 && (assumptions.interestRate ?? 0) > 0;
  const results: StressResult[] = [];

  // ── 1. Occupancy -15% (recession) ────────────────────────────────────────
  {
    const stressed = computeAnnualFinancials(assumptions, { occupancyMultiplier: 0.85 });
    const noiChange = stressed.noi - base.noi;
    const noiPctChange = base.noi !== 0 ? noiChange / Math.abs(base.noi) : 0;
    const cashFlowChange = stressed.cashFlow - base.cashFlow;
    const severity = classifySeverity(noiPctChange, stressed.dscr, hasDebt);

    let narrative = `A 15% occupancy decline reduces annual NOI from ${formatCurrency(base.noi)} to ${formatCurrency(stressed.noi)} (${formatPct(noiPctChange)}).`;
    if (hasDebt) {
      narrative += ` DSCR ${stressed.dscr < base.dscr ? 'falls' : 'moves'} to ${stressed.dscr.toFixed(2)}x`;
      if (stressed.dscr < 1.25) {
        narrative += `, breaching the typical 1.25x debt covenant. This would require equity injection or fee deferral.`;
      } else {
        narrative += `, remaining above the 1.25x covenant threshold.`;
      }
    }

    results.push({
      scenario: "Occupancy -15%",
      description: "Recession scenario: demand drops 15% across all segments.",
      impactOnNoi: noiChange,
      impactOnNoiPercent: noiPctChange,
      impactOnDscr: hasDebt ? stressed.dscr : 0,
      impactOnCashFlow: cashFlowChange,
      breachesDebtCovenant: hasDebt && stressed.dscr < 1.25,
      severity,
      narrative,
    });
  }

  // ── 2. ADR -10% (rate compression) ───────────────────────────────────────
  {
    const stressed = computeAnnualFinancials(assumptions, { adrMultiplier: 0.90 });
    const noiChange = stressed.noi - base.noi;
    const noiPctChange = base.noi !== 0 ? noiChange / Math.abs(base.noi) : 0;
    const cashFlowChange = stressed.cashFlow - base.cashFlow;
    const severity = classifySeverity(noiPctChange, stressed.dscr, hasDebt);

    let narrative = `A 10% ADR reduction lowers annual NOI from ${formatCurrency(base.noi)} to ${formatCurrency(stressed.noi)} (${formatPct(noiPctChange)}).`;
    if (hasDebt) {
      narrative += ` DSCR adjusts to ${stressed.dscr.toFixed(2)}x${stressed.dscr < 1.25 ? ', breaching covenant.' : '.'}`;
    }
    narrative += ` Rate compression typically occurs during supply gluts or economic softening.`;

    results.push({
      scenario: "ADR -10%",
      description: "Rate compression scenario: competitive pressure forces 10% rate reduction.",
      impactOnNoi: noiChange,
      impactOnNoiPercent: noiPctChange,
      impactOnDscr: hasDebt ? stressed.dscr : 0,
      impactOnCashFlow: cashFlowChange,
      breachesDebtCovenant: hasDebt && stressed.dscr < 1.25,
      severity,
      narrative,
    });
  }

  // ── 3. Interest rates +200bps (refinancing risk) ─────────────────────────
  if (hasDebt) {
    const newRate = (assumptions.interestRate ?? 0) + 0.02;
    const stressed = computeAnnualFinancials(assumptions, { interestRateOverride: newRate });
    // NOI itself doesn't change — only debt service changes
    const noiChange = 0;
    const noiPctChange = 0;
    const cashFlowChange = stressed.cashFlow - base.cashFlow;
    const severity = classifySeverity(noiPctChange, stressed.dscr, hasDebt);

    const bpsIncrease = 200;
    let narrative = `A ${bpsIncrease}bps interest rate increase (${formatPct(assumptions.interestRate!)} → ${formatPct(newRate)}) raises annual debt service by ${formatCurrency(Math.abs(cashFlowChange))}.`;
    narrative += ` DSCR moves from ${base.dscr.toFixed(2)}x to ${stressed.dscr.toFixed(2)}x.`;
    if (stressed.dscr < 1.25) {
      narrative += ` This breaches the 1.25x covenant, triggering potential lender remediation.`;
    }

    results.push({
      scenario: "Interest Rate +200bps",
      description: "Refinancing risk: rates rise 200 basis points at maturity.",
      impactOnNoi: noiChange,
      impactOnNoiPercent: noiPctChange,
      impactOnDscr: stressed.dscr,
      impactOnCashFlow: cashFlowChange,
      breachesDebtCovenant: stressed.dscr < 1.25,
      severity,
      narrative,
    });
  }

  // ── 4. Operating costs +20% (inflation) ──────────────────────────────────
  {
    const stressed = computeAnnualFinancials(assumptions, { costMultiplier: 1.20 });
    const noiChange = stressed.noi - base.noi;
    const noiPctChange = base.noi !== 0 ? noiChange / Math.abs(base.noi) : 0;
    const cashFlowChange = stressed.cashFlow - base.cashFlow;
    const severity = classifySeverity(noiPctChange, stressed.dscr, hasDebt);

    let narrative = `A 20% operating cost increase reduces NOI from ${formatCurrency(base.noi)} to ${formatCurrency(stressed.noi)} (${formatPct(noiPctChange)}).`;
    narrative += ` Labor, utilities, and supply chain inflation are the primary drivers.`;
    if (hasDebt && stressed.dscr < 1.25) {
      narrative += ` DSCR falls to ${stressed.dscr.toFixed(2)}x, breaching covenant.`;
    }

    results.push({
      scenario: "Operating Costs +20%",
      description: "Inflation scenario: all operating expenses increase 20%.",
      impactOnNoi: noiChange,
      impactOnNoiPercent: noiPctChange,
      impactOnDscr: hasDebt ? stressed.dscr : 0,
      impactOnCashFlow: cashFlowChange,
      breachesDebtCovenant: hasDebt && stressed.dscr < 1.25,
      severity,
      narrative,
    });
  }

  // ── 5. Combined stress (occupancy -10% AND costs +10%) ───────────────────
  {
    const stressed = computeAnnualFinancials(assumptions, {
      occupancyMultiplier: 0.90,
      costMultiplier: 1.10,
    });
    const noiChange = stressed.noi - base.noi;
    const noiPctChange = base.noi !== 0 ? noiChange / Math.abs(base.noi) : 0;
    const cashFlowChange = stressed.cashFlow - base.cashFlow;
    const severity = classifySeverity(noiPctChange, stressed.dscr, hasDebt);

    let narrative = `Stagflation scenario: 10% occupancy decline combined with 10% cost increase reduces NOI from ${formatCurrency(base.noi)} to ${formatCurrency(stressed.noi)} (${formatPct(noiPctChange)}).`;
    if (hasDebt) {
      narrative += ` DSCR moves to ${stressed.dscr.toFixed(2)}x.`;
      if (stressed.dscr < 1.0) {
        narrative += ` Property cannot cover debt service — requires immediate equity injection or loan restructuring.`;
      } else if (stressed.dscr < 1.25) {
        narrative += ` Covenant breach likely triggers lender negotiation.`;
      }
    }

    results.push({
      scenario: "Combined Stress",
      description: "Stagflation: occupancy -10% combined with operating costs +10%.",
      impactOnNoi: noiChange,
      impactOnNoiPercent: noiPctChange,
      impactOnDscr: hasDebt ? stressed.dscr : 0,
      impactOnCashFlow: cashFlowChange,
      breachesDebtCovenant: hasDebt && stressed.dscr < 1.25,
      severity,
      narrative,
    });
  }

  return results;
}
