import { useState } from "react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

interface MethodologyPanelProps {
  entityType: "property" | "company";
  entityName: string;
  research: {
    updatedAt?: string;
    modelId?: string;
    researchDate?: string;
    sources?: Array<{ url?: string; label?: string; name?: string }>;
    comparableCount?: number;
    relaxationTrail?: string[];
    starRating?: number;
    tierUsed?: number;
    [key: string]: unknown;
  } | null;
}

function formatDate(dateStr?: string) {
  if (!dateStr) return "N/A";
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

function StarDisplay({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <span
          key={i}
          className={cn(
            "text-sm",
            i <= rating ? "text-amber-500" : "text-muted-foreground/30"
          )}
        >
          ★
        </span>
      ))}
    </span>
  );
}

export default function MethodologyTransparencyPanel({ entityType, entityName, research }: MethodologyPanelProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (!research) return null;

  const sources = (research.sources ?? []).filter((s: { url?: string; label?: string; name?: string }) => s.url || s.label || s.name);
  const relaxation = research.relaxationTrail ?? [];
  const compCount = research.comparableCount ?? 0;

  const items = [
    { label: "Entity", value: `${entityType === "property" ? "Property" : "Company"}: ${entityName}` },
    { label: "Last Run", value: formatDate(research.updatedAt || research.researchDate) },
    { label: "Model", value: research.modelId ?? "Default" },
    ...(research.tierUsed ? [{ label: "Tier", value: `Tier ${research.tierUsed}` }] : []),
    ...(compCount > 0 ? [{ label: "Comparable Set", value: `${compCount} properties` }] : []),
    ...(research.starRating ? [{ label: "Quality", value: <StarDisplay rating={research.starRating} /> }] : []),
  ];

  return (
    <div
      className="rounded-xl border border-border/60 bg-card/50 backdrop-blur-sm overflow-hidden"
      data-testid="methodology-panel"
    >
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-muted/30 transition-colors"
        data-testid="button-toggle-methodology"
      >
        <div className="flex items-center gap-2">
          <span className="w-5 h-5 rounded-md bg-primary/10 flex items-center justify-center text-primary text-xs">i</span>
          <span className="text-xs font-medium text-foreground">Research Methodology</span>
          {research.starRating && (
            <StarDisplay rating={research.starRating} />
          )}
        </div>
        <motion.span
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="text-muted-foreground text-xs"
        >
          ▾
        </motion.span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-3 border-t border-border/40 pt-3">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
                {items.map((item, i) => (
                  <div key={i}>
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{item.label}</span>
                    <div className="text-xs text-foreground mt-0.5">{item.value}</div>
                  </div>
                ))}
              </div>

              {sources.length > 0 && (
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Sources ({sources.length})</span>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {sources.slice(0, 8).map((s: { url?: string; label?: string; name?: string }, i: number) => {
                      let displayLabel = s.label || s.name || "Source";
                      if (!displayLabel || displayLabel === "Source") {
                        try { displayLabel = new URL(s.url || "").hostname; } catch { /* keep fallback */ }
                      }
                      return (
                        <span
                          key={i}
                          className="inline-flex items-center px-2 py-0.5 rounded-md bg-muted/50 text-[10px] text-muted-foreground border border-border/40"
                          title={s.url}
                        >
                          {displayLabel}
                        </span>
                      );
                    })}
                    {sources.length > 8 && (
                      <span className="text-[10px] text-muted-foreground px-1">+{sources.length - 8} more</span>
                    )}
                  </div>
                </div>
              )}

              {relaxation.length > 0 && (
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Relaxation Trail</span>
                  <div className="mt-1 flex items-center gap-1 flex-wrap">
                    {relaxation.map((step, i) => (
                      <span key={i} className="flex items-center gap-1">
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20">{step}</span>
                        {i < relaxation.length - 1 && <span className="text-muted-foreground/40 text-[10px]">→</span>}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
