import { Button } from "@/components/ui/button";
import { IconBookOpen, IconRefreshCw, IconDollarSign } from "@/components/icons";
import { motion } from "framer-motion";

export const THEME = {
  primary: "hsl(var(--primary))",
  accent: "hsl(var(--chart-2))",
  tertiary: "hsl(var(--chart-3))",
  muted: "hsl(var(--chart-4))",
  fifth: "hsl(var(--chart-5))",
};

export const PIE_COLORS = ["hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))", "hsl(var(--accent-pop))"];

export const stagger = {
  container: { hidden: {}, visible: { transition: { staggerChildren: 0.07 } } },
  item: { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4 } } },
};

export function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card/95 backdrop-blur-xl border border-border rounded-lg px-3 py-2 shadow-xl">
      <p className="text-xs font-medium text-foreground mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} className="text-xs text-muted-foreground">
          <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: p.color }} />
          {p.name}: {typeof p.value === "number" ? p.value.toLocaleString() : p.value}
        </p>
      ))}
    </div>
  );
}

export function EmptyState({ title, description, onGenerate }: { title: string; description: string; onGenerate: () => void }) {
  return (
    <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="bg-card/80 backdrop-blur-xl rounded-xl border border-border p-12 text-center">
      <div className="w-16 h-16 mx-auto mb-4 rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center">
        <IconBookOpen className="w-8 h-8 text-primary" />
      </div>
      <h3 className="text-lg font-display text-foreground mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">{description}</p>
      <Button onClick={onGenerate} className="gap-2 shadow-lg shadow-primary/20 hover:scale-[1.03] active:scale-[0.97] transition-transform">
        <IconRefreshCw className="w-4 h-4" /> Consult
      </Button>
    </motion.div>
  );
}

export function MetricCard({ label, value, sub, icon: Icon, color = "primary" }: { label: string; value: string; sub?: string; icon: typeof IconDollarSign; color?: string }) {
  return (
    <motion.div variants={stagger.item} className="bg-card/80 backdrop-blur-xl rounded-xl border border-border p-4 hover:shadow-lg hover:shadow-primary/5 transition-shadow">
      <div className="flex items-start justify-between mb-2">
        <div className={`w-9 h-9 rounded-lg bg-${color}/10 flex items-center justify-center`}>
          <Icon className={`w-4.5 h-4.5 text-${color}`} />
        </div>
      </div>
      <p className="text-2xl font-bold font-display text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
      {sub && <p className="text-[10px] text-muted-foreground/70 mt-1">{sub}</p>}
    </motion.div>
  );
}

export function SectionTitle({ icon: Icon, title }: { icon: typeof IconDollarSign; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
        <Icon className="w-4 h-4 text-primary" />
      </div>
      <h3 className="text-sm font-semibold font-display text-foreground">{title}</h3>
    </div>
  );
}
