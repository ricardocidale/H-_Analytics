/**
 * Money.tsx — Inline monetary display component.
 *
 * Wraps the financial engine's `formatMoney` formatter into a React element
 * so dollar amounts render consistently throughout the UI (e.g. "$1,250,000").
 * Negative values are automatically highlighted in red to flag losses or
 * unfavorable variances — a common convention in financial reporting.
 */
import { formatMoney } from "@/lib/financialEngine";
import { cn } from "@/lib/utils";

interface MoneyProps {
  amount: number;
  className?: string;
}

export function Money({ amount, className }: MoneyProps) {
  const isNegative = amount < 0;
  return (
    <span className={cn(isNegative && "text-destructive", className)}>
      {formatMoney(amount)}
    </span>
  );
}
