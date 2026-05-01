import * as React from "react";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/financialEngine";
import { Minus } from "@/components/icons/themed-icons";
import { IconTrendingUp, IconTrendingDown } from "@/components/icons";

export interface StatCardProps {
  label: string;
  value: string | number;
  sublabel?: string;
  icon?: React.ReactNode;
  format?: "money" | "percent" | "number" | "text";
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
  description?: string;
  variant?: "glass" | "light" | "sage" | "dashboard";
  className?: string;
  "data-testid"?: string;
}

function formatStatValue(value: string | number, format?: "money" | "percent" | "number" | "text"): string {
  if (typeof value === "string") return value;
  switch (format) {
    case "money":
      return formatMoney(value);
    case "percent":
      return `${value.toFixed(1)}%`;
    case "number":
      return value.toLocaleString("en-US");
    default:
      return String(value);
  }
}

function StatCard({
  label,
  value,
  sublabel,
  icon,
  format = "text",
  trend,
  trendValue,
  description,
  variant = "glass",
  className,
  ...props
}: StatCardProps) {
  if (variant === "dashboard") {
    return (
      <div
        className={cn(
          "bg-card/80 rounded-lg p-5 border border-primary/10 shadow-[0_2px_8px_rgba(var(--primary-rgb,159,188,164),0.08)] hover:shadow-[0_4px_16px_rgba(var(--primary-rgb,159,188,164),0.12)] transition-all duration-300 group",
          className
        )}
        data-testid={props["data-testid"]}
      >
        <div className="flex items-start justify-between mb-2">
          <p className="text-sm font-medium text-muted-foreground label-text">
            {label}
          </p>
          {trend && trendValue && (
            <span className={cn(
              "inline-flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded-md",
              trend === "up" && "text-primary bg-primary/10",
              trend === "down" && "text-destructive bg-destructive/10",
              trend === "neutral" && "text-muted-foreground/40 bg-muted"
            )}>
              {trend === "up" && <IconTrendingUp className="w-3 h-3" />}
              {trend === "down" && <IconTrendingDown className="w-3 h-3" />}
              {trend === "neutral" && <Minus className="w-3 h-3" />}
              {trendValue}
            </span>
          )}
        </div>
        <p className={cn(
          "text-3xl font-bold font-mono text-foreground tracking-tight",
        )}>
          {formatStatValue(value, format)}
        </p>
        {(description || sublabel) && (
          <p className="text-xs text-muted-foreground/35 mt-2 label-text leading-relaxed">
            {description || sublabel}
          </p>
        )}
      </div>
    );
  }

  if (variant === "sage") {
    return (
      <div
        className={cn(
          "bg-card/80 rounded-lg p-5 border border-primary/10 shadow-[0_2px_8px_rgba(var(--primary-rgb,159,188,164),0.08)] hover:shadow-[0_4px_16px_rgba(var(--primary-rgb,159,188,164),0.15)] transition-all duration-300",
          className
        )}
        data-testid={props["data-testid"]}
      >
        {icon && <div className="mb-3">{icon}</div>}
        <p className="text-xs font-medium text-muted-foreground tracking-wider uppercase mb-1 label-text">
          {label}
        </p>
        <p
          className={cn(
            "text-2xl font-bold font-mono text-foreground",
            trend === "up" && "text-secondary",
            trend === "down" && "text-destructive"
          )}
        >
          {formatStatValue(value, format)}
        </p>
        {sublabel && (
          <p className="text-xs text-muted-foreground/40 mt-1 label-text">{sublabel}</p>
        )}
      </div>
    );
  }

  if (variant === "light") {
    return (
      <div
        className={cn(
          "bg-card/80 rounded-lg p-5 border border-primary/10 shadow-[0_2px_8px_rgba(var(--primary-rgb,159,188,164),0.08)] hover:shadow-[0_4px_12px_rgba(var(--primary-rgb,159,188,164),0.12)] transition-all duration-300",
          className
        )}
        data-testid={props["data-testid"]}
      >
        <div className="flex items-center gap-3">
          {icon && (
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-secondary">
              {icon}
            </div>
          )}
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider label-text">
              {label}
            </p>
            <p
              className={cn(
                "text-xl font-bold font-mono text-foreground",
                trend === "up" && "text-secondary",
                trend === "down" && "text-destructive"
              )}
            >
              {formatStatValue(value, format)}
            </p>
            {sublabel && (
              <p className="text-xs text-muted-foreground/35 mt-0.5 label-text">{sublabel}</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "bg-card/80 rounded-lg p-5 border border-primary/10 shadow-[0_2px_8px_rgba(var(--primary-rgb,159,188,164),0.08)]",
        className
      )}
      data-testid={props["data-testid"]}
    >
      {icon && <div className="mb-2 text-primary">{icon}</div>}
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1 label-text">
        {label}
      </p>
      <p
        className={cn(
          "text-2xl font-bold font-mono text-foreground",
          trend === "up" && "text-primary",
          trend === "down" && "text-destructive/80"
        )}
      >
        {formatStatValue(value, format)}
      </p>
      {sublabel && (
        <p className="text-xs text-muted-foreground/35 mt-1 label-text">{sublabel}</p>
      )}
    </div>
  );
}

export { StatCard };
