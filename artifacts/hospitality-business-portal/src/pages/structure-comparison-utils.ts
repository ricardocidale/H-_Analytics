import { formatCompact, formatPercent } from "@/components/graphics";

export const RISK_BADGE: Record<string, { label: string; className: string }> = {
  low: { label: "Low", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  medium: { label: "Medium", className: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  high: { label: "High", className: "bg-orange-500/15 text-orange-700 dark:text-orange-400" },
  "very-high": { label: "Very High", className: "bg-red-500/15 text-red-700 dark:text-red-400" },
};

export function fmtIrr(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "—";
  return formatPercent(v, 1);
}

export function fmtMoney(v: number): string {
  if (!Number.isFinite(v)) return "—";
  return formatCompact(v);
}

export function fmtMoic(v: number): string {
  if (!Number.isFinite(v) || v === 0) return "—";
  return `${v.toFixed(2)}×`;
}
