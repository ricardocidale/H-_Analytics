import * as React from "react";
import { ResearchBadgePopover } from "./ResearchBadgePopover";
import { cn } from "@/lib/utils";
import { Lock, AlertCircle } from "lucide-react";
import type { GuidanceContext } from "@/lib/panel-manager";
import type { ResearchBadgeProps } from "@/components/ui/research-badge";

type GuidanceState = "fresh" | "stale" | "pinned" | "none";

interface ResearchContextFieldLabelProps {
  label: string;
  htmlFor?: string;
  guidanceContext?: GuidanceContext;
  badgeProps?: ResearchBadgeProps;
  onApplyValue?: () => void;
  confidence?: "high" | "medium" | "low" | null;
  updatedAt?: string | null;
  isPinned?: boolean;
  className?: string;
  children?: React.ReactNode;
  "data-testid"?: string;
}

function ResearchContextFieldLabel({
  label,
  htmlFor,
  guidanceContext,
  badgeProps,
  onApplyValue,
  confidence,
  updatedAt,
  isPinned,
  className,
  children,
  ...props
}: ResearchContextFieldLabelProps) {
  const state = getState(updatedAt, isPinned, badgeProps);
  const freshnessInfo = updatedAt ? getFreshness(updatedAt) : null;

  return (
    <div className={cn("space-y-1.5", className)} data-testid={props["data-testid"] ?? `field-label-${guidanceContext?.assumptionKey ?? "unknown"}`}>
      <div className="flex items-center gap-2 flex-wrap">
        <label
          htmlFor={htmlFor}
          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
        >
          {label}
        </label>

        {state === "pinned" && (
          <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-blue-600 bg-blue-50 dark:bg-blue-500/10 dark:text-blue-400 px-1.5 py-0.5 rounded" data-testid="state-pinned">
            <Lock className="h-2.5 w-2.5" />
            Pinned
          </span>
        )}

        {state === "stale" && (
          <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-amber-600 bg-amber-50 dark:bg-amber-500/10 dark:text-amber-400 px-1.5 py-0.5 rounded" data-testid="state-stale">
            <AlertCircle className="h-2.5 w-2.5" />
            Stale
          </span>
        )}

        {confidence && (
          <span className={cn(
            "h-[6px] w-[6px] rounded-full shrink-0",
            confidence === "high" ? "bg-green-500" :
            confidence === "medium" ? "bg-amber-500" :
            "bg-red-400"
          )} data-testid="confidence-dot" title={`${confidence} confidence`} />
        )}

        {freshnessInfo && state !== "none" && (
          <span className={cn(
            "h-[6px] w-[6px] rounded-full shrink-0",
            freshnessInfo.dot
          )} data-testid="freshness-dot" title={freshnessInfo.label} />
        )}

        {badgeProps && (badgeProps.value || badgeProps.entry?.display) && (
          <ResearchBadgePopover
            {...badgeProps}
            guidanceContext={guidanceContext}
            onApplyValue={onApplyValue}
          />
        )}

        {state === "none" && !badgeProps?.value && !badgeProps?.entry?.display && (
          <span className="text-[10px] text-muted-foreground/50 italic" data-testid="state-no-research">
            No research
          </span>
        )}
      </div>

      {children}
    </div>
  );
}

function getState(updatedAt?: string | null, isPinned?: boolean, badgeProps?: ResearchBadgeProps): GuidanceState {
  if (isPinned) return "pinned";
  if (!badgeProps?.value && !badgeProps?.entry?.display) return "none";
  if (!updatedAt) return "fresh";
  const age = Date.now() - new Date(updatedAt).getTime();
  const staleMs = 7 * 24 * 60 * 60 * 1000;
  return age > staleMs ? "stale" : "fresh";
}

function getFreshness(updatedAt: string) {
  const age = Date.now() - new Date(updatedAt).getTime();
  const hours = age / (1000 * 60 * 60);
  if (hours < 24) return { label: "Fresh (<24h)", dot: "bg-green-500" };
  if (hours < 168) return { label: `${Math.floor(hours / 24)}d ago`, dot: "bg-amber-500" };
  return { label: `${Math.floor(hours / 24)}d old`, dot: "bg-red-400" };
}

ResearchContextFieldLabel.displayName = "ResearchContextFieldLabel";

export { ResearchContextFieldLabel };
export type { ResearchContextFieldLabelProps, GuidanceState };
