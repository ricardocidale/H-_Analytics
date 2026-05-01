/**
 * diagnose-portfolio-irr.ts — verified baseline IRR diagnostic for the seed portfolio.
 *
 * Runs `generatePropertyProForma` + exit valuation + `computeIRR` on every
 * property in `SEED_INITIAL_PROPERTIES`, with the same defaults the seed
 * importer uses, so the output reflects the engine's full pipeline including
 * occupancy ramp, pre-opening burn, refinancing, debt service, and exit
 * proceeds. Replaces hand-calc baselines that omit those mechanics.
 *
 * Run: tsx script/diagnose-portfolio-irr.ts (from artifacts/api-server/)
 */
import {
  PROJECTION_MONTHS,
  MONTHS_PER_YEAR,
  DEFAULT_MODEL_START_DATE,
  DEFAULT_MARKETING_RATE,
  DEFAULT_BASE_MANAGEMENT_FEE_RATE,
  DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE,
  DEFAULT_COMMISSION_RATE,
  DEFAULT_EVENT_EXPENSE_RATE,
  DEFAULT_OTHER_EXPENSE_RATE,
  DEFAULT_UTILITIES_VARIABLE_SPLIT,
} from "@shared/constants";
import { getFactoryNumber } from "@shared/model-constants-registry";
import { generatePropertyProForma } from "@engine/property/property-engine";
import type { PropertyInput, GlobalInput, MonthlyFinancials } from "@engine/types";
import { computeExitValuation } from "@calc/returns/exit-valuation";
import { computeIRR } from "@analytics/returns/irr";
import {
  SEED_PROPERTY_DEFAULTS,
  SEED_INITIAL_PROPERTIES,
} from "../src/seeds/property-data";

const PROJECTION_YEARS = PROJECTION_MONTHS / MONTHS_PER_YEAR;
// Diagnostic thresholds — LP-credible boutique-luxury IRR band.
// Below LOW: under-performing for hospitality private equity (LP institutional minimum ~15-18%).
// Above HIGH: implausibly high; LPs will scrutinize the model.
const HEALTHY_BAND_LOW = 0.20;
const HEALTHY_BAND_HIGH = 0.50;
// Currency formatting precision (USD cents) for the exit waterfall round.
const USD_CENTS_PRECISION = 2;

function buildGlobal(): GlobalInput {
  return {
    modelStartDate: DEFAULT_MODEL_START_DATE,
    projectionYears: PROJECTION_YEARS,
    inflationRate: getFactoryNumber("inflationRate", "United States"),
    fixedCostEscalationRate: getFactoryNumber("inflationRate", "United States"),
    marketingRate: DEFAULT_MARKETING_RATE,
    baseManagementFee: DEFAULT_BASE_MANAGEMENT_FEE_RATE,
    incentiveManagementFee: DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE,
    commissionRate: DEFAULT_COMMISSION_RATE,
    eventExpenseRate: DEFAULT_EVENT_EXPENSE_RATE,
    otherExpenseRate: DEFAULT_OTHER_EXPENSE_RATE,
    utilitiesVariableSplit: DEFAULT_UTILITIES_VARIABLE_SPLIT,
  } as GlobalInput;
}

function aggregateAnnual(monthly: MonthlyFinancials[]): {
  yearlyCashFlow: number[];
  yearlyRefiProceeds: number[];
  yearlyAnoi: number[];
  finalDebtOutstanding: number;
  stabilizedAnoi: number;
} {
  const years = Math.ceil(monthly.length / MONTHS_PER_YEAR);
  const yearlyCashFlow = new Array<number>(years).fill(0);
  const yearlyRefiProceeds = new Array<number>(years).fill(0);
  const yearlyAnoi = new Array<number>(years).fill(0);
  for (let i = 0; i < monthly.length; i++) {
    const y = Math.floor(i / MONTHS_PER_YEAR);
    yearlyCashFlow[y] += monthly[i].cashFlow;
    yearlyRefiProceeds[y] += monthly[i].refinancingProceeds;
    yearlyAnoi[y] += monthly[i].anoi;
  }
  const finalDebtOutstanding = monthly[monthly.length - 1].debtOutstanding;
  const stabilizedAnoi = yearlyAnoi[yearlyAnoi.length - 1];
  return { yearlyCashFlow, yearlyRefiProceeds, yearlyAnoi, finalDebtOutstanding, stabilizedAnoi };
}

function classifyIrr(irr: number | null): string {
  if (irr === null) return "BROKEN";
  if (irr < HEALTHY_BAND_LOW) return "LOW";
  if (irr > HEALTHY_BAND_HIGH) return "HIGH";
  return "HEALTHY";
}

function fmtPct(x: number | null): string {
  if (x === null) return "    n/a";
  return `${(x * 100).toFixed(1).padStart(6)}%`;
}

function fmtUsd(x: number): string {
  const abs = Math.abs(x);
  if (abs >= 1_000_000) return `${(x / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${(x / 1_000).toFixed(0)}K`;
  return `${x.toFixed(0)}`;
}

function diagnoseProperty(seedProperty: Record<string, unknown>, global: GlobalInput): void {
  const merged = { ...SEED_PROPERTY_DEFAULTS, ...seedProperty } as PropertyInput & {
    name?: string;
    purchasePrice: number;
    buildingImprovements?: number | null;
    preOpeningCosts?: number | null;
    operatingReserve?: number | null;
    acquisitionLTV?: number | null;
    roomCount: number;
    exitCapRate?: number | null;
    dispositionCommission?: number | null;
  };

  const monthly = generatePropertyProForma(merged, global, PROJECTION_MONTHS);
  const { yearlyCashFlow, yearlyRefiProceeds, yearlyAnoi, finalDebtOutstanding, stabilizedAnoi } =
    aggregateAnnual(monthly);

  const totalPropertyValue = merged.purchasePrice + (merged.buildingImprovements ?? 0);
  const ltv = merged.acquisitionLTV ?? 0;
  const originalLoan = merged.type === "Financed" ? totalPropertyValue * ltv : 0;
  const equityFromAcquisition = totalPropertyValue - originalLoan;
  const preOpeningCosts = (merged.preOpeningCosts as number | null) ?? 0;
  const operatingReserve = (merged.operatingReserve as number | null) ?? 0;
  const equityInvested = equityFromAcquisition + preOpeningCosts + operatingReserve;

  const exitCapRate = (merged.exitCapRate as number | null) ?? 0;
  const exit = computeExitValuation({
    stabilized_noi: stabilizedAnoi,
    exit_cap_rate: exitCapRate,
    commission_rate: (merged.dispositionCommission as number | null) ?? DEFAULT_COMMISSION_RATE,
    outstanding_debt: finalDebtOutstanding,
    room_count: merged.roomCount,
    rounding_policy: { precision: USD_CENTS_PRECISION, bankers_rounding: false },
  });

  const cashFlowsForIrr: number[] = [];
  cashFlowsForIrr.push(-equityInvested);
  for (let y = 0; y < PROJECTION_YEARS; y++) {
    const cf = (yearlyCashFlow[y] ?? 0) + (yearlyRefiProceeds[y] ?? 0);
    if (y === PROJECTION_YEARS - 1) {
      cashFlowsForIrr.push(cf + exit.net_to_equity);
    } else {
      cashFlowsForIrr.push(cf);
    }
  }

  const irrResult = computeIRR(cashFlowsForIrr, 1);
  const irr = irrResult.irr_annualized;

  const stabilizedYearIdx = PROJECTION_YEARS - 2;
  const stabilizedNoiVal = yearlyAnoi[stabilizedYearIdx] ?? 0;
  const year1Cash = yearlyCashFlow[0] ?? 0;
  const stabilizedCash = yearlyCashFlow[stabilizedYearIdx] ?? 0;

  const name = (seedProperty.name as string) ?? "(unnamed)";
  const flag = classifyIrr(irr);

  console.log(
    `  ${name.padEnd(24)} ${merged.roomCount.toString().padStart(3)}r ` +
      `$${(merged.startAdr as number).toString().padStart(4)} ` +
      `${merged.type.padEnd(11)} ` +
      `equity=${fmtUsd(equityInvested).padStart(7)} ` +
      `Y1cf=${fmtUsd(year1Cash).padStart(7)} ` +
      `stab.ANOI=${fmtUsd(stabilizedNoiVal).padStart(7)} ` +
      `stab.cf=${fmtUsd(stabilizedCash).padStart(7)} ` +
      `exit=${fmtUsd(exit.net_to_equity).padStart(7)} ` +
      `IRR=${fmtPct(irr)} ${flag}`,
  );
}

function main(): void {
  const global = buildGlobal();
  console.log(`\nPortfolio IRR Diagnostic — ${SEED_INITIAL_PROPERTIES.length} active properties`);
  console.log(`Healthy band: ${(HEALTHY_BAND_LOW * 100).toFixed(0)}%–${(HEALTHY_BAND_HIGH * 100).toFixed(0)}% IRR`);
  console.log(`Projection: ${PROJECTION_YEARS}y (${PROJECTION_MONTHS} months) starting ${DEFAULT_MODEL_START_DATE}\n`);
  for (const prop of SEED_INITIAL_PROPERTIES) {
    diagnoseProperty(prop as Record<string, unknown>, global);
  }
  console.log("");
}

main();
