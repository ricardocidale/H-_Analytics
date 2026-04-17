/**
 * AnalystButton.tsx — The single, canonical "Analyst" CTA used across the app.
 *
 * Vocabulary rule (`.claude/skills/vocabulary/SKILL.md` §2):
 *   Label is always "Analyst" with `IconSparkles`. Per-context variant adds
 *   a suffix: e.g. "Analyst — Setup". Loading state shows OrbitalDots and
 *   the label "Consulting...".
 *
 * Every Analyst trigger in the app must use this component so a single
 * design tweak (label, icon, animation, freshness dot styling) is a single-
 * file change. Do not roll your own button — extend this one.
 *
 * Sizes:
 *   • sm  — inline use (status bars, compact rows). h-7, w-3 sparkles.
 *   • md  — page headers and dialog footers (default). w-4 sparkles.
 *   • lg  — full-width primary CTA on research panels. h-12, w-5 sparkles.
 *
 * Optional features:
 *   • suffix              — appends "— {suffix}" to the label (per-tab use).
 *   • freshnessStatus     — paints a corner dot to communicate research age.
 *   • pulse               — adds the intelligence pulse animation to draw
 *                           attention when guidance is missing or stale.
 *   • disabled / disabledReason — disables and shows a tooltip explaining why.
 *   • tooltip             — generic tooltip on the button when not disabled.
 *   • dataTestId          — overrides the default test id.
 */
import { Button } from "@/components/ui/button";
import { OrbitalDots } from "@/components/ui/ai-loader";
import { IconSparkles } from "@/components/icons";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type AnalystButtonSize = "sm" | "md" | "lg";
export type FreshnessStatus = "current" | "stale" | "very_stale" | "missing" | "running" | null;

export interface AnalystButtonProps {
  onClick: () => void;
  isRunning?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  tooltip?: React.ReactNode;
  size?: AnalystButtonSize;
  variant?: "default" | "ghost" | "outline";
  suffix?: string;
  freshnessStatus?: FreshnessStatus;
  pulse?: boolean;
  className?: string;
  dataTestId?: string;
}

const SIZE_CONFIG: Record<AnalystButtonSize, { btn: string; icon: string; loader: number }> = {
  sm: { btn: "h-7 text-xs gap-1.5", icon: "w-3 h-3", loader: 12 },
  md: { btn: "", icon: "w-4 h-4", loader: 18 },
  lg: { btn: "w-full h-12 text-base font-semibold shadow-lg shadow-primary/20", icon: "w-5 h-5", loader: 22 },
};

const FRESHNESS_DOT: Partial<Record<Exclude<FreshnessStatus, null>, string>> = {
  current: "bg-primary",
  stale: "bg-accent-pop",
  very_stale: "bg-destructive",
  missing: "bg-destructive",
};

export function AnalystButton({
  onClick,
  isRunning = false,
  disabled = false,
  disabledReason,
  tooltip,
  size = "md",
  variant = "default",
  suffix,
  freshnessStatus = null,
  pulse = false,
  className,
  dataTestId = "button-analyst",
}: AnalystButtonProps) {
  const cfg = SIZE_CONFIG[size];
  const label = isRunning ? "Consulting..." : suffix ? `Analyst — ${suffix}` : "Analyst";

  const button = (
    <Button
      variant={variant}
      onClick={onClick}
      disabled={disabled || isRunning}
      className={cn(cfg.btn, pulse && !isRunning && "animate-intelligence-pulse", className)}
      data-testid={dataTestId}
    >
      <span className="relative inline-flex items-center">
        {/* Sparkle is themed with the brand's intelligence accent (accent-pop,
            amber/gold) so it pops on dark default-variant buttons and reads
            as the canonical "AI / Analyst" cue. See
            .claude/skills/ui/analyst-sparkle.md for the rule. */}
        {isRunning ? <OrbitalDots size={cfg.loader} /> : <IconSparkles className={cn(cfg.icon, "text-accent-pop")} />}
        {!isRunning && freshnessStatus && FRESHNESS_DOT[freshnessStatus] && (
          <span
            className={cn(
              "absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border-2 border-background",
              FRESHNESS_DOT[freshnessStatus],
            )}
            data-testid="indicator-research-freshness"
          />
        )}
      </span>
      {label}
    </Button>
  );

  if (disabled && disabledReason) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span>{button}</span>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[280px] text-center">
          {disabledReason}
        </TooltipContent>
      </Tooltip>
    );
  }

  if (tooltip) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[280px] text-center">
          {tooltip}
        </TooltipContent>
      </Tooltip>
    );
  }

  return button;
}
