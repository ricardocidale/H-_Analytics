import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus, Lightbulb, Clock } from "lucide-react";
import type {
  StatBlockData,
  CompareBlockData,
  TimelineBlockData,
  InsightBlockData,
  KpiBlockData,
  RichBlockData,
} from "./rich-block-parser";

interface BlockProps {
  locale?: string;
}

const LABELS: Record<string, Record<string, string>> = {
  en: { source: "Source", benchmark: "Benchmark", value: "Value", projected: "Projected", period: "Period", metric: "Metric", insight: "Insight", current: "Current", recommended: "Recommended", difference: "Difference" },
  es: { source: "Fuente", benchmark: "Referencia", value: "Valor", projected: "Proyectado", period: "Período", metric: "Métrica", insight: "Observación", current: "Actual", recommended: "Recomendado", difference: "Diferencia" },
};

function t(key: string, locale?: string): string {
  const lang = locale?.slice(0, 2) ?? "en";
  return LABELS[lang]?.[key] ?? LABELS.en[key] ?? key;
}

function deltaIcon(delta?: string) {
  if (!delta) return null;
  const lower = delta.toLowerCase();
  if (lower.includes("+") || lower.includes("up") || lower.includes("↑")) {
    return <TrendingUp className="w-3 h-3 text-emerald-500" />;
  }
  if (lower.includes("-") || lower.includes("down") || lower.includes("↓")) {
    return <TrendingDown className="w-3 h-3 text-red-400" />;
  }
  return <Minus className="w-3 h-3 text-muted-foreground" />;
}

function deltaColor(delta?: string): string {
  if (!delta) return "text-muted-foreground";
  const lower = delta.toLowerCase();
  if (lower.includes("+") || lower.includes("up") || lower.includes("↑")) return "text-emerald-500";
  if (lower.includes("-") || lower.includes("down") || lower.includes("↓")) return "text-red-400";
  return "text-muted-foreground";
}

export function StatBlock({ value, label, delta, source, locale }: StatBlockData & BlockProps) {
  return (
    <div
      className="my-2 rounded-lg border border-brand-navy/15 bg-gradient-to-br from-brand-navy/[0.04] to-transparent p-3"
      data-testid="rich-block-stat"
    >
      <div className="flex items-baseline gap-2">
        <span className="text-xl font-bold text-brand-navy dark:text-foreground font-['Poppins',sans-serif] tracking-tight">
          {value}
        </span>
        {delta && (
          <span className={cn("flex items-center gap-0.5 text-xs font-medium", deltaColor(delta))}>
            {deltaIcon(delta)}
            {delta}
          </span>
        )}
      </div>
      <p className="text-[11px] font-medium text-muted-foreground mt-0.5 uppercase tracking-wider">{label}</p>
      {source && (
        <p className="text-[10px] text-muted-foreground/60 mt-1 italic">{t("source", locale)}: {source}</p>
      )}
    </div>
  );
}

export function CompareBlock({ title, columns }: CompareBlockData & BlockProps) {
  const allMetrics = columns.length > 0 ? Object.keys(columns[0].rows) : [];

  return (
    <div className="my-2 rounded-lg border border-brand-teal/20 overflow-hidden" data-testid="rich-block-compare">
      {title && (
        <div className="px-3 py-1.5 bg-brand-navy/[0.06] border-b border-brand-teal/10">
          <p className="text-[11px] font-semibold text-brand-navy dark:text-foreground uppercase tracking-wider font-['Poppins',sans-serif]">
            {title}
          </p>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-border/30">
              <th className="px-3 py-1.5 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider"></th>
              {columns.map((col, i) => (
                <th
                  key={i}
                  className="px-3 py-1.5 text-right text-[10px] font-semibold text-brand-navy dark:text-foreground uppercase tracking-wider font-['Poppins',sans-serif]"
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allMetrics.map((metric, ri) => (
              <tr key={ri} className={cn("border-b border-border/10", ri % 2 === 0 ? "bg-muted/20" : "")}>
                <td className="px-3 py-1.5 text-left font-medium text-foreground/80 whitespace-nowrap">{metric}</td>
                {columns.map((col, ci) => (
                  <td key={ci} className="px-3 py-1.5 text-right text-foreground/90 whitespace-nowrap font-mono text-[11px]">
                    {col.rows[metric] ?? "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function TimelineBlock({ title, phases }: TimelineBlockData & BlockProps) {
  return (
    <div className="my-2 rounded-lg border border-brand-teal/15 bg-gradient-to-br from-brand-teal/[0.03] to-transparent p-3" data-testid="rich-block-timeline">
      {title && (
        <div className="flex items-center gap-1.5 mb-2">
          <Clock className="w-3 h-3 text-brand-teal" />
          <p className="text-[11px] font-semibold text-brand-navy dark:text-foreground uppercase tracking-wider font-['Poppins',sans-serif]">
            {title}
          </p>
        </div>
      )}
      <div className="relative pl-4">
        <div className="absolute left-[5px] top-1 bottom-1 w-px bg-brand-teal/30" />
        {phases.map((phase, i) => (
          <div key={i} className="relative pb-2.5 last:pb-0">
            <div className="absolute -left-[7px] top-[5px] w-2 h-2 rounded-full bg-brand-teal ring-2 ring-background" />
            <div className="ml-3">
              <p className="text-[12px] font-semibold text-foreground leading-tight">{phase.label}</p>
              {phase.date && (
                <p className="text-[10px] text-brand-teal font-medium mt-0.5">{phase.date}</p>
              )}
              {phase.detail && (
                <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{phase.detail}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function InsightBlock({ text, source, locale }: InsightBlockData & BlockProps) {
  return (
    <div
      className="my-2 rounded-lg border-l-[3px] border-l-brand-gold border border-brand-gold/20 bg-brand-gold/[0.04] px-3 py-2.5"
      data-testid="rich-block-insight"
    >
      <div className="flex gap-2">
        <Lightbulb className="w-3.5 h-3.5 text-brand-gold mt-0.5 shrink-0" />
        <div>
          <p className="text-[12px] text-foreground leading-relaxed">{text}</p>
          {source && (
            <p className="text-[10px] text-muted-foreground/60 mt-1 italic">— {t("source", locale)}: {source}</p>
          )}
        </div>
      </div>
    </div>
  );
}

export function KpiBlock({ title, metrics }: KpiBlockData & BlockProps) {
  return (
    <div className="my-2 rounded-lg border border-brand-navy/15 overflow-hidden" data-testid="rich-block-kpi">
      {title && (
        <div className="px-3 py-1.5 bg-brand-navy/[0.06] border-b border-brand-navy/10">
          <p className="text-[11px] font-semibold text-brand-navy dark:text-foreground uppercase tracking-wider font-['Poppins',sans-serif]">
            {title}
          </p>
        </div>
      )}
      <div className={cn(
        "grid gap-px bg-border/20",
        metrics.length === 1 ? "grid-cols-1" :
        metrics.length === 2 ? "grid-cols-2" :
        "grid-cols-3"
      )}>
        {metrics.map((m, i) => (
          <div key={i} className="bg-card px-3 py-2 text-center">
            <p className="text-sm font-bold text-brand-navy dark:text-foreground font-['Poppins',sans-serif] tracking-tight">
              {m.value}
            </p>
            {m.delta && (
              <span className={cn("flex items-center justify-center gap-0.5 text-[10px] font-medium mt-0.5", deltaColor(m.delta))}>
                {deltaIcon(m.delta)}
                {m.delta}
              </span>
            )}
            <p className="text-[9px] font-medium text-muted-foreground mt-0.5 uppercase tracking-wider">{m.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function RichBlock({ block, locale }: { block: RichBlockData; locale?: string }) {
  switch (block.type) {
    case "stat": return <StatBlock {...block} locale={locale} />;
    case "compare": return <CompareBlock {...block} locale={locale} />;
    case "timeline": return <TimelineBlock {...block} locale={locale} />;
    case "insight": return <InsightBlock {...block} locale={locale} />;
    case "kpi": return <KpiBlock {...block} locale={locale} />;
    default: return null;
  }
}
