/**
 * shared/verification-types.ts — Cross-boundary verification types.
 *
 * These types are used by BOTH the server-side independent calculation checker
 * and the client-side verification UI. Defined here as the single source of
 * truth to prevent the three identical copies that previously existed.
 */

export interface CheckResult {
  metric: string;
  category: string;
  gaapRef: string;
  formula: string;
  expected: number;
  actual: number;
  variance: number;
  variancePct: number;
  passed: boolean;
  severity: "critical" | "material" | "minor" | "info";
}

export interface PropertyCheckResults {
  propertyName: string;
  propertyType: string;
  checks: CheckResult[];
  passed: number;
  failed: number;
  criticalIssues: number;
}
