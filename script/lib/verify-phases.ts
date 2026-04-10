export interface VerifyPhase {
  name: string;
  file: string;
}

export const VERIFY_PHASES: readonly VerifyPhase[] = [
  { name: "Proof Scenarios", file: "scenarios.test.ts" },
  { name: "Hardcoded Detection", file: "hardcoded-detection.test.ts" },
  { name: "Golden Values", file: "golden-values.test.ts" },
  { name: "Reconciliation", file: "reconciliation-report.test.ts" },
  { name: "Data Integrity", file: "data-integrity.test.ts" },
  { name: "Portfolio Dynamics", file: "portfolio-dynamics.test.ts" },
  { name: "Recalc Enforcement", file: "recalculation-enforcement.test.ts" },
  { name: "Rule Compliance", file: "rule-compliance.test.ts" },
  { name: "Number Precision", file: "number-precision.test.ts" },
  { name: "Decimal Boundaries", file: "decimal-precision.test.ts" },
  { name: "Aggregation Xcheck", file: "aggregation-crosscheck.test.ts" },
  { name: "Snapshot Integrity", file: "snapshot-integrity.test.ts" },
  { name: "Regression Snapshots", file: "regression-snapshots.test.ts" },
  { name: "Parity Numeric", file: "parity-numeric.test.ts" },
  { name: "Cache Integrity", file: "cache-integrity.test.ts" },
] as const;

export function allProofFilePaths(): string[] {
  return VERIFY_PHASES.map((p) => `tests/proof/${p.file}`);
}
