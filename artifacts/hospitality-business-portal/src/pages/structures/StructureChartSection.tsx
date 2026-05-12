import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CHART_COLORS, formatCompact } from "@/components/graphics";
import type { StructureMetrics } from "@calc/analysis/structure-comparison";
import type { OperatingStructureId } from "@shared/constants-operating-structures";

interface StructureChartSectionProps {
  structures: StructureMetrics[];
  recommendation: OperatingStructureId;
}

export function StructureChartSection({ structures, recommendation }: StructureChartSectionProps) {
  const irrChartData = useMemo(
    () =>
      structures.map((s) => ({
        name: s.shortLabel,
        "Unlevered IRR": s.unleveredIrr ? Number((s.unleveredIrr * 100).toFixed(2)) : 0,
        "Levered IRR": s.leveredIrr ? Number((s.leveredIrr * 100).toFixed(2)) : 0,
        isRecommended: s.id === recommendation,
      })),
    [structures, recommendation],
  );

  const revenueChartData = useMemo(
    () =>
      structures.map((s) => ({
        name: s.shortLabel,
        Operator: Math.max(0, s.revenueDistribution.operator),
        Brand: Math.max(0, s.revenueDistribution.brand),
        Lender: Math.max(0, s.revenueDistribution.lender),
        Sponsor: Math.max(0, s.revenueDistribution.sponsor),
        "Operating expenses": Math.max(0, s.revenueDistribution.operatingExpenses),
      })),
    [structures],
  );

  return (
    <>
      <Card data-testid="card-irr-chart">
        <CardHeader>
          <CardTitle className="text-base">IRR by structure</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={irrChartData}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={(v) => `${v}%`} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v: number) => `${v.toFixed(2)}%`} />
              <Legend />
              <Bar dataKey="Unlevered IRR" fill={CHART_COLORS.primary}>
                {irrChartData.map((entry, i) => (
                  <Cell
                    key={`u-${i}`}
                    fill={entry.isRecommended ? CHART_COLORS.accent : CHART_COLORS.primary}
                  />
                ))}
              </Bar>
              <Bar dataKey="Levered IRR" fill={CHART_COLORS.blue} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card data-testid="card-revenue-chart">
        <CardHeader>
          <CardTitle className="text-base">Where the revenue ends up (cumulative over hold)</CardTitle>
          <p className="text-xs text-muted-foreground pt-1">
            Each bar splits gross revenue into the four stakeholders that get paid — operator, brand,
            lender, sponsor — plus all other operating expenses.
          </p>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={revenueChartData}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={(v) => formatCompact(v)} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v: number) => formatCompact(v)} />
              <Legend />
              <Bar dataKey="Operating expenses" stackId="r" fill={CHART_COLORS.slate} />
              <Bar dataKey="Operator" stackId="r" fill={CHART_COLORS.primary} />
              <Bar dataKey="Brand" stackId="r" fill={CHART_COLORS.secondary} />
              <Bar dataKey="Lender" stackId="r" fill={CHART_COLORS.amber} />
              <Bar dataKey="Sponsor" stackId="r" fill={CHART_COLORS.teal} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </>
  );
}
