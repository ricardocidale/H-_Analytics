import { motion } from "framer-motion";
import { IconCheckCircle2, IconXCircle, IconAlertTriangle } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Server, Calculator, Shield, GitCompare, Scale, Sparkles, FlaskConical } from "@/components/icons/themed-icons";
import type { SuiteId, SuiteDefinition, SuiteRunResult } from "./types";

const SUITE_DEFINITIONS: SuiteDefinition[] = [
  {
    id: "independent-recheck",
    label: "Independent Recheck",
    description: "Server-side independent recalculation of all property pro-formas",
    estimatedTime: "~5s",
    runsOn: "server",
    icon: "server",
  },
  {
    id: "formula-identity",
    label: "Formula & Identity",
    description: "Validates math identities and GAAP formula correctness",
    estimatedTime: "~2s",
    runsOn: "client",
    icon: "calculator",
  },
  {
    id: "gaap-audit",
    label: "GAAP Audit",
    description: "Full 7-section GAAP compliance audit with workpaper",
    estimatedTime: "~3s",
    runsOn: "client",
    icon: "shield",
  },
  {
    id: "cross-validation",
    label: "Cross-Validation",
    description: "Compares client engine against IRS/GAAP authoritative formulas",
    estimatedTime: "~2s",
    runsOn: "client",
    icon: "gitcompare",
  },
  {
    id: "financial-identities",
    label: "Financial Identities",
    description: "Live A=L+E, OCF, NI, CFF, and cash reconciliation dashboard",
    estimatedTime: "~3s",
    runsOn: "client",
    icon: "scale",
  },
  {
    id: "golden-scenarios",
    label: "Golden Scenarios",
    description: "Hand-calculated reference tests across 18 scenario files with penny-exact precision",
    estimatedTime: "~5s",
    runsOn: "server",
    icon: "flask",
  },
  {
    id: "ai-narrative",
    label: "AI Narrative Review",
    description: "LLM-powered narrative analysis of verification results",
    estimatedTime: "~15s",
    runsOn: "server",
    icon: "sparkles",
  },
];

export { SUITE_DEFINITIONS };

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  server: Server,
  calculator: Calculator,
  shield: Shield,
  gitcompare: GitCompare,
  scale: Scale,
  flask: FlaskConical,
  sparkles: Sparkles,
};

interface SuiteSelectorProps {
  selected: Set<SuiteId>;
  onToggle: (id: SuiteId) => void;
  onSelectAll: () => void;
  lastResults?: Map<SuiteId, SuiteRunResult>;
  runningSuites?: Set<SuiteId>;
}

export function SuiteSelector({ selected, onToggle, onSelectAll, lastResults, runningSuites }: SuiteSelectorProps) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {SUITE_DEFINITIONS.map((suite, idx) => {
          const Icon = ICON_MAP[suite.icon] || Calculator;
          const isSelected = selected.has(suite.id);
          const isRunning = runningSuites?.has(suite.id);
          const lastResult = lastResults?.get(suite.id);

          return (
            <motion.button
              key={suite.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05, duration: 0.3 }}
              onClick={() => onToggle(suite.id)}
              data-testid={`suite-card-${suite.id}`}
              className={`relative text-left p-4 rounded-xl border transition-all group ${
                isSelected
                  ? "bg-primary/5 border-primary/30 shadow-sm"
                  : "bg-card border-border/60 hover:border-primary/20"
              } ${isRunning ? "animate-pulse" : ""}`}
            >
              {isRunning && (
                <div className="absolute inset-0 rounded-xl border-2 border-primary/40 animate-spin-slow pointer-events-none" style={{ borderTopColor: 'transparent', borderLeftColor: 'transparent' }} />
              )}

              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-lg ${isSelected ? "bg-primary/10" : "bg-muted"} transition-colors`}>
                  <Icon className={`w-4 h-4 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-bold text-foreground truncate">{suite.label}</h4>
                    {lastResult && (
                      <span className="shrink-0">
                        {lastResult.status === "PASS" ? (
                          <IconCheckCircle2 className="w-3.5 h-3.5 text-primary" />
                        ) : lastResult.status === "FAIL" ? (
                          <IconXCircle className="w-3.5 h-3.5 text-destructive" />
                        ) : (
                          <IconAlertTriangle className="w-3.5 h-3.5 text-accent-pop" />
                        )}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{suite.description}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-bold uppercase">
                      {suite.runsOn}
                    </span>
                    <span className="text-[10px] text-muted-foreground font-mono">{suite.estimatedTime}</span>
                  </div>
                </div>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                  isSelected ? "border-primary bg-primary" : "border-muted-foreground/30"
                }`}>
                  {isSelected && <div className="w-2 h-2 rounded-full bg-white" />}
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>

      <div className="flex items-center gap-3">
        <Button
          onClick={onSelectAll}
          variant="ghost"
          size="sm"
          data-testid="button-select-all-suites"
        >
          {selected.size === SUITE_DEFINITIONS.length ? "Deselect All" : "Select All"}
        </Button>
        <span className="text-xs text-muted-foreground">
          {selected.size} of {SUITE_DEFINITIONS.length} selected
        </span>
      </div>
    </div>
  );
}
