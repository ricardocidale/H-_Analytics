import { IconSparkles } from "@/components/icons";
import { Button, type ButtonProps } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { ANALYST_BRAND } from "@/lib/agent-taxonomy";

type AnalystActionButtonVariant = "header" | "save-row" | "modal";

interface AnalystActionButtonProps {
  onClick: () => void;
  running?: boolean;
  cooldownRemainingMs?: number;
  variant?: AnalystActionButtonVariant;
  size?: ButtonProps["size"];
  className?: string;
  testIdSuffix?: string;
  label?: string;
  /**
   * Optional override for the idle-state tooltip. The label always remains
   * "Analyst" / "Studying…" per the canonical affordance contract — this
   * prop only changes the tooltip verb, so callers can disambiguate two
   * Analyst buttons living next to each other (e.g. manual refresh vs.
   * forced watchdog run on the same card).
   */
  tooltipText?: string;
}

function formatCooldown(ms: number): string {
  const s = Math.ceil(ms / 1000);
  if (s >= 60) {
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return rem === 0 ? `${m}m` : `${m}m ${rem}s`;
  }
  return `${s}s`;
}

export function AnalystActionButton({
  onClick,
  running = false,
  cooldownRemainingMs = 0,
  variant = "header",
  size,
  className,
  testIdSuffix,
  label = "Analyst",
  tooltipText: tooltipTextOverride,
}: AnalystActionButtonProps) {
  const onCooldown = cooldownRemainingMs > 0;
  const disabled = running || onCooldown;

  const resolvedSize: ButtonProps["size"] =
    size ?? (variant === "save-row" ? "default" : "sm");

  const buttonVariant: ButtonProps["variant"] =
    variant === "modal" ? "default" : "outline";

  const testId = testIdSuffix
    ? `button-analyst-${testIdSuffix}`
    : "button-analyst";

  const idleTooltip =
    tooltipTextOverride ??
    "Have the Analyst research this section and suggest ranges with sources.";
  const tooltipText = running
    ? `${ANALYST_BRAND} is studying…`
    : onCooldown
      ? `Available again in ${formatCooldown(cooldownRemainingMs)}`
      : idleTooltip;

  const displayLabel = running ? "Studying…" : label;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">
            <Button
              type="button"
              variant={buttonVariant}
              size={resolvedSize}
              onClick={onClick}
              disabled={disabled}
              aria-label={tooltipText}
              data-testid={testId}
              className={cn(
                "gap-1.5 font-medium",
                "border-amber-300/60 text-amber-700 hover:bg-amber-50 hover:text-amber-800",
                "dark:border-amber-500/40 dark:text-amber-300 dark:hover:bg-amber-950/40",
                variant === "modal" &&
                  "border-transparent bg-amber-500 text-white hover:bg-amber-600 dark:bg-amber-500 dark:text-white dark:hover:bg-amber-400",
                className,
              )}
            >
              <IconSparkles
                className={cn(
                  "h-4 w-4",
                  running && "animate-pulse",
                )}
                aria-hidden="true"
              />
              <span>{displayLabel}</span>
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" data-testid={`${testId}-tooltip`}>
          {tooltipText}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export type { AnalystActionButtonVariant, AnalystActionButtonProps };
