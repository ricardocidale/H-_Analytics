import {
  ArrowUpRight,
  ArrowDownRight,
  DollarSign,
  Wallet,
  Receipt,
  Building2,
} from "lucide-react";
import { KPIS, type KpiDatum } from "./_data";

const ICONS = {
  revenue: DollarSign,
  netIncome: Wallet,
  expenses: Receipt,
  properties: Building2,
} as const;

const GRADIENT = {
  revenue: "from-emerald-400 via-teal-400 to-cyan-400",
  netIncome: "from-rose-400 via-pink-400 to-fuchsia-400",
  expenses: "from-amber-400 via-orange-400 to-red-400",
  properties: "from-indigo-400 via-violet-400 to-purple-400",
} as const;

const GLOW = {
  revenue: "shadow-emerald-500/10",
  netIncome: "shadow-rose-500/10",
  expenses: "shadow-amber-500/10",
  properties: "shadow-indigo-500/10",
} as const;

function Card({ k }: { k: KpiDatum }) {
  const Icon = ICONS[k.key];
  const gradient = GRADIENT[k.key];
  const glow = GLOW[k.key];
  const isPositiveTrend =
    k.deltaVsY1Pct !== null &&
    ((k.positiveDirection === "up" && k.deltaVsY1Pct > 0) ||
      (k.positiveDirection === "down" && k.deltaVsY1Pct < 0));
  const Arrow =
    k.deltaVsY1Pct === null || k.deltaVsY1Pct >= 0
      ? ArrowUpRight
      : ArrowDownRight;

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-white/60 bg-white/70 p-5 backdrop-blur-xl shadow-xl ${glow}`}
    >
      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${gradient}`} />
      <div
        className={`absolute -right-12 -top-12 h-32 w-32 rounded-full bg-gradient-to-br ${gradient} opacity-15 blur-2xl`}
      />
      <div className="relative">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className={`grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br ${gradient} text-white shadow-lg`}
            >
              <Icon className="h-4 w-4" strokeWidth={2.25} />
            </div>
            <span className="text-xs font-medium text-neutral-600">
              {k.label}
            </span>
          </div>
          {k.deltaVsY1Pct !== null && (
            <div
              className={`flex items-center gap-0.5 text-xs font-semibold ${
                isPositiveTrend ? "text-emerald-600" : "text-rose-600"
              }`}
            >
              <Arrow className="h-3.5 w-3.5" />
              {Math.abs(k.deltaVsY1Pct).toFixed(0)}%
            </div>
          )}
        </div>
        <div
          className="mt-6 font-semibold tracking-tight text-neutral-900 tabular-nums"
          style={{
            fontFamily: "JetBrains Mono, ui-monospace, monospace",
            fontSize: "30px",
            lineHeight: 1.05,
          }}
        >
          {k.formatted}
        </div>
        <div className="mt-3 flex items-center justify-between text-[11px] text-neutral-500">
          <span>{k.sublabel}</span>
          <span className="font-medium tabular-nums">
            Y1 →{" "}
            {k.key === "properties"
              ? k.spark[0]
              : `${k.spark[0] < 0 ? "-" : ""}$${Math.abs(
                  k.spark[0] / 1000,
                ).toFixed(0)}K`}
          </span>
        </div>
      </div>
    </div>
  );
}

export function Glass() {
  return (
    <div
      className="relative min-h-screen w-full p-6"
      style={{
        fontFamily: "Inter, ui-sans-serif, system-ui",
        background:
          "radial-gradient(1200px 600px at 0% 0%, #e0f2fe 0%, transparent 60%), radial-gradient(800px 500px at 100% 100%, #fce7f3 0%, transparent 60%), linear-gradient(180deg, #fafafa, #f5f5f5)",
      }}
    >
      <div className="mx-auto grid max-w-[1180px] grid-cols-4 gap-4">
        {KPIS.map((k) => (
          <Card key={k.key} k={k} />
        ))}
      </div>
    </div>
  );
}
