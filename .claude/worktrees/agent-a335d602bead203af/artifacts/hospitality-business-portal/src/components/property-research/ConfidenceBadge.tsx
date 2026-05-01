/**
 * ConfidenceBadge.tsx — Shows how a research recommendation compares to market.
 *
 * Displays a small colored pill indicating whether the AI's recommended
 * value is conservative, moderate, or aggressive relative to market data.
 */
import type { ComponentType } from "react";
import { cn } from "@/lib/utils";
import { Check } from "@/components/icons/themed-icons";
import { IconShield, IconAlertTriangle } from "@/components/icons";

type Confidence = "conservative" | "moderate" | "aggressive";

const CONFIDENCE_CONFIG: Record<Confidence, { label: string; icon: ComponentType<{ className?: string }>; className: string; title: string }> = {
  conservative: {
    label: "Conservative",
    icon: IconShield,
    className: "text-chart-1 bg-chart-1/10 border-chart-1/20",
    title: "Below market average — lower risk estimate",
  },
  moderate: {
    label: "Moderate",
    icon: Check,
    className: "text-primary bg-primary/10 border-primary/20",
    title: "In line with market averages",
  },
  aggressive: {
    label: "Aggressive",
    icon: IconAlertTriangle,
    className: "text-accent-pop bg-accent-pop/10 border-accent-pop/20",
    title: "Above market average — higher risk estimate",
  },
};

interface ConfidenceBadgeProps {
  confidence: string | undefined | null;
  className?: string;
}

export function ConfidenceBadge({ confidence, className }: ConfidenceBadgeProps) {
  if (!confidence) return null;
  const key = confidence.toLowerCase() as Confidence;
  const config = CONFIDENCE_CONFIG[key];
  if (!config) return null;

  const Icon = config.icon;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider rounded-md px-1.5 py-0.5 border",
        config.className,
        className
      )}
      title={config.title}
    >
      <Icon className="w-2.5 h-2.5" />
      {config.label}
    </span>
  );
}
