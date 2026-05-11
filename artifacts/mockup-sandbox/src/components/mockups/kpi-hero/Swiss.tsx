import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import { KPIS, type KpiDatum } from "./_data";

function Card({ k, isLast }: { k: KpiDatum; isLast: boolean }) {
  const isPositiveTrend =
    k.deltaVsY1Pct !== null &&
    ((k.positiveDirection === "up" && k.deltaVsY1Pct > 0) ||
      (k.positiveDirection === "down" && k.deltaVsY1Pct < 0));
  const Arrow =
    k.deltaVsY1Pct !== null && k.deltaVsY1Pct < 0
      ? ArrowDownRight
      : ArrowUpRight;
  const multiple =
    k.deltaVsY1Pct !== null
      ? `${(Math.abs(k.value) / Math.abs(k.spark[0]) || 0).toFixed(1)}×`
      : "—";

  return (
    <div
      className={`flex flex-col justify-between p-6 ${
        isLast ? "" : "border-r border-neutral-200"
      }`}
      style={{ minHeight: 220 }}
    >
      <div>
        <div className="flex items-center gap-2">
          <div
            className="h-1.5 w-6"
            style={{ backgroundColor: "#6B7843" }}
          />
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
            {k.label}
          </div>
        </div>
        <div className="mt-1 text-[10px] text-neutral-400">{k.sublabel}</div>
      </div>

      <div className="my-3">
        <div
          className="font-medium tabular-nums tracking-tight text-neutral-900"
          style={{
            fontFamily:
              "'IBM Plex Sans', Inter, ui-sans-serif, system-ui",
            fontSize: "36px",
            lineHeight: 1.05,
            letterSpacing: "-0.02em",
          }}
        >
          {k.formatted}
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-neutral-200 pt-3">
        <div className="flex items-center gap-1 text-xs text-neutral-600">
          <Arrow
            className={`h-3.5 w-3.5 ${
              isPositiveTrend ? "text-emerald-700" : "text-rose-700"
            }`}
          />
          <span
            className={`font-mono tabular-nums ${
              isPositiveTrend ? "text-emerald-700" : "text-rose-700"
            }`}
            style={{
              fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            }}
          >
            {multiple}
          </span>
          <span className="text-neutral-400">vs Y1</span>
        </div>
        <div className="font-mono text-[10px] text-neutral-400 tabular-nums">
          5Y
        </div>
      </div>
    </div>
  );
}

export function Swiss() {
  return (
    <div
      className="min-h-screen w-full bg-[#FAFAF7] p-6"
      style={{
        fontFamily: "'IBM Plex Sans', Inter, ui-sans-serif, system-ui",
      }}
    >
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap"
      />
      <div className="mx-auto max-w-[1180px] border border-neutral-200 bg-white">
        <div className="grid grid-cols-4">
          {KPIS.map((k, i) => (
            <Card key={k.key} k={k} isLast={i === KPIS.length - 1} />
          ))}
        </div>
      </div>
    </div>
  );
}
