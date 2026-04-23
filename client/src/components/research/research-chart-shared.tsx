import { motion } from "framer-motion";
import { IconBookOpen } from "@/components/icons";
import { ProvenanceBadge } from "@/components/property-research/ProvenanceBadge";

export const COLORS = [
  "hsl(var(--primary))",
  "hsl(160, 60%, 45%)",
  "hsl(220, 70%, 55%)",
  "hsl(35, 90%, 55%)",
  "hsl(280, 55%, 55%)",
  "hsl(0, 65%, 55%)",
];

export const card = "bg-white/60 dark:bg-white/5 backdrop-blur-xl border border-primary/10 rounded-2xl shadow-lg";
export const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.08 } } };
export const fadeUp = { hidden: { opacity: 0, y: 18 }, visible: { opacity: 1, y: 0, transition: { duration: 0.45 } } };

type RechartsPayload = { name?: string; value?: number | string; color?: string };

export function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: RechartsPayload[]; label?: string | number }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white/90 dark:bg-card/90 backdrop-blur-xl rounded-xl border border-primary/15 shadow-xl px-4 py-2.5 text-xs">
      {label && <p className="font-display font-semibold mb-1 text-foreground">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }} className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          {p.name}: <span className="font-semibold">{typeof p.value === "number" ? p.value.toLocaleString() : p.value}</span>
        </p>
      ))}
    </div>
  );
}

export function MetricCard({ label, value, sub, delay = 0 }: { label: string; value: string | number; sub?: string; delay?: number }) {
  return (
    <motion.div variants={fadeUp} custom={delay} className={`${card} p-5`}>
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">{label}</p>
      <p className="text-2xl font-display font-bold text-foreground">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </motion.div>
  );
}

export function EmptySection({ message = "Generate research to see this section" }: { message?: string }) {
  return (
    <div className={`${card} p-12 text-center`}>
      <div className="w-14 h-14 mx-auto mb-4 rounded-xl bg-primary/10 flex items-center justify-center">
        <IconBookOpen className="w-7 h-7 text-primary/60" />
      </div>
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

export function CapRateGauge({ value, min, max }: { value: number; min: number; max: number }) {
  const pct = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const angle = -180 + pct * 180;
  const r = 80;
  const cx = 100;
  const cy = 95;
  const rad = (angle * Math.PI) / 180;
  const nx = cx + r * Math.cos(rad);
  const ny = cy + r * Math.sin(rad);
  return (
    <svg viewBox="0 0 200 120" className="w-full max-w-[260px] mx-auto">
      <path d="M 20 95 A 80 80 0 0 1 180 95" fill="none" stroke="hsl(var(--primary)/0.15)" strokeWidth="14" strokeLinecap="round" />
      <path d="M 20 95 A 80 80 0 0 1 180 95" fill="none" stroke="url(#gaugeGrad)" strokeWidth="14" strokeLinecap="round"
        strokeDasharray={`${pct * 251} 251`} />
      <circle cx={nx} cy={ny} r="7" fill="hsl(var(--primary))" stroke="white" strokeWidth="3" />
      <text x="100" y="88" textAnchor="middle" className="fill-foreground font-display text-2xl font-bold">{value.toFixed(1)}%</text>
      <text x="20" y="115" textAnchor="middle" className="fill-muted-foreground text-[10px]">{min}%</text>
      <text x="180" y="115" textAnchor="middle" className="fill-muted-foreground text-[10px]">{max}%</text>
      <defs>
        <linearGradient id="gaugeGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="hsl(160, 60%, 45%)" />
          <stop offset="100%" stopColor="hsl(var(--primary))" />
        </linearGradient>
      </defs>
    </svg>
  );
}

type BenchmarkContent = {
  _marketIntelligence?: { benchmarks?: Record<string, { value: number; source?: string }> };
  adrAnalysis?: { recommendedAdr?: number; revpar?: number } & Record<string, unknown>;
  occupancyAnalysis?: { stabilizedOccupancy?: number } & Record<string, unknown>;
  capRateAnalysis?: { recommendedCapRate?: number; capRate?: number } & Record<string, unknown>;
} & Record<string, unknown>;

export function BenchmarkBanner({ content, metrics }: { content: BenchmarkContent; metrics: { key: string; label: string; format: (v: number) => string }[] }) {
  const mi = content?._marketIntelligence;
  const benchmarks = mi?.benchmarks;

  const items = metrics.map((m) => {
    const apiVal = benchmarks?.[m.key];
    if (apiVal) {
      return { label: m.label, value: m.format(apiVal.value), provenance: "verified" as const, source: apiVal.source };
    }
    const llmVal = m.key === "adr" ? content?.adrAnalysis?.recommendedAdr
      : m.key === "occupancy" ? (content?.occupancyAnalysis?.stabilizedOccupancy ? content.occupancyAnalysis.stabilizedOccupancy / 100 : null)
      : m.key === "revpar" ? content?.adrAnalysis?.revpar
      : m.key === "capRate" ? (content?.capRateAnalysis?.recommendedCapRate ?? content?.capRateAnalysis?.capRate)
      : null;
    if (llmVal != null) {
      return { label: m.label, value: m.format(llmVal), provenance: "estimated" as const, source: "AI estimate" };
    }
    return null;
  }).filter(Boolean) as { label: string; value: string; provenance: "verified" | "estimated"; source: string }[];

  if (items.length === 0) return null;

  return (
    <motion.div variants={fadeUp} data-testid="benchmark-banner" className={`${card} p-4 mb-4`}>
      <div className="flex items-center gap-2 mb-3">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Market Benchmarks</h4>
        {items.some(i => i.provenance === "verified") && <ProvenanceBadge provenance="verified" />}
        {items.every(i => i.provenance === "estimated") && <ProvenanceBadge provenance="estimated" />}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {items.map((item) => (
          <div key={item.label} data-testid={`benchmark-${item.label.toLowerCase().replace(/\s+/g, "-")}`} className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="text-lg font-display font-bold text-foreground">{item.value}</span>
              <ProvenanceBadge provenance={item.provenance} className="scale-75" />
            </div>
            <span className="text-[10px] text-muted-foreground">{item.label}</span>
            <span className="text-[9px] text-muted-foreground/70">{item.source}</span>
          </div>
        ))}
      </div>
      {items.every(i => i.provenance === "estimated") && (
        <p className="text-[10px] text-muted-foreground mt-2 italic" data-testid="benchmark-estimated-note">
          These benchmarks are AI estimates. Connect CoStar, STR, or AirDNA for verified market data.
        </p>
      )}
    </motion.div>
  );
}
