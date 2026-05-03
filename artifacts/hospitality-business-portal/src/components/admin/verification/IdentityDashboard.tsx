import { useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  ChevronDown,
  CheckCircle2,
  XCircle,
  Scale,
  Loader2,
  RefreshCw,
} from "@/components/icons/themed-icons";
import { generatePropertyProForma } from "@/lib/financialEngine";
import { MONTHS_PER_YEAR } from "@/lib/constants";
import { validateFinancialIdentities } from "@calc/validation/financial-identities";
import { DEFAULT_ROUNDING } from "@calc/shared/utils";
import type { MonthlyFinancials } from "@engine/types";

type GlobalsLike = { projectionYears?: number; [key: string]: unknown };
type PropertyLike = { id: number; name: string; [key: string]: unknown };

interface IdentityCheck {
  identity: string;
  formula: string;
  gaap_reference: string;
  expected: number;
  actual: number;
  variance: number;
  passed: boolean;
  severity: "critical" | "material" | "minor";
}

interface PropertyYearResult {
  propertyName: string;
  propertyId: number;
  years: Array<{
    year: number;
    opinion: "UNQUALIFIED" | "QUALIFIED" | "ADVERSE";
    checks: IdentityCheck[];
    all_passed: boolean;
  }>;
}

const IDENTITY_COLUMNS = [
  { key: "Balance Sheet Equation", short: "A = L + E", ref: "ASC 210" },
  { key: "Indirect Method Operating Cash Flow", short: "OCF", ref: "ASC 230" },
  { key: "Net Income Derivation", short: "NI Deriv.", ref: "ASC 220" },
  { key: "Financing Cash Flow Composition", short: "CFF", ref: "ASC 230-15" },
  { key: "Cash Reconciliation", short: "Cash Rec.", ref: "ASC 230-24" },
];

function buildIdentityResults(
  properties: PropertyLike[],
  globalAssumptions: GlobalsLike
): PropertyYearResult[] {
  const projYears = globalAssumptions?.projectionYears ?? 10;
  const projMonths = projYears * MONTHS_PER_YEAR;

  return properties.map((prop) => {
    const financials = generatePropertyProForma(prop as never, globalAssumptions as never, projMonths);
    const years: PropertyYearResult["years"] = [];

    for (let y = 0; y < projYears; y++) {
      const startIdx = y * MONTHS_PER_YEAR;
      const endIdx = Math.min(startIdx + 12, financials.length);
      const yearMonths = financials.slice(startIdx, endIdx);
      if (yearMonths.length === 0) continue;

      const yearEnd = yearMonths[yearMonths.length - 1];
      const sum = (fn: (m: MonthlyFinancials) => number) => yearMonths.reduce((s, m) => s + fn(m), 0);

      const result = validateFinancialIdentities({
        period_label: `Year ${y + 1}`,
        balance_sheet: {
          total_assets: yearEnd.propertyValue + yearEnd.endingCash,
          total_liabilities: yearEnd.debtOutstanding,
          total_equity: yearEnd.propertyValue + yearEnd.endingCash - yearEnd.debtOutstanding,
        },
        income_statement: {
          noi: sum((m) => m.noi),
          anoi: sum((m) => m.anoi),
          interest_expense: sum((m) => m.interestExpense),
          depreciation: sum((m) => m.depreciationExpense),
          income_tax: sum((m) => m.incomeTax),
          net_income: sum((m) => m.netIncome),
        },
        cash_flow_statement: {
          operating_cash_flow: sum((m) => m.operatingCashFlow),
          financing_cash_flow: sum((m) => m.financingCashFlow),
          ending_cash: yearEnd.endingCash,
          principal_payment: sum((m) => m.principalPayment),
          refinancing_proceeds: sum((m) => m.refinancingProceeds),
        },
        rounding_policy: DEFAULT_ROUNDING,
      });

      years.push({
        year: y + 1,
        opinion: result.opinion,
        checks: result.checks,
        all_passed: result.all_passed,
      });
    }

    return {
      propertyName: prop.name || `Property ${prop.id}`,
      propertyId: prop.id,
      years,
    };
  });
}

function CellStatus({ check }: { check?: IdentityCheck }) {
  if (!check) return <span className="text-muted-foreground text-[10px]">—</span>;

  return (
    <div className="group relative flex items-center justify-center">
      {check.passed ? (
        <CheckCircle2 className="w-4 h-4 text-primary" />
      ) : (
        <XCircle className="w-4 h-4 text-destructive" />
      )}
      {/* Hover tooltip */}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-50 min-w-[200px]">
        <div className="bg-popover text-popover-foreground border border-border rounded-lg shadow-xl p-3 text-xs space-y-1">
          <div className="font-bold">{check.identity}</div>
          <div className="text-[10px] text-muted-foreground">{check.formula}</div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 mt-1">
            <span className="text-muted-foreground">Expected:</span>
            <span className="font-mono">${check.expected.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            <span className="text-muted-foreground">Actual:</span>
            <span className="font-mono">${check.actual.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            <span className="text-muted-foreground">Variance:</span>
            <span className={`font-mono ${check.variance !== 0 ? "text-destructive" : ""}`}>
              ${check.variance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div className="text-[10px] text-muted-foreground mt-1">{check.gaap_reference} • {check.severity}</div>
        </div>
      </div>
    </div>
  );
}

function PropertyRow({ result }: { result: PropertyYearResult }) {
  const [expanded, setExpanded] = useState(false);
  const allPassed = result.years.every((y) => y.all_passed);
  const opinion = result.years.some((y) => y.opinion === "ADVERSE")
    ? "ADVERSE"
    : result.years.some((y) => y.opinion === "QUALIFIED")
    ? "QUALIFIED"
    : "UNQUALIFIED";

  return (
    <div className="border border-border/60 rounded-lg overflow-hidden">
      <Button
        variant="ghost"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 h-auto text-left justify-start hover:bg-muted/30 rounded-none font-normal"
      >
        {allPassed ? (
          <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
        ) : (
          <XCircle className="w-4 h-4 text-destructive shrink-0" />
        )}
        <span className="text-sm font-bold text-foreground flex-1 truncate">
          {result.propertyName}
        </span>
        <span
          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
            opinion === "UNQUALIFIED"
              ? "bg-primary/10 text-primary"
              : opinion === "QUALIFIED"
              ? "bg-accent-pop/10 text-accent-pop"
              : "bg-destructive/10 text-destructive"
          }`}
        >
          {opinion}
        </span>
        <span className="text-[11px] text-muted-foreground font-mono">
          {result.years.length} yrs
        </span>
        <ChevronDown
          className={`w-4 h-4 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </Button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-border/40 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/30">
                    <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Year
                    </th>
                    {IDENTITY_COLUMNS.map((col) => (
                      <th
                        key={col.key}
                        className="px-3 py-2 text-center text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
                        title={`${col.key} (${col.ref})`}
                      >
                        {col.short}
                      </th>
                    ))}
                    <th className="px-3 py-2 text-center text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Opinion
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {result.years.map((yr) => (
                    <tr key={yr.year} className="border-t border-border/20 hover:bg-muted/10">
                      <td className="px-3 py-2 font-mono font-bold text-foreground">
                        Y{yr.year}
                      </td>
                      {IDENTITY_COLUMNS.map((col) => {
                        const check = yr.checks.find((c) => c.identity === col.key);
                        return (
                          <td key={col.key} className="px-3 py-2 text-center">
                            <CellStatus check={check} />
                          </td>
                        );
                      })}
                      <td className="px-3 py-2 text-center">
                        <span
                          className={`text-[10px] font-bold ${
                            yr.opinion === "UNQUALIFIED"
                              ? "text-primary"
                              : yr.opinion === "QUALIFIED"
                              ? "text-accent-pop"
                              : "text-destructive"
                          }`}
                        >
                          {yr.opinion === "UNQUALIFIED" ? "CLEAN" : yr.opinion}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function IdentityDashboard({
  properties,
  globalAssumptions,
}: {
  properties: PropertyLike[] | null;
  globalAssumptions: GlobalsLike | null;
}) {
  const [results, setResults] = useState<PropertyYearResult[] | null>(null);
  const [loading, setLoading] = useState(false);

  const handleRun = useCallback(() => {
    if (!properties?.length || !globalAssumptions) return;
    setLoading(true);
    // Run in a microtask to allow UI to update
    setTimeout(() => {
      try {
        const r = buildIdentityResults(properties, globalAssumptions);
        setResults(r);
      } finally {
        setLoading(false);
      }
    }, 0);
  }, [properties, globalAssumptions]);

  const summary = useMemo(() => {
    if (!results) return null;
    const totalProperties = results.length;
    const totalYears = results.reduce((s, r) => s + r.years.length, 0);
    const totalChecks = results.reduce((s, r) => s + r.years.reduce((s2, y) => s2 + y.checks.length, 0), 0);
    const totalPassed = results.reduce((s, r) => s + r.years.reduce((s2, y) => s2 + y.checks.filter((c) => c.passed).length, 0), 0);
    const allClean = results.every((r) => r.years.every((y) => y.all_passed));
    return { totalProperties, totalYears, totalChecks, totalPassed, totalFailed: totalChecks - totalPassed, allClean };
  }, [results]);

  if (!properties?.length) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        No properties available. Add properties to run identity validation.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Scale className="w-5 h-5 text-primary" />
          <div>
            <h3 className="text-sm font-bold text-foreground">Financial Identity Dashboard</h3>
            <p className="text-[11px] text-muted-foreground">
              5 GAAP identities validated per property per year
            </p>
          </div>
        </div>
        <Button
          onClick={handleRun}
          disabled={loading}
          size="sm"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin text-accent-pop mr-1.5" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
          {loading ? "Validating..." : "Run Identities"}
        </Button>
      </div>

      {/* Summary */}
      {summary && (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className={`rounded-xl p-4 border ${
            summary.allClean
              ? "bg-primary/5 border-primary/20"
              : "bg-destructive/5 border-destructive/20"
          }`}
        >
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
            <div>
              <div className="text-lg font-bold font-display text-foreground">{summary.totalProperties}</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">Properties</div>
            </div>
            <div>
              <div className="text-lg font-bold font-display text-foreground">{summary.totalYears}</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">Prop-Years</div>
            </div>
            <div>
              <div className="text-lg font-bold font-display text-foreground">{summary.totalChecks}</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">Checks</div>
            </div>
            <div>
              <div className="text-lg font-bold font-display text-primary">{summary.totalPassed}</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">Passed</div>
            </div>
            <div>
              <div className={`text-lg font-bold font-display ${summary.totalFailed > 0 ? "text-destructive" : "text-primary"}`}>
                {summary.totalFailed}
              </div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">Failed</div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Property Accordions */}
      {results && (
        <div className="space-y-2">
          {results.map((r, i) => (
            <motion.div
              key={r.propertyId}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <PropertyRow result={r} />
            </motion.div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!results && !loading && (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground space-y-3">
          <Scale className="w-10 h-10 opacity-20" />
          <p className="text-sm">Click "Run Identities" to validate all properties</p>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-12 space-y-3">
          <Loader2 className="w-8 h-8 text-accent-pop animate-spin" />
          <p className="text-sm text-muted-foreground animate-pulse">Validating identities across all properties...</p>
        </div>
      )}
    </div>
  );
}
