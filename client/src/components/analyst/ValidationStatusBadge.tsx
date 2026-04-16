import { cn } from "@/lib/utils";
import type { Property } from "@shared/schema";

type ValidationStatus = "pending_validation" | "validated" | "flagged" | "stale";

interface ValidationStatusBadgeProps {
  property: Pick<Property, "validationStatus" | "flaggedFieldCount">;
  size?: "sm" | "md";
  className?: string;
}

const statusConfig: Record<ValidationStatus, { label: (count: number) => string; classes: string; dot: string }> = {
  pending_validation: {
    label: () => "Awaiting The Analyst",
    classes: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
    dot: "bg-amber-500 animate-pulse",
  },
  validated: {
    label: () => "Validated by The Analyst",
    classes: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
    dot: "bg-emerald-500",
  },
  flagged: {
    label: (count) => `${count} field${count !== 1 ? "s" : ""} flagged`,
    classes: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20",
    dot: "bg-red-500",
  },
  stale: {
    label: () => "Research outdated",
    classes: "bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/20",
    dot: "bg-gray-400",
  },
};

export function ValidationStatusBadge({ property, size = "sm", className }: ValidationStatusBadgeProps) {
  const status = (property.validationStatus as ValidationStatus) || "pending_validation";
  const config = statusConfig[status] ?? statusConfig.pending_validation;
  const count = property.flaggedFieldCount ?? 0;

  return (
    <span
      data-testid={`badge-validation-${status}`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-medium",
        size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs",
        config.classes,
        className,
      )}
    >
      <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", config.dot)} />
      {config.label(count)}
    </span>
  );
}
