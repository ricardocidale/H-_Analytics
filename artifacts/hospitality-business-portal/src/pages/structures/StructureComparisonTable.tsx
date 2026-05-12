import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { IconCompare } from "@/components/icons";
import type { StructureMetrics } from "@calc/analysis/structure-comparison";
import type { OperatingStructureId } from "@shared/constants-operating-structures";
import { RISK_BADGE, fmtIrr, fmtMoney, fmtMoic } from "./structure-comparison-utils";

interface StructureComparisonTableProps {
  structures: StructureMetrics[];
  recommendation: OperatingStructureId;
}

function ComparisonRow({
  label,
  structures,
  render,
  testIdPrefix,
  highlight,
}: {
  label: string;
  structures: StructureMetrics[];
  render: (s: StructureMetrics) => string;
  testIdPrefix: string;
  highlight?: boolean;
}) {
  return (
    <tr className={highlight ? "bg-muted/30" : ""}>
      <td className="py-2 pr-3 font-medium text-muted-foreground sticky left-0 bg-card">{label}</td>
      {structures.map((s) => (
        <td
          key={s.id}
          className="text-right py-2 px-3 tabular-nums"
          data-testid={`${testIdPrefix}-${s.id}`}
        >
          {render(s)}
        </td>
      ))}
    </tr>
  );
}

export function StructureComparisonTable({ structures, recommendation }: StructureComparisonTableProps) {
  return (
    <>
      <Card data-testid="card-comparison-table">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <IconCompare className="w-4 h-4" /> Side-by-side metrics
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border/60">
                <th className="text-left py-2 pr-3 font-medium text-muted-foreground sticky left-0 bg-card">
                  Metric
                </th>
                {structures.map((s) => (
                  <th
                    key={s.id}
                    className="text-right py-2 px-3 font-medium"
                    data-testid={`header-structure-${s.id}`}
                  >
                    <div className="flex flex-col items-end">
                      <span>{s.shortLabel}</span>
                      {s.id === recommendation && (
                        <Badge variant="secondary" className="mt-1 text-[10px]">
                          Recommended
                        </Badge>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="[&_tr]:border-b [&_tr]:border-border/40">
              <ComparisonRow label="Avg GOP" structures={structures} render={(s) => fmtMoney(s.avgGop)} testIdPrefix="row-gop" />
              <ComparisonRow label="Avg EBITDA" structures={structures} render={(s) => fmtMoney(s.avgEbitda)} testIdPrefix="row-ebitda" />
              <ComparisonRow label="Avg NOI" structures={structures} render={(s) => fmtMoney(s.avgNoi)} testIdPrefix="row-noi" />
              <ComparisonRow label="Stabilized NOI" structures={structures} render={(s) => fmtMoney(s.stabilizedNoi)} testIdPrefix="row-stab-noi" />
              <ComparisonRow label="Exit Value" structures={structures} render={(s) => fmtMoney(s.exitValue)} testIdPrefix="row-exit-value" />
              <ComparisonRow label="Unlevered IRR" structures={structures} render={(s) => fmtIrr(s.unleveredIrr)} testIdPrefix="row-unlevered-irr" highlight />
              <ComparisonRow label="Levered IRR" structures={structures} render={(s) => fmtIrr(s.leveredIrr)} testIdPrefix="row-levered-irr" highlight />
              <ComparisonRow label="Equity Multiple" structures={structures} render={(s) => fmtMoic(s.equityMultiple)} testIdPrefix="row-moic" />
              <ComparisonRow label="Peak Negative CF" structures={structures} render={(s) => fmtMoney(s.peakNegativeCashFlow)} testIdPrefix="row-peak-neg" />
              <ComparisonRow
                label="Year of First +CF"
                structures={structures}
                render={(s) => s.yearOfFirstPositiveCashFlow !== null ? `Yr ${s.yearOfFirstPositiveCashFlow}` : "Never"}
                testIdPrefix="row-first-positive"
              />
              <ComparisonRow label="Downside NOI" structures={structures} render={(s) => fmtMoney(s.downsideNoi)} testIdPrefix="row-downside" />
              <tr>
                <td className="py-2 pr-3 font-medium text-muted-foreground">Risk Tier</td>
                {structures.map((s) => (
                  <td key={s.id} className="text-right py-2 px-3" data-testid={`cell-risk-${s.id}`}>
                    <Badge className={RISK_BADGE[s.riskProfile]?.className}>
                      {RISK_BADGE[s.riskProfile]?.label}
                    </Badge>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card data-testid="card-key-terms">
        <CardHeader>
          <CardTitle className="text-base">Key contract terms</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {structures.map((s) => (
              <div
                key={s.id}
                className="rounded-md border border-border/50 p-3"
                data-testid={`terms-card-${s.id}`}
              >
                <p className="font-medium text-sm">{s.shortLabel}</p>
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground list-disc pl-4">
                  {s.keyTerms.map((t, i) => (
                    <li key={i} data-testid={`term-${s.id}-${i}`}>
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </>
  );
}
