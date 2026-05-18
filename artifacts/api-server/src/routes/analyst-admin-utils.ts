import { getFactoryNumber } from "@shared/model-constants-registry";
import { SEED_DEBT_ASSUMPTIONS } from "@shared/constants-funding";
import { DEFAULT_INTEREST_RATE } from "@shared/constants";
import type { GlobalInput } from "@engine/types";
import type { ModelConstant } from "@workspace/db";
import type { CountryInflationOutlook } from "@engine/analyst/surface/property/risk-intelligence-specialist";

export function gaToGlobalInput(ga: Record<string, unknown>, projectionYears: number): GlobalInput {
  const dbDebt = ga.debtAssumptions as Record<string, unknown> | null;
  return {
    modelStartDate: (ga.modelStartDate as string) ?? String(new Date().getFullYear()),
    inflationRate: Number(ga.inflationRate ?? getFactoryNumber('inflationRate', 'US')),
    marketingRate: Number(ga.marketingRate ?? 0.05),
    debtAssumptions: {
      interestRate: Number(dbDebt?.interestRate ?? DEFAULT_INTEREST_RATE),
      amortizationYears: Number(dbDebt?.amortizationYears ?? SEED_DEBT_ASSUMPTIONS.amortizationYears),
    },
    projectionYears,
    capitalRaise1Amount: (ga.capitalRaise1Amount as number | null) ?? undefined,
    capitalRaise1Date: (ga.capitalRaise1Date as string | null) ?? undefined,
    capitalRaise2Amount: (ga.capitalRaise2Amount as number | null) ?? undefined,
    capitalRaise2Date: (ga.capitalRaise2Date as string | null) ?? undefined,
    capitalRaise3Amount: (ga.capitalRaise3Amount as number | null) ?? undefined,
    capitalRaise3Date: (ga.capitalRaise3Date as string | null) ?? undefined,
  } as GlobalInput;
}

/**
 * Derive trancheGapMonths from capitalRaise1Date + capitalRaise2Date when
 * both are present. Mirrors the client form-hook derivation
 * (useCompanyAssumptionsForm.ts:454-456) so the runner sees the same value
 * the user sees on the Funding tab.
 */
export function deriveTrancheGapMonths(
  ga: { capitalRaise1Date?: string | Date | null; capitalRaise2Date?: string | Date | null },
): number | null {
  const d1 = ga.capitalRaise1Date ? new Date(ga.capitalRaise1Date).getTime() : NaN;
  const d2 = ga.capitalRaise2Date ? new Date(ga.capitalRaise2Date).getTime() : NaN;
  if (!Number.isFinite(d1) || !Number.isFinite(d2)) return null;
  // Negative gap means Tranche 2 is before Tranche 1 — invalid configuration.
  // Return null (routes to missing-data intent) rather than Math.abs which would
  // silently produce a plausible positive number.
  if (d2 <= d1) return null;
  return Math.round((d2 - d1) / (1000 * 60 * 60 * 24 * getFactoryNumber("daysPerMonth")));
}

/**
 * Map a `model_constants` row to `CountryInflationOutlook`. The row's
 * `value` may be a scalar (single point estimate) or a `{low,mid,high}`
 * range object written by Isadora (the macro-research Specialist).
 * Returns `null` when the value cannot be interpreted as a valid range.
 */
export function modelConstantToCountryInflationOutlook(
  row: ModelConstant,
): CountryInflationOutlook | null {
  const val = row.value;
  let low: number, mid: number, high: number;

  if (typeof val === "number" && Number.isFinite(val)) {
    low = val;
    mid = val;
    high = val;
  } else if (
    typeof val === "object" &&
    val !== null &&
    "low" in val &&
    "mid" in val &&
    "high" in val
  ) {
    const v = val as { low: unknown; mid: unknown; high: unknown };
    if (
      typeof v.low !== "number" ||
      typeof v.mid !== "number" ||
      typeof v.high !== "number" ||
      !Number.isFinite(v.low) ||
      !Number.isFinite(v.mid) ||
      !Number.isFinite(v.high)
    )
      return null;
    low = v.low;
    mid = v.mid;
    high = v.high;
  } else {
    return null;
  }

  return {
    low,
    mid,
    high,
    source: row.authoritySource ?? "model_constants",
    asOf:
      row.lastEditedAt instanceof Date
        ? row.lastEditedAt.toISOString()
        : String(row.lastEditedAt ?? new Date().toISOString()),
    url: row.authorityRef ?? undefined,
  };
}
