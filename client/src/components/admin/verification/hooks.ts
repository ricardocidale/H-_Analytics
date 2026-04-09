import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { runFullVerification, runKnownValueTestsStructured } from "@/lib/runVerification";
import { generatePropertyProForma } from "@/lib/financialEngine";
import { MONTHS_PER_YEAR } from "@/lib/constants";
import { validateFinancialIdentities } from "@calc/validation/financial-identities";
import { DEFAULT_ROUNDING } from "@calc/shared/utils";
import type { VerificationResult, VerificationHistoryEntry, SuiteId, SuiteRunResult } from "./types";

async function safeFetchJSON<T>(url: string, label: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) {
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("application/json")) {
      throw new Error(`${label}: server returned ${res.status} (non-JSON)`);
    }
    const body = await res.json().catch(() => ({}));
    throw new Error(`${label}: ${(body as Record<string, unknown>).error || res.statusText}`);
  }
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("application/json")) {
    throw new Error(`${label}: expected JSON but received ${ct || "unknown content"}`);
  }
  return res.json();
}

export function useVerificationHistory() {
  return useQuery<VerificationHistoryEntry[]>({
    queryKey: ["admin", "verification-history"],
    queryFn: async () => {
      return safeFetchJSON<VerificationHistoryEntry[]>("/api/verification/history", "Verification history");
    },
  });
}

export function useRunVerification(onSuccess?: (data: VerificationResult) => void) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const [properties, globalAssumptions] = await Promise.all([
        safeFetchJSON<any[]>("/api/properties", "Properties"),
        safeFetchJSON<any>("/api/global-assumptions", "Global assumptions"),
      ]);

      const comprehensiveResults = runFullVerification(properties, globalAssumptions);
      const knownValueTests = runKnownValueTestsStructured();

      const serverRes = await fetch("/api/verification/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({}),
      });
      if (!serverRes.ok) {
        const ct = serverRes.headers.get("content-type") || "";
        if (!ct.includes("application/json")) {
          throw new Error(`Server verification: returned ${serverRes.status} (non-JSON)`);
        }
        const body = await serverRes.json().catch(() => ({}));
        throw new Error(`Server verification: ${(body as Record<string, unknown>).error || serverRes.statusText}`);
      }
      const sct = serverRes.headers.get("content-type") || "";
      if (!sct.includes("application/json")) {
        throw new Error(`Server verification: expected JSON but received ${sct || "unknown content"}`);
      }
      const serverRun = await serverRes.json();
      const serverReport: VerificationResult = serverRun.results ?? serverRun;

      return {
        ...serverReport,
        clientAuditWorkpaper: comprehensiveResults.auditWorkpaper,
        clientAuditReports: comprehensiveResults.auditReports,
        clientKnownValueTests: knownValueTests,
      };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "verification-history"] });
      toast({
        title: data.summary.auditOpinion === "UNQUALIFIED" ? "Audit Complete - Unqualified Opinion" :
               data.summary.auditOpinion === "QUALIFIED" ? "Audit Complete - Qualified Opinion" :
               "Audit Complete - Issues Found",
        description: `${data.summary.totalChecks} checks run. ${data.summary.criticalIssues} critical issues.`,
        variant: data.summary.auditOpinion === "UNQUALIFIED" ? "default" : "destructive"
      });
      if (onSuccess) onSuccess(data);
    },
    onError: (error: Error) => {
      toast({ title: "Verification Failed", description: error.message, variant: "destructive" });
    },
  });
}

/**
 * Run selected suites independently.
 * For suites that need data, fetches properties + globalAssumptions once.
 */
export function useRunSuites(
  onSuiteComplete?: (suiteId: SuiteId, result: SuiteRunResult) => void,
  onAllComplete?: (results: Map<SuiteId, SuiteRunResult>) => void
) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (selectedSuites: Set<SuiteId>): Promise<Map<SuiteId, SuiteRunResult>> => {
      const results = new Map<SuiteId, SuiteRunResult>();
      const suiteArray = Array.from(selectedSuites).filter(s => s !== "ai-narrative");

      if (suiteArray.length === 0) return results;

      // Fetch shared data once
      const [properties, globalAssumptions] = await Promise.all([
        safeFetchJSON<any[]>("/api/properties", "Properties"),
        safeFetchJSON<any>("/api/global-assumptions", "Global assumptions"),
      ]);

      // Run client-side suites
      const fullResults = runFullVerification(properties, globalAssumptions);
      const knownValueTests = runKnownValueTestsStructured();

      // Formula & Identity suite
      if (suiteArray.includes("formula-identity")) {
        const fPassed = fullResults.summary.formulaChecksPassed;
        const fFailed = fullResults.summary.formulaChecksFailed;
        const result: SuiteRunResult = {
          suiteId: "formula-identity",
          timestamp: new Date().toISOString(),
          status: fFailed > 0 ? "FAIL" : "PASS",
          summary: { total: fPassed + fFailed, passed: fPassed, failed: fFailed, critical: 0 },
          data: { formulaReport: fullResults.formulaReport, knownValueTests },
        };
        results.set("formula-identity", result);
        onSuiteComplete?.("formula-identity", result);
      }

      // GAAP Audit suite
      if (suiteArray.includes("gaap-audit")) {
        const cPassed = fullResults.summary.complianceChecksPassed;
        const cFailed = fullResults.summary.complianceChecksFailed;
        const result: SuiteRunResult = {
          suiteId: "gaap-audit",
          timestamp: new Date().toISOString(),
          status: cFailed > 0 ? "FAIL" : "PASS",
          summary: { total: cPassed + cFailed, passed: cPassed, failed: cFailed, critical: fullResults.summary.criticalIssues },
          data: { complianceReport: fullResults.complianceReport, auditWorkpaper: fullResults.auditWorkpaper, auditReports: fullResults.auditReports },
        };
        results.set("gaap-audit", result);
        onSuiteComplete?.("gaap-audit", result);
      }

      // Cross-Validation suite
      if (suiteArray.includes("cross-validation")) {
        const xPassed = fullResults.summary.crossValidationPassed;
        const xFailed = fullResults.summary.crossValidationFailed;
        const result: SuiteRunResult = {
          suiteId: "cross-validation",
          timestamp: new Date().toISOString(),
          status: xFailed > 0 ? "FAIL" : "PASS",
          summary: { total: xPassed + xFailed, passed: xPassed, failed: xFailed, critical: 0 },
          data: { crossValidationReport: fullResults.crossValidationReport, crossValidationReports: fullResults.crossValidationReports },
        };
        results.set("cross-validation", result);
        onSuiteComplete?.("cross-validation", result);
      }

      // Financial Identities suite (client-side — runs engine per property per year)
      if (suiteArray.includes("financial-identities")) {
        try {
          const projYears = globalAssumptions?.projectionYears ?? 10;
          const projMonths = projYears * MONTHS_PER_YEAR;
          let totalChecks = 0, totalPassed = 0;
          const propertyResults: any[] = [];

          for (const prop of properties) {
            const financials = generatePropertyProForma(prop, globalAssumptions, projMonths);
            for (let y = 0; y < projYears; y++) {
              const startIdx = y * MONTHS_PER_YEAR;
              const yearMonths = financials.slice(startIdx, Math.min(startIdx + 12, financials.length));
              if (yearMonths.length === 0) continue;
              const yearEnd = yearMonths[yearMonths.length - 1];
              const sum = (fn: (m: any) => number) => yearMonths.reduce((s, m) => s + fn(m), 0);

              const idResult = validateFinancialIdentities({
                period_label: `${prop.name} Year ${y + 1}`,
                balance_sheet: {
                  total_assets: yearEnd.propertyValue + yearEnd.endingCash,
                  total_liabilities: yearEnd.debtOutstanding,
                  total_equity: yearEnd.propertyValue + yearEnd.endingCash - yearEnd.debtOutstanding,
                },
                income_statement: {
                  noi: sum(m => m.noi), anoi: sum(m => m.anoi),
                  interest_expense: sum(m => m.interestExpense),
                  depreciation: sum(m => m.depreciationExpense),
                  income_tax: sum(m => m.incomeTax),
                  net_income: sum(m => m.netIncome),
                },
                cash_flow_statement: {
                  operating_cash_flow: sum(m => m.operatingCashFlow),
                  financing_cash_flow: sum(m => m.financingCashFlow),
                  ending_cash: yearEnd.endingCash,
                  principal_payment: sum(m => m.principalPayment),
                  refinancing_proceeds: sum(m => m.refinancingProceeds),
                },
                rounding_policy: DEFAULT_ROUNDING,
              });
              totalChecks += idResult.checks.length;
              totalPassed += idResult.checks.filter(c => c.passed).length;
              propertyResults.push({ property: prop.name, year: y + 1, ...idResult });
            }
          }

          const result: SuiteRunResult = {
            suiteId: "financial-identities",
            timestamp: new Date().toISOString(),
            status: totalPassed === totalChecks ? "PASS" : "FAIL",
            summary: { total: totalChecks, passed: totalPassed, failed: totalChecks - totalPassed, critical: 0 },
            data: { results: propertyResults },
          };
          results.set("financial-identities", result);
          onSuiteComplete?.("financial-identities", result);
        } catch {
          results.set("financial-identities", {
            suiteId: "financial-identities",
            timestamp: new Date().toISOString(),
            status: "FAIL",
            summary: { total: 0, passed: 0, failed: 0, critical: 0 },
            data: null,
          });
        }
      }

      // Golden Scenarios suite (server-side — runs vitest)
      if (suiteArray.includes("golden-scenarios")) {
        try {
          const goldenRes = await fetch("/api/admin/golden-test-run", {
            method: "POST",
            credentials: "include",
          });
          if (goldenRes.ok) {
            const gd = await goldenRes.json();
            const result: SuiteRunResult = {
              suiteId: "golden-scenarios",
              timestamp: new Date().toISOString(),
              status: gd.failed === 0 ? "PASS" : "FAIL",
              summary: { total: gd.totalTests, passed: gd.passed, failed: gd.failed, critical: 0 },
              data: gd,
            };
            results.set("golden-scenarios", result);
            onSuiteComplete?.("golden-scenarios", result);
          } else {
            throw new Error(`Golden test run failed: ${goldenRes.status}`);
          }
        } catch {
          results.set("golden-scenarios", {
            suiteId: "golden-scenarios",
            timestamp: new Date().toISOString(),
            status: "FAIL",
            summary: { total: 0, passed: 0, failed: 0, critical: 0 },
            data: null,
          });
        }
      }

      // Independent Recheck suite (server-side)
      if (suiteArray.includes("independent-recheck")) {
        const serverRes = await fetch("/api/verification/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({}),
        });
        if (serverRes.ok) {
          const sct = serverRes.headers.get("content-type") || "";
          if (sct.includes("application/json")) {
            const serverRun = await serverRes.json();
            const serverReport: VerificationResult = serverRun.results ?? serverRun;
            const result: SuiteRunResult = {
              suiteId: "independent-recheck",
              timestamp: new Date().toISOString(),
              status: serverReport.summary.overallStatus === "PASS" ? "PASS" : serverReport.summary.overallStatus === "WARNING" ? "WARNING" : "FAIL",
              summary: {
                total: serverReport.summary.totalChecks,
                passed: serverReport.summary.totalPassed,
                failed: serverReport.summary.totalFailed,
                critical: serverReport.summary.criticalIssues,
              },
              data: serverReport,
            };
            results.set("independent-recheck", result);
            onSuiteComplete?.("independent-recheck", result);
          }
        }
      }

      return results;
    },
    onSuccess: (results) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "verification-history"] });
      const allPassed = Array.from(results.values()).every(r => r.status === "PASS");
      toast({
        title: allPassed ? "All Suites Passed" : "Verification Complete",
        description: `${results.size} suite(s) run. ${Array.from(results.values()).filter(r => r.status === "PASS").length} passed.`,
        variant: allPassed ? "default" : "destructive",
      });
      onAllComplete?.(results);
    },
    onError: (error: Error) => {
      toast({ title: "Verification Failed", description: error.message, variant: "destructive" });
    },
  });
}
