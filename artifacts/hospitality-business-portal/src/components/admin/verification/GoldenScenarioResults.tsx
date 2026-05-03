import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ChevronDown, CheckCircle2, XCircle, FlaskConical, Clock } from "@/components/icons/themed-icons";

interface GoldenAssertion {
  title: string;
  status: "passed" | "failed";
  duration: number;
}

interface GoldenScenario {
  file: string;
  name: string;
  tests: number;
  passed: number;
  failed: number;
  duration: number;
  assertions: GoldenAssertion[];
}

export interface GoldenData {
  timestamp: string;
  totalFiles: number;
  totalTests: number;
  passed: number;
  failed: number;
  duration: number;
  scenarios: GoldenScenario[];
}

const SINGLE_CALCULATOR_FILES = [
  "irr-edge-cases.test.ts",
  "irr-golden-hand-calculated.test.ts",
  "dcf-npv.test.ts",
  "dscr-loan-sizing.test.ts",
  "depreciation-breakeven.test.ts",
  "stress-waterfall.test.ts",
  "equity-exit.test.ts",
  "proforma-edge-cases.test.ts",
];

function categorize(scenarios: GoldenScenario[]): { single: GoldenScenario[]; full: GoldenScenario[] } {
  const single: GoldenScenario[] = [];
  const full: GoldenScenario[] = [];
  for (const s of scenarios) {
    if (SINGLE_CALCULATOR_FILES.includes(s.file)) {
      single.push(s);
    } else {
      full.push(s);
    }
  }
  return { single, full };
}

function ScenarioAccordion({ scenario }: { scenario: GoldenScenario }) {
  const [open, setOpen] = useState(scenario.failed > 0);
  const allPassed = scenario.failed === 0;

  return (
    <div className="border border-border/60 rounded-lg overflow-hidden">
      <Button
        variant="ghost"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-4 py-3 h-auto text-left justify-start hover:bg-muted/30 rounded-none font-normal"
      >
        {allPassed ? (
          <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
        ) : (
          <XCircle className="w-4 h-4 text-destructive shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <span className="text-sm font-bold text-foreground truncate block">{scenario.name}</span>
          <span className="text-[11px] text-muted-foreground font-mono">{scenario.file}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-[11px] font-mono text-muted-foreground">
            {scenario.passed}/{scenario.tests}
          </span>
          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {scenario.duration}ms
          </span>
          <ChevronDown
            className={`w-4 h-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          />
        </div>
      </Button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-border/40 px-4 py-2 space-y-1 bg-muted/10">
              {scenario.assertions.map((a, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs ${
                    a.status === "failed" ? "bg-destructive/10" : ""
                  }`}
                >
                  {a.status === "passed" ? (
                    <CheckCircle2 className="w-3 h-3 text-primary shrink-0" />
                  ) : (
                    <XCircle className="w-3 h-3 text-destructive shrink-0" />
                  )}
                  <span className="flex-1 text-foreground truncate">{a.title}</span>
                  <span className="text-[10px] text-muted-foreground font-mono shrink-0">
                    {a.duration.toFixed(0)}ms
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function CategorySection({
  title,
  scenarios,
  delay,
}: {
  title: string;
  scenarios: GoldenScenario[];
  delay: number;
}) {
  if (scenarios.length === 0) return null;
  const totalTests = scenarios.reduce((s, f) => s + f.tests, 0);
  const totalPassed = scenarios.reduce((s, f) => s + f.passed, 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.3 }}
      className="space-y-2"
    >
      <div className="flex items-center gap-2">
        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</h4>
        <span className="text-[10px] font-mono text-muted-foreground">
          {totalPassed}/{totalTests} passed • {scenarios.length} files
        </span>
      </div>
      <div className="space-y-1.5">
        {scenarios.map((s) => (
          <ScenarioAccordion key={s.file} scenario={s} />
        ))}
      </div>
    </motion.div>
  );
}

export function GoldenScenarioResults({ data }: { data: GoldenData | null }) {
  if (!data || !data.scenarios?.length) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        No golden scenario results available. Run the suite to see results.
      </div>
    );
  }

  const { single, full } = categorize(data.scenarios);
  const passRate = data.totalTests > 0 ? ((data.passed / data.totalTests) * 100).toFixed(1) : "0";

  return (
    <div className="space-y-6">
      {/* Summary banner */}
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className={`rounded-xl p-4 border ${
          data.failed === 0
            ? "bg-primary/5 border-primary/20"
            : "bg-destructive/5 border-destructive/20"
        }`}
      >
        <div className="flex items-center gap-3">
          <FlaskConical className={`w-5 h-5 ${data.failed === 0 ? "text-primary" : "text-destructive"}`} />
          <div className="flex-1">
            <h3 className="text-sm font-bold text-foreground">
              Golden Scenarios — {data.failed === 0 ? "All Passed" : `${data.failed} Failed`}
            </h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {data.totalTests} tests across {data.totalFiles} files • {passRate}% pass rate • {data.duration}ms
            </p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold font-display text-foreground">{data.passed}</div>
            <div className="text-[10px] text-muted-foreground">of {data.totalTests}</div>
          </div>
        </div>
      </motion.div>

      {/* Category sections */}
      <CategorySection title="Single Calculator Tests" scenarios={single} delay={0.1} />
      <CategorySection title="Full Scenario Tests" scenarios={full} delay={0.2} />
    </div>
  );
}
