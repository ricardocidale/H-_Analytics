/**
 * formatters.ts — Number formatting utilities for the graphics layer.
 *
 * Provides compact currency formatting (e.g. "$1.2M", "$450K"), percentage
 * formatting, and trend direction detection. These are used by KPIGrid,
 * DonutChart, Gauge, and other visualization components to display
 * financial metrics in a space-efficient way.
 *
 * Also re-exports the full-precision `formatMoney` from the financial engine
 * so graphics components can import from a single module.
 */
import { formatMoney } from "@/lib/financialEngine";

export function formatCompact(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

export function formatPercent(value: number, decimals = 1): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

export function formatPercentRaw(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`;
}

export function trendDirection(current: number, previous: number): "up" | "down" | "neutral" {
  if (current > previous * 1.001) return "up";
  if (current < previous * 0.999) return "down";
  return "neutral";
}

export const CHART_COLORS = {
  primary: "hsl(var(--chart-1))",
  secondary: "hsl(var(--chart-2))",
  accent: "hsl(var(--accent-pop))",
  blue: "hsl(var(--chart-3))",
  purple: "hsl(var(--chart-3))",
  amber: "hsl(var(--chart-4))",
  red: "hsl(var(--destructive))",
  teal: "hsl(var(--accent-pop-2))",
  slate: "hsl(var(--muted-foreground))",
  gradient: {
    sage: ["hsl(var(--chart-1))", "hsl(var(--chart-2))"],
    ocean: ["hsl(var(--chart-3))", "hsl(var(--chart-5))"],
    sunset: ["hsl(var(--accent-pop))", "hsl(var(--chart-4))"],
    purple: ["hsl(var(--chart-3))", "hsl(var(--chart-5))"],
  },
  palette: [
    "hsl(var(--chart-1))",
    "hsl(var(--chart-2))",
    "hsl(var(--chart-3))",
    "hsl(var(--accent-pop))",
    "hsl(var(--chart-4))",
    "hsl(var(--chart-5))",
    "hsl(var(--accent-pop-2))",
    "hsl(var(--destructive))",
  ],
  // Semantic status colors for gauges, waterfall, tornado diagrams
  good: "hsl(var(--chart-1))",
  warn: "hsl(var(--chart-4))",
  bad: "hsl(var(--destructive))",
  positive: "hsl(var(--chart-1))",
  negative: "hsl(var(--destructive))",
  neutral: "hsl(var(--muted-foreground))",
  subtotal: "hsl(var(--primary))",
  connector: "hsl(var(--muted-foreground))",
  tooltipBg: "rgba(0,0,0,0.85)",
  tooltipText: "hsl(var(--card-foreground))",
  gridStroke: "hsl(var(--border))",
  axisStroke: "hsl(var(--muted-foreground))",
} as const;

export { formatMoney };
