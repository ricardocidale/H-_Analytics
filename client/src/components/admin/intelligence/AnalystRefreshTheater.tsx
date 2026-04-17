/**
 * AnalystRefreshTheater.tsx — Full-screen overlay shown while a benchmark
 * refresh is in flight. Mirrors the look-and-feel of ResearchTheater (the
 * existing app pattern) but uses an Analyst-specific narration ticker so
 * the admin sees what The Analyst is "looking at" while they wait.
 *
 * The narration is rotated locally on a fixed cadence; once the server
 * returns, the parent component swaps this overlay for RefreshDiffDialog.
 */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

const DEFAULT_NARRATION = [
  "Pulling the latest SAFE Note benchmark databases…",
  "Cross-checking Carta, AngelList, and Crunchbase priced-round data…",
  "Reviewing recent YC and Techstars cohort raise sizes…",
  "Synthesizing valuation cap and discount-rate distributions…",
  "Compiling tranche-size and runway findings…",
  "Triangulating across at least three independent sources…",
];

interface Props {
  tableLabel: string;
  narration?: string[];
  onCancel: () => void;
}

export default function AnalystRefreshTheater({ tableLabel, narration, onCancel }: Props) {
  const lines = narration && narration.length > 0 ? narration : DEFAULT_NARRATION;
  const [idx, setIdx] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const tick = setInterval(() => setIdx(i => (i + 1) % lines.length), 2200);
    const timer = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => { clearInterval(tick); clearInterval(timer); };
  }, [lines.length]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-background/95 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Analyst refresh in progress"
      data-testid="analyst-refresh-theater"
    >
      <div className="max-w-xl w-full px-8 text-center">
        <div className="flex justify-center mb-6">
          <div className="relative">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
              <Loader2 className="w-10 h-10 text-primary animate-spin" />
            </div>
          </div>
        </div>
        <h2 className="text-2xl font-semibold mb-2">The Analyst is researching</h2>
        <p className="text-sm text-muted-foreground mb-6">{tableLabel}</p>
        <div className="min-h-[3rem] flex items-center justify-center" aria-live="polite">
          <p className="text-base text-foreground/90 transition-opacity duration-500" data-testid="text-narration">
            {lines[idx]}
          </p>
        </div>
        <div className="text-xs text-muted-foreground mt-4 mb-6" data-testid="text-elapsed">
          Elapsed: {elapsed}s
        </div>
        <Button variant="outline" size="sm" onClick={onCancel} data-testid="button-cancel-theater">
          Cancel
        </Button>
      </div>
    </div>
  );
}
