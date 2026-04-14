import { useMemo } from "react";
import { motion } from "framer-motion";
import { differenceInCalendarDays, parseISO, format } from "date-fns";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

import {
  IconRefreshCw,
  IconBookOpen,
  IconTrendingUp,
  IconTarget,
  IconBarChart2,
} from "@/components/icons";
import { useResearchStatus } from "@/lib/api/research";
import { useMarketResearch } from "@/lib/api/research";
import { useGlobalAssumptions } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Link } from "wouter";

interface ResearchPulseWidgetProps {
  className?: string;
}

type FreshnessLevel = "fresh" | "stale" | "missing";

interface StatusRow {
  label: string;
  type: string;
  freshness: FreshnessLevel;
  ageLabel: string;
}

function getFreshness(
  updatedAt: string | null | undefined,
  thresholdDays: number,
): { freshness: FreshnessLevel; ageLabel: string } {
  if (!updatedAt) {
    return { freshness: "missing", ageLabel: "Missing" };
  }

  const daysAgo = differenceInCalendarDays(new Date(), parseISO(updatedAt));

  if (daysAgo <= thresholdDays) {
    return {
      freshness: "fresh",
      ageLabel: daysAgo === 0 ? "Fresh (today)" : `Fresh (${daysAgo}d ago)`,
    };
  }

  return {
    freshness: "stale",
    ageLabel: `Stale (${daysAgo}d ago)`,
  };
}

const freshnessColors: Record<FreshnessLevel, string> = {
  fresh: "bg-primary",
  stale: "bg-accent-pop",
  missing: "bg-destructive",
};

const rowVariants = {
  hidden: { opacity: 0, x: -8 },
  visible: (i: number) => ({
    opacity: 1,
    x: 0,
    transition: { delay: i * 0.08, duration: 0.3, ease: "easeOut" as const },
  }),
};

const researchTypes = [
  { label: "Property Research", type: "property" },
  { label: "Operations", type: "operations" },
  { label: "Marketing", type: "marketing" },
  { label: "Industry", type: "industry" },
];

export function ResearchPulseWidget({ className }: ResearchPulseWidgetProps) {
  const { data: researchStatus } = useResearchStatus();
  const { data: globalResearch } = useMarketResearch("industry");
  const { data: globalAssumptions } = useGlobalAssumptions();

  const refreshIntervalDays = (globalAssumptions as Record<string, unknown> | undefined)?.researchRefreshIntervalDays as number ?? 7;

  const statusRows: StatusRow[] = useMemo(() => {
    return researchTypes.map((rt) => {
      const statusEntry = researchStatus?.types?.[rt.type];
      const updatedAt = statusEntry?.updatedAt ?? null;
      const { freshness, ageLabel } = getFreshness(updatedAt, refreshIntervalDays);
      return {
        label: rt.label,
        type: rt.type,
        freshness,
        ageLabel,
      };
    });
  }, [researchStatus, refreshIntervalDays]);

  const hasStale = statusRows.some((r) => r.freshness === "stale");

  // Key insights from the latest global/industry research
  const insights = useMemo(() => {
    const content = (globalResearch as Record<string, unknown> | undefined)?.content as Record<string, unknown> | undefined;
    return [
      {
        label: "ADR Trend",
        value: String(content?.adrTrend ?? "\u2014"),
        icon: IconTrendingUp,
      },
      {
        label: "Cap Rate",
        value: String(content?.capRate ?? "\u2014"),
        icon: IconTarget,
      },
      {
        label: "RevPAR",
        value: String(content?.revpar ?? "\u2014"),
        icon: IconBarChart2,
      },
    ];
  }, [globalResearch]);

  const todayStr = format(new Date(), "MMM d, yyyy");

  return (
    <Card
      className={cn(
        "bg-card border border-border rounded-xl shadow-sm overflow-hidden",
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
          <h3 className="font-display text-base font-semibold text-foreground">
            Research Pulse
          </h3>
        </div>
        <span className="label-text text-muted-foreground">{todayStr}</span>
      </div>

      {/* Status Rows */}
      <div className="px-5 space-y-2">
        {statusRows.map((row, i) => (
          <motion.div
            key={row.type}
            custom={i}
            variants={rowVariants}
            initial="hidden"
            animate="visible"
            className="flex items-center justify-between py-1.5"
          >
            <div className="flex items-center gap-2.5">
              <div
                className={cn(
                  "h-2 w-2 rounded-full shrink-0",
                  freshnessColors[row.freshness],
                )}
              />
              <span className="text-sm text-foreground">{row.label}</span>
            </div>
            <span
              className={cn(
                "text-xs font-medium",
                row.freshness === "fresh" && "text-primary dark:text-primary",
                row.freshness === "stale" && "text-accent-pop dark:text-accent-pop",
                row.freshness === "missing" && "text-destructive dark:text-destructive/80",
              )}
            >
              {row.ageLabel}
            </span>
          </motion.div>
        ))}
      </div>

      {/* Key Insights */}
      <div className="px-5 pt-4 pb-2">
        <p className="label-text text-muted-foreground font-medium mb-2 uppercase tracking-wide">
          Key Insights
        </p>
        <div className="grid grid-cols-3 gap-2">
          {insights.map((insight) => {
            const Icon = insight.icon;
            return (
              <div
                key={insight.label}
                className="rounded-lg bg-muted/50 border border-border p-2.5 text-center"
              >
                <Icon className="h-3.5 w-3.5 text-muted-foreground mx-auto mb-1" />
                <p className="label-text text-muted-foreground">{insight.label}</p>
                <p className="text-sm font-semibold text-foreground mt-0.5">
                  {insight.value}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 px-5 pt-3 pb-5">
        {hasStale && (
          <Button variant="outline" size="sm" className="flex-1 gap-1.5">
            <IconRefreshCw className="h-3.5 w-3.5" />
            Refresh Stale
          </Button>
        )}
        <Link href="/company/research" className="flex-1">
          <Button variant="ghost" size="sm" className="w-full gap-1.5">
            <IconBookOpen className="h-3.5 w-3.5" />
            View All Research
          </Button>
        </Link>
      </div>
    </Card>
  );
}
