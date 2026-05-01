import type { AuditReport } from "@/lib/financialAuditor";
import type { KnownValueTestResult } from "@/lib/runVerification";

// Import + re-export shared verification types — single source of truth
import type { CheckResult, PropertyCheckResults } from "@shared/verification-types";
export type { CheckResult, PropertyCheckResults };

export interface VerificationResult {
  timestamp: string;
  propertiesChecked: number;
  propertyResults: PropertyCheckResults[];
  companyChecks: CheckResult[];
  consolidatedChecks: CheckResult[];
  summary: {
    totalChecks: number;
    totalPassed: number;
    totalFailed: number;
    criticalIssues: number;
    materialIssues: number;
    auditOpinion: "UNQUALIFIED" | "QUALIFIED" | "ADVERSE";
    overallStatus: "PASS" | "FAIL" | "WARNING";
  };
  clientAuditWorkpaper?: string;
  clientAuditReports?: AuditReport[];
  clientKnownValueTests?: { passed: boolean; results: string; structured: KnownValueTestResult[] };
}

export interface VerificationHistoryEntry {
  id: number;
  userId: number;
  totalChecks: number;
  passed: number;
  failed: number;
  auditOpinion: string;
  overallStatus: string;
  createdAt: string;
}

export type SuiteId =
  | "independent-recheck"
  | "formula-identity"
  | "gaap-audit"
  | "cross-validation"
  | "financial-identities"
  | "golden-scenarios"
  | "ai-narrative";

export interface SuiteDefinition {
  id: SuiteId;
  label: string;
  description: string;
  estimatedTime: string;
  runsOn: "client" | "server";
  icon: string;
}

export interface SuiteRunResult {
  suiteId: SuiteId;
  timestamp: string;
  status: "PASS" | "WARNING" | "FAIL";
  summary: { total: number; passed: number; failed: number; critical: number };
  data: unknown;
}
