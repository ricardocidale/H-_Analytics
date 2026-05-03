/**
 * status-badge.tsx — Color-coded status indicator pill.
 *
 * Renders a small badge with text and background color matching the status:
 * active (green), inactive (gray), pending (amber), error (red), warning (orange).
 * Used on property cards to show lifecycle status (Operating, Planned, etc.).
 */
import { cn } from "@/lib/utils";

type StatusType = "active" | "inactive" | "pending" | "error" | "warning";

interface StatusBadgeProps {
  status: StatusType;
  label?: string;
  size?: "sm" | "md";
  pulse?: boolean;
  className?: string;
  "data-testid"?: string;
}

const dotColors: Record<StatusType, string> = {
  active: "bg-primary",
  inactive: "bg-muted-foreground",
  pending: "bg-accent-pop",
  error: "bg-destructive",
  warning: "bg-accent-pop",
};

const pulseColors: Record<StatusType, string> = {
  active: "bg-primary/80",
  inactive: "bg-muted",
  pending: "bg-accent-pop/80",
  error: "bg-destructive/80",
  warning: "bg-accent-pop/80",
};

const labelColors: Record<StatusType, string> = {
  active: "text-primary",
  inactive: "text-muted-foreground",
  pending: "text-accent-pop",
  error: "text-destructive",
  warning: "text-accent-pop",
};

export function StatusBadge({
  status,
  label,
  size = "md",
  pulse = false,
  className,
  "data-testid": testId = "status-badge",
}: StatusBadgeProps) {
  const dotSize = size === "sm" ? "w-1.5 h-1.5" : "w-2.5 h-2.5";
  const pulseSize = size === "sm" ? "w-1.5 h-1.5" : "w-2.5 h-2.5";
  const textSize = size === "sm" ? "text-[10px]" : "text-xs";

  return (
    <span
      className={cn("inline-flex items-center gap-1.5", className)}
      data-testid={testId}
    >
      <span className="relative flex">
        {pulse && (
          <span
            className={cn(
              "absolute inset-0 rounded-full animate-ping opacity-75",
              pulseColors[status],
              pulseSize
            )}
          />
        )}
        <span
          className={cn("rounded-full", dotColors[status], dotSize)}
          data-testid={`${testId}-dot`}
        />
      </span>
      {label && (
        <span
          className={cn("font-medium leading-none", textSize, labelColors[status])}
          data-testid={`${testId}-label`}
        >
          {label}
        </span>
      )}
    </span>
  );
}
