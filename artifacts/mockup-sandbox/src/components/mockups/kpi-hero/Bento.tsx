import {
  DollarSign,
  Wallet,
  Receipt,
  Building2,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { KPIS, type KpiDatum } from "./_data";

const ICONS = {
  revenue: DollarSign,
  netIncome: Wallet,
  expenses: Receipt,
  properties: Building2,
} as const;

const CHIP = {
  revenue: "bg-emerald-100 text-emerald-700",
  netIncome: "bg-rose-100 text-rose-700",
  expenses: "bg-amber-100 text-amber-700",
  properties: "bg-indigo-100 text-indigo-700",
} as const;

const BAR = {
  revenue: "bg-emerald-500",
  netIncome: "bg-rose-500",
  expenses: "bg-amber-500",
  properties: "bg-indigo-500",
} as const;

function MiniBars({ values, color }: { values: number[]; color: string }) {
  const abs = values.map((v) => Math.abs(v));
  const max = Math.max(...abs) || 1;
  return (
    <div className="flex h-12 items-end gap-1.5">
      {values.map((v, i) => {
        const heightPct = (Math.abs(v) / max) * 100;
        const isLast = i === values.length - 1;
        return (
          <div key={i} className="flex flex-1 flex-col items-center gap-1">
            <div
              className={`w-full rounded-t-[3px] ${color} ${
                isLast ? "opacity-100" : "opacity-40"
              }`}
              style={{ height: `${Math.max(heightPct, 6)}%` }}
            />
            <span className="text-[9px] text-neutral-400">Y{i + 1}</span>
          </div>
        );
      })}
    </div>
  );
}

function Card({ k }: { k: KpiDatum }) {
  const Icon = ICONS[k.key];
  const chip = CHIP[k.key];
  const bar = BAR[k.key];
  const isPositiveTrend =
    k.deltaVsY1Pct !== null &&
    ((k.positiveDirection === "up" && k.deltaVsY1Pct > 0) ||
      (k.positiveDirection === "down" && k.deltaVsY1Pct < 0));
  const TrendIcon =
    k.deltaVsY1Pct !== null && k.deltaVsY1Pct < 0 ? TrendingDown : TrendingUp;

  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-neutral-200/80 transition hover:ring-neutral-300">
      <div className="flex items-start justify-between">
        <div className={`flex items-center gap-2 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${chip}`}>
          <Icon className="h-3 w-3" />
          {k.label}
        </div>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <div
          className="font-bold tabular-nums tracking-tight text-neutral-900"
          style={{ fontSize: "28px", lineHeight: 1 }}
        >
          {k.formatted}
        </div>
        {k.deltaVsY1Pct !== null && (
          <div
            className={`flex items-center gap-0.5 text-xs font-medium ${
              isPositiveTrend ? "text-emerald-600" : "text-rose-600"
            }`}
          >
            <TrendIcon className="h-3 w-3" />
            {Math.abs(k.deltaVsY1Pct).toFixed(0)}%
          </div>
        )}
      </div>
      <div className="mt-1 text-[11px] text-neutral-400">{k.sublabel}</div>
      <div className="mt-3 border-t border-dashed border-neutral-200 pt-3">
        <MiniBars values={k.spark} color={bar} />
      </div>
    </div>
  );
}

export function Bento() {
  return (
    <div
      className="min-h-screen w-full bg-gradient-to-br from-neutral-100 to-neutral-50 p-6"
      style={{ fontFamily: "Inter, ui-sans-serif, system-ui" }}
    >
      <div className="mx-auto grid max-w-[1180px] grid-cols-4 gap-3">
        {KPIS.map((k) => (
          <Card key={k.key} k={k} />
        ))}
      </div>
    </div>
  );
}
