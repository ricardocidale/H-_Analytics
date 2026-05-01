/**
 * research-badge.tsx — Benchmark Range Label component.
 *
 * A small inline pill that appears next to assumption fields throughout the
 * portal. It displays a benchmark range value such as "55%-70%" representing
 * an AI-researched or market-sourced benchmark. Clicking the label auto-fills
 * the field with the recommended midpoint value.
 *
 * All benchmark labels use a consistent light yellow background regardless
 * of source type. The source context (e.g. "Industry", "Market") appears
 * only in the tooltip on hover, along with the date.
 *
 * Benchmark labels only appear after AI market research has been run for the
 * property or company. They are advisory only — the financial engine never
 * uses AI-generated values directly. Users must explicitly accept a
 * recommendation by clicking the label.
 */
import * as React from "react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export type BadgeSourceType = "market" | "industry" | "ai" | "seed";

interface ResearchEntry {
  display: string;
  mid: number;
  source?: string;
  sourceName?: string;
  sourceDate?: string;
}

export interface ResearchBadgeProps {
  value?: string | null | undefined;
  entry?: ResearchEntry | null | undefined;
  onClick?: () => void;
  sourceType?: BadgeSourceType;
  sourceName?: string;
  sourceDate?: string;
  variant?: "light" | "dark";
  className?: string;
  "data-testid"?: string;
}

const SOURCE_LABELS: Record<BadgeSourceType, string> = {
  market: "Market",
  industry: "Industry",
  ai: "AI Research",
  seed: "Research",
};

const BENCHMARK_STYLE = {
  light: "text-accent-pop hover:text-accent-pop bg-accent-pop/10 hover:bg-accent-pop/15 border border-accent-pop/20",
  dark: "text-accent-pop hover:text-accent-pop bg-accent-pop/10 hover:bg-accent-pop/20 border border-accent-pop/30",
};

function formatTooltip(sourceType: BadgeSourceType, sourceName?: string, sourceDate?: string): string {
  const parts: string[] = [];
  const label = SOURCE_LABELS[sourceType];
  if (sourceName) {
    parts.push(sourceName);
  } else if (label) {
    parts.push(label);
  }
  if (sourceDate) {
    try {
      const d = new Date(sourceDate);
      parts.push(`updated ${d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`);
    } catch (_error: unknown) {
      parts.push(`updated ${sourceDate}`);
    }
  }
  return parts.length > 0 ? parts.join(", ") : "";
}

function resolveSourceType(source?: string): BadgeSourceType {
  if (source === "market") return "market";
  if (source === "ai") return "ai";
  if (source === "seed") return "industry";
  return "seed";
}

const ResearchBadge = React.forwardRef<HTMLButtonElement, ResearchBadgeProps>(
  ({ value: valueProp, entry, onClick, sourceType: sourceTypeProp, sourceName: sourceNameProp, sourceDate: sourceDateProp, variant = "light", className, ...props }, ref) => {
    const value = valueProp ?? entry?.display ?? null;
    const sourceType = sourceTypeProp ?? (entry ? resolveSourceType(entry.source) : "seed");
    const sourceName = sourceNameProp ?? entry?.sourceName;
    const sourceDate = sourceDateProp ?? entry?.sourceDate;
    if (!value) return null;

    const isDark = variant === "dark";
    const colorClass = isDark ? BENCHMARK_STYLE.dark : BENCHMARK_STYLE.light;
    const tooltipText = formatTooltip(sourceType, sourceName, sourceDate);

    const button = (
      <button
        ref={ref}
        type="button"
        onClick={onClick}
        className={cn(
          "text-xs font-medium rounded-md px-1.5 py-0.5 transition-colors cursor-pointer",
          colorClass,
          className,
        )}
        data-testid={props["data-testid"] ?? "badge-research"}
      >
        {value}
      </button>
    );

    if (tooltipText) {
      return (
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              {button}
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs max-w-64">
              {tooltipText}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    return button;
  },
);

ResearchBadge.displayName = "ResearchBadge";

export { ResearchBadge };
