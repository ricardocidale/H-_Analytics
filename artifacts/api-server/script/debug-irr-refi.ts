/**
 * debug-irr-refi — diagnose elevated IRR on cash-acquisition + refi properties
 *
 * Prints a per-year cash-flow decomposition for the four full-equity+refi
 * demo properties (IDs 70–72, 76) so the IRR drivers are visible.
 *
 * Run from repo root:
 *   POSTGRES_URL=... tsx artifacts/api-server/script/debug-irr-refi.ts
 * or from the api-server directory:
 *   POSTGRES_URL=... tsx script/debug-irr-refi.ts
 */

/* eslint-disable no-console */
import { storage } from "../src/storage";
import { withFinancialHydration } from "../src/defaults";
import { computeSingleProperty } from "../src/finance/service";
import { aggregateUnifiedByYear } from "@engine/aggregation/yearlyAggregator";
import { computeIRR } from "@analytics/returns/irr";
import type { PropertyInput, GlobalInput } from "@engine/types";
import type { LoanParams, GlobalLoanParams } from "@engine/debt/loanCalculations";

const PROPERTY_IDS = [70, 71, 72, 76];

function fmt(n: number | null | undefined): string {
  if (n == null) return "null";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}
function pct(n: number | null | undefined): string {
  if (n == null) return "null";
  return (n * 100).toFixed(1) + "%";
}

async function main() {
  const ga = await storage.getGlobalAssumptions(undefined);
  if (!ga) {
    console.error("No global assumptions found");
    process.exit(1);
  }

  for (const propId of PROPERTY_IDS) {
    const rawProp = await storage.getProperty(propId);
    if (!rawProp) {
      console.error(`Property ${propId} not found`);
      continue;
    }

    const [hydratedProp] = await withFinancialHydration(
      [rawProp as Record<string, unknown>],
      ga,
    );

    const prop = hydratedProp as unknown as PropertyInput;
    const projectionYears = 10;

    const result = computeSingleProperty({ property: prop, globalAssumptions: ga as unknown as GlobalInput, projectionYears });

    const unified = aggregateUnifiedByYear(
      result.monthly,
      prop as unknown as LoanParams,
      ga as unknown as GlobalLoanParams,
      projectionYears,
    );

    const netFlows = Array.from({ length: projectionYears }, (_, y) =>
      unified.yearlyCF[y]?.netCashFlowToInvestors ?? 0,
    );

    const hasPos = netFlows.some(cf => cf > 0);
    const hasNeg = netFlows.some(cf => cf < 0);
    const irrResult = hasPos && hasNeg ? computeIRR(netFlows, 1) : null;

    console.log(`\n${"─".repeat(80)}`);
    console.log(`${rawProp.name} (ID: ${propId})`);
    console.log(`  type=${rawProp.type}  acquisitionLTV=${pct(rawProp.acquisitionLtv ?? 0)}  refinanceLTV=${pct(rawProp.refinanceLtv ?? 0)}  refinanceBasis=${rawProp.refinanceBasis ?? 'purchase_price'}`);
    console.log(`  purchasePrice=${fmt(rawProp.purchasePrice)}  buildingImprovements=${fmt(rawProp.buildingImprovements ?? 0)}  totalCost≈${fmt((rawProp.purchasePrice ?? 0) + (rawProp.buildingImprovements ?? 0) + (rawProp.preOpeningCosts ?? 0) + (rawProp.operatingReserve ?? 0))}`);
    console.log(`  willRefinance=${rawProp.willRefinance}  refinanceDate=${rawProp.refinanceDate}  refiMaxLtvToOriginal=${pct(rawProp.refiMaxLtvToOriginal ?? null)}`);
    console.log(`  IRR: ${irrResult ? pct(irrResult.irr_annualized) : "n/a (no sign change)"}`);
    console.log(`${"─".repeat(80)}`);
    console.log(
      `${"Year".padStart(4)} | ${"EquityIn".padStart(12)} | ${"ATCF".padStart(12)} | ${"RefiProceeds".padStart(14)} | ${"ExitValue".padStart(13)} | ${"NetCF".padStart(12)}`
    );
    console.log(`${"-".repeat(4)}-+-${"-".repeat(12)}-+-${"-".repeat(12)}-+-${"-".repeat(14)}-+-${"-".repeat(13)}-+-${"-".repeat(12)}`);

    for (let y = 0; y < projectionYears; y++) {
      const row = unified.yearlyCF[y];
      if (!row) continue;
      console.log(
        `${String(y + 1).padStart(4)} | ${fmt(-netFlows[y] < 0 && y === 0 ? unified.yearlyCF[y].netCashFlowToInvestors : 0).padStart(12)} | ` +
        `${fmt(row.atcf ?? 0).padStart(12)} | ` +
        `${fmt(row.refinancingProceeds ?? 0).padStart(14)} | ` +
        `${fmt(row.exitValue ?? 0).padStart(13)} | ` +
        `${fmt(row.netCashFlowToInvestors).padStart(12)}`,
      );
    }
  }

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
