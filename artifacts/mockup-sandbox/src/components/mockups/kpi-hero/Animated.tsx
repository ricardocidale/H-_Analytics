import { useEffect, useState } from "react";
import {
  TrendingUp,
  TrendingDown,
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

const ACCENT = {
  revenue: "text-emerald-600 bg-emerald-50",
  netIncome: "text-rose-600 bg-rose-50",
  expenses: "text-amber-700 bg-amber-50",
  properties: "text-sky-700 bg-sky-50",
} as const;

function useCountUp(target: number, durationMs = 900) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const from = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setV(from + (target - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);
  return v;
}

function formatCount(k: KpiDatum, current: number) {
  if (k.key === "properties") return Math.round(current).toString();
  const sign = current < 0 ? "-" : "";
  const abs = Math.abs(current);
  return `${sign}$${(abs / 1000).toFixed(1)}K`;
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const w = 120;
  const h = 28;
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - ((v - min) / span) * h;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline
        points={pts}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={color}
      />
      {values.map((v, i) => {
        const x = (i / (values.length - 1)) * w;
        const y = h - ((v - min) / span) * h;
        return (
          <circle
            key={i}
            cx={x}
            cy={y}
            r={i === values.length - 1 ? 2.5 : 1.5}
            className={color}
            fill="currentColor"
          />
        );
      })}
    </svg>
  );
}

function Card({ k }: { k: KpiDatum }) {
  const Icon = ICONS[k.key];
  const accent = ACCENT[k.key];
  const animated = useCountUp(k.value);
  const isPositiveTrend =
    k.deltaVsY1Pct !== null &&
    ((k.positiveDirection === "up" && k.deltaVsY1Pct > 0) ||
      (k.positiveDirection === "down" && k.deltaVsY1Pct < 0));
  const TrendIcon =
    k.deltaVsY1Pct === null
      ? TrendingUp
      : k.deltaVsY1Pct >= 0
      ? TrendingUp
      : TrendingDown;
  const sparkColor = isPositiveTrend ? "text-emerald-500" : "text-rose-500";
  return (
    <div className="flex flex-col justify-between rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div className={`grid h-9 w-9 place-items-center rounded-lg ${accent}`}>
          <Icon className="h-4.5 w-4.5" strokeWidth={2} />
        </div>
        {k.deltaVsY1Pct !== null && (
          <div
            className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
              isPositiveTrend
                ? "bg-emerald-50 text-emerald-700"
                : "bg-rose-50 text-rose-700"
            }`}
          >
            <TrendIcon className="h-3 w-3" />
            {Math.abs(k.deltaVsY1Pct).toFixed(0)}% vs Y1
          </div>
        )}
      </div>
      <div className="mt-4">
        <div className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">
          {k.label}
        </div>
        <div className="mt-1 font-semibold tabular-nums text-neutral-900 text-3xl tracking-tight">
          {formatCount(k, animated)}
        </div>
        <div className="text-xs text-neutral-400 mt-0.5">{k.sublabel}</div>
      </div>
      <div className="mt-3 flex items-end justify-between">
        <Sparkline values={k.spark} color={sparkColor} />
      </div>
    </div>
  );
}

export function Animated() {
  return (
    <div
      className="min-h-screen w-full bg-neutral-50 p-6"
      style={{ fontFamily: "Inter, ui-sans-serif, system-ui" }}
    >
      <div className="mx-auto grid max-w-[1180px] grid-cols-4 gap-4">
        {KPIS.map((k) => (
          <Card key={k.key} k={k} />
        ))}
      </div>
    </div>
  );
}
