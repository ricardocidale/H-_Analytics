import { generatePropertyProForma } from "../client/src/lib/financialEngine";
import { runFullAudit, PropertyAuditInput, GlobalAuditInput } from "../client/src/lib/financialAuditor";

const prop = {
  name: "Blue Ridge Manor",
  type: "Financed",
  purchasePrice: 2500000,
  buildingImprovements: 750000,
  landValuePercent: 0.2,
  operatingReserve: 150000,
  acquisitionLTV: 0.65,
  acquisitionInterestRate: 0.09,
  acquisitionTermYears: 25,
  acquisitionDate: "2026-07-01",
  operationsStartDate: "2027-01-01",
  roomCount: 15,
  startAdr: 325,
  startOccupancy: 0.5,
  maxOccupancy: 0.8,
  occupancyRampMonths: 6,
  occupancyGrowthStep: 0.05,
  adrGrowthRate: 0.025,
  costRateRooms: 0.2,
  costRateFB: 0.085,
  costRateAdmin: 0.08,
  costRateMarketing: 0.01,
  costRatePropertyOps: 0.04,
  costRateUtilities: 0.05,
  costRateTaxes: 0.03,
  costRateIT: 0.005,
  costRateFFE: 0.04,
  costRateOther: 0.05,
  revShareEvents: 0.25,
  revShareFB: 0.18,
  revShareOther: 0.05,
  baseManagementFeeRate: 0.085,
  incentiveManagementFeeRate: 0.12,
  taxRate: 0.25,
};

const global = { modelStartDate: "2026-04-01", inflationRate: 0.03, projectionYears: 10 };
const globalAudit: GlobalAuditInput = {
  modelStartDate: "2026-04-01",
  inflationRate: 0.03,
  debtAssumptions: { interestRate: 0.09, amortizationYears: 25, acqLTV: 0.65 },
};

const financials = generatePropertyProForma(prop, global, 120);
const report = runFullAudit(prop as PropertyAuditInput, globalAudit, financials);
console.log("Opinion:", report.opinion);
console.log("Total Failed:", report.totalFailed);
for (const section of report.sections) {
  if (section.failed > 0) {
    console.log(`\nSection: ${section.name} — ${section.failed} failures`);
    const failedResults = section.results.filter((r: any) => !r.passed);
    for (const f of failedResults.slice(0, 3)) {
      console.log(`  - ${f.name}: expected=${f.expected}, actual=${f.actual}`);
    }
    if (failedResults.length > 3) console.log(`  ... and ${failedResults.length - 3} more`);
  }
}
