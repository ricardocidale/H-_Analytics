/**
 * AnalystButton.tsx — The single, canonical "Analyst" CTA used across the app.
 *
 * Vocabulary rule (`.agents/skills/analyst-research-buttons/SKILL.md`):
 *   Label is always "Analyst" with `IconSparkles`. Per-context variant adds
 *   a suffix: e.g. "Analyst — Setup". Loading state shows OrbitalDots and
 *   the label "Studying…" (the canonical wait verb from the brand-voice
 *   approved list — see `.agents/skills/analyst-research-buttons/SKILL.md`).
 *   Pair this button with `<AnalystStudyingIndicator />` underneath to give
 *   the user a rotating, specific sub-line about what is being studied.
 *
 * Every Analyst trigger in the app must use this component so a single
 * design tweak (label, icon, animation, freshness dot styling) is a single-
 * file change. Do not roll your own button — extend this one.
 *
 * Sizes:
 *   • sm  — inline use (status bars, compact rows). h-7, w-3 sparkles.
 *   • md  — page headers and dialog footers (default). h-9, w-4 sparkles.
 *   • lg  — full-width primary CTA on research panels. h-12, w-5 sparkles.
 *
 * Optional features:
 *   • suffix              — appends "— {suffix}" to the label (per-tab use).
 *   • freshnessStatus     — paints a corner dot to communicate research age.
 *   • pulse               — adds the intelligence pulse animation to draw
 *                           attention when guidance is missing or stale.
 *   • disabled / disabledReason — disables and shows a tooltip explaining why.
 *   • cooldownRemainingMs — if > 0, clicks are swallowed and the tooltip
 *                           shows "Available again in Xs". The button is never
 *                           visually grayed out — it always stays full opacity.
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
  runningLabel?: string;
  cooldownRemainingMs?: number;
}

const SIZE_CONFIG: Record<AnalystButtonSize, { btn: string; icon: string; loader: number }> = {
  sm: { btn: "h-7 text-xs gap-1.5", icon: "w-3 h-3", loader: 12 },
  md: { btn: "h-9", icon: "w-4 h-4", loader: 18 },
  lg: { btn: "w-full h-12 text-base font-semibold shadow-lg shadow-primary/20", icon: "w-5 h-5", loader: 22 },
};

// Freshness dot uses fixed traffic-light colors regardless of theme so the
// status reads consistently in light, dark, and any custom theme:
//   green  → current, gold/yellow → stale, red → very_stale / missing.
const FRESHNESS_DOT: Partial<Record<Exclude<FreshnessStatus, null>, string>> = {
  current: "bg-green-500",
  stale: "bg-yellow-400",
  very_stale: "bg-red-500",
  missing: "bg-red-500",
};

function formatCooldown(ms: number): string {
  const s = Math.ceil(ms / 1000);
  if (s >= 60) {
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return rem === 0 ? `${m}m` : `${m}m ${rem}s`;
  }
  return `${s}s`;
}

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
  runningLabel = "Studying…",
  cooldownRemainingMs = 0,
}: AnalystButtonProps) {
  const cfg = SIZE_CONFIG[size];
  const onCooldown = cooldownRemainingMs > 0;
  const label = isRunning ? runningLabel : suffix ? `Analyst — ${suffix}` : "Analyst";

  // Clicks are swallowed while running or on cooldown — the button never
  // receives a `disabled` attribute for these states so it stays full opacity.
  const handleClick = () => {
    if (onCooldown || isRunning) return;
    onClick();
  };

  // Resolved tooltip: cooldown message > disabled reason > generic tooltip.
  const resolvedTooltip: React.ReactNode =
    disabled && disabledReason ? disabledReason :
    onCooldown ? `Available again in ${formatCooldown(cooldownRemainingMs)}` :
    tooltip;

  const button = (
    <Button
      variant={variant}
      onClick={handleClick}
      disabled={disabled}
      className={cn(
        cfg.btn,
        pulse && !isRunning && "animate-intelligence-pulse",
        isRunning && "hover:scale-100 active:scale-100",
        className,
      )}
      data-testid={dataTestId}
    >
      <span className="relative inline-flex items-center">
        {/* Sparkle is themed with the brand's intelligence accent (accent-pop,
            amber/gold) so it pops on dark default-variant buttons and reads
            as the canonical "AI / Analyst" cue. See
            .agents/skills/analyst-research-buttons/SKILL.md for the rule. */}
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

  if (resolvedTooltip) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          {disabled ? (
            <span
              tabIndex={0}
              aria-disabled="true"
              className={cn("inline-flex", size === "lg" && "w-full")}
            >
              {button}
            </span>
          ) : button}
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[280px] text-center">
          {resolvedTooltip}
        </TooltipContent>
      </Tooltip>
    );
  }

  return button;
}
