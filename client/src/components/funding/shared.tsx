import { formatMoney } from "@/lib/financialEngine";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { ContentPanel } from "@/components/ui/content-panel";
import { analyzeFundingNeeds } from "@/lib/financial/funding-predictor";

export function RunwayTooltip({ active, payload, label }: { active?: boolean; payload?: any[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-xl px-4 py-3 shadow-xl text-sm max-w-xs">
      <p className="font-semibold text-foreground mb-2 border-b pb-1">Month {label}</p>
      {payload.map((entry: any, i: number) => (
        <div key={i} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-muted-foreground">{entry.name}</span>
          </span>
          <span className="font-mono font-medium text-foreground">{formatMoney(entry.value)}</span>
        </div>
      ))}
    </div>
  );
}

export function StatRow({ label, value, muted }: { label: string; value: React.ReactNode; muted?: boolean }) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-border/40 last:border-b-0">
      <span className={`text-sm ${muted ? "text-muted-foreground/60" : "text-muted-foreground"}`}>{label}</span>
      <span className={`text-sm font-mono ${muted ? "text-muted-foreground/60" : "font-medium text-foreground"}`}>{value}</span>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function TrancheCard({ tranche, totalTranches }: { tranche: any; totalTranches: number }) {
  return (
    <ContentPanel data-testid={`card-tranche-${tranche.index}`}>
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
          <span className="text-sm font-bold text-primary">{tranche.index}</span>
        </div>
        <div>
          <h4 className="text-sm font-display text-foreground">Tranche {tranche.index}</h4>
          <p className="text-xs text-muted-foreground">Month {tranche.month}</p>
        </div>
      </div>

      <div className="space-y-2 mb-4">
        <div className="flex justify-between items-center">
          <span className="text-xs text-muted-foreground">Amount</span>
          <span className="text-sm font-mono font-semibold text-foreground" data-testid={`text-tranche-amount-${tranche.index}`}>
            {formatMoney(tranche.amount)}
          </span>
        </div>
        {tranche.valuationCap !== null && (
        <div className="flex justify-between items-center">
          <span className="text-xs text-muted-foreground">Valuation Cap</span>
          <span className="text-sm font-mono text-foreground" data-testid={`text-tranche-cap-${tranche.index}`}>
            {formatMoney(tranche.valuationCap)}
          </span>
        </div>
        )}
        {tranche.discountRate !== null && (
        <div className="flex justify-between items-center">
          <span className="text-xs text-muted-foreground">Discount Rate</span>
          <span className="text-sm font-mono text-foreground" data-testid={`text-tranche-discount-${tranche.index}`}>
            {(tranche.discountRate * 100).toFixed(1)}%
          </span>
        </div>
        )}
        <div className="flex justify-between items-center">
          <span className="text-xs text-muted-foreground">Date</span>
          <span className="text-sm text-foreground">
            {tranche.date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
          </span>
        </div>
      </div>

      <div className="pt-3 border-t border-border">
        <p className="text-xs text-muted-foreground/70 leading-relaxed" data-testid={`text-tranche-rationale-${tranche.index}`}>
          {tranche.rationale}
        </p>
      </div>
    </ContentPanel>
  );
}

export function CashRunwayChart({ chartData, analysis }: {
  chartData: { month: number; withFunding: number; withoutFunding: number }[];
  analysis: NonNullable<ReturnType<typeof analyzeFundingNeeds>>;
}) {
  return (
    <div className="h-[320px] sm:h-[360px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="gradWithFunding" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.3} />
              <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="gradWithout" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(var(--chart-4))" stopOpacity={0.2} />
              <stop offset="95%" stopColor="hsl(var(--chart-4))" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 11 }}
            className="text-muted-foreground"
            tickFormatter={(m: number) => `M${m}`}
          />
          <YAxis
            tick={{ fontSize: 11 }}
            className="text-muted-foreground"
            tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}K`}
          />
          <Tooltip content={<RunwayTooltip />} />
          <ReferenceLine y={0} stroke="hsl(var(--destructive))" strokeDasharray="4 4" strokeOpacity={0.6} />
          {analysis.breakevenMonth !== null && (
            <ReferenceLine
              x={analysis.breakevenMonth}
              stroke="hsl(var(--chart-2))"
              strokeDasharray="4 4"
              label={{ value: "Breakeven", position: "top", fill: "hsl(var(--chart-2))", fontSize: 11 }}
            />
          )}
          {analysis.tranches.map((t, i) => (
            <ReferenceLine
              key={i}
              x={t.month}
              stroke="hsl(var(--primary))"
              strokeDasharray="3 3"
              strokeOpacity={0.5}
              label={{ value: `T${t.index}`, position: "top", fill: "hsl(var(--primary))", fontSize: 10 }}
            />
          ))}
          <Area
            type="monotone"
            dataKey="withFunding"
            name="With Funding"
            stroke="hsl(var(--chart-1))"
            fill="url(#gradWithFunding)"
            strokeWidth={2}
          />
          <Area
            type="monotone"
            dataKey="withoutFunding"
            name="Without Funding"
            stroke="hsl(var(--chart-4))"
            fill="url(#gradWithout)"
            strokeWidth={1.5}
            strokeDasharray="4 4"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
