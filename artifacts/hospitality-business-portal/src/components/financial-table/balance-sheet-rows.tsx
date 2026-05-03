import * as React from "react";
import { cn } from "@/lib/utils";
import { Money } from "@/components/Money";
import { TableRow, TableCell } from "@/components/ui/table";
import { ChevronRight, ChevronDown } from "@/components/icons/themed-icons";

/* ═══════════════════════════════════════════════
   8. BalanceSheetSection
   Section header for Balance Sheet style tables
   (e.g. "ASSETS", "LIABILITIES", "EQUITY")
   ═══════════════════════════════════════════════ */

interface BalanceSheetSectionProps {
  label: string;
  colSpan: number;
}

export function BalanceSheetSection({ label, colSpan }: BalanceSheetSectionProps) {
  return (
    <TableRow className="bg-muted/30">
      <TableCell colSpan={colSpan} className="font-medium text-accent">
        {label}
      </TableCell>
    </TableRow>
  );
}

/* ═══════════════════════════════════════════════
   9. BalanceSheetLineItem
   Indented line item for Balance Sheet style
   (supports category headers, items, subtotals).
   ═══════════════════════════════════════════════ */

interface BalanceSheetLineItemProps {
  label: string;
  amount?: number;
  /** Indent level: 0 = flush, 1 = category, 2 = detail */
  indent?: number;
  /** Bold label (for category headers and subtotals) */
  bold?: boolean;
  /** Subtotal tint background */
  isSubtotal?: boolean;
  /** Grand total row (primary/10 background) */
  isTotal?: boolean;
}

export function BalanceSheetLineItem({
  label,
  amount,
  indent = 0,
  bold,
  isSubtotal,
  isTotal,
}: BalanceSheetLineItemProps) {
  const paddingLeft = indent > 0 ? `${indent * 1.5}rem` : undefined;

  return (
    <TableRow
      className={cn(
        isSubtotal && "bg-primary/5",
        isTotal && "bg-primary/10 font-medium"
      )}
    >
      <TableCell
        className={cn(bold && "font-medium")}
        style={paddingLeft ? { paddingLeft } : undefined}
      >
        {label}
      </TableCell>
      <TableCell className="text-right font-mono">
        {amount !== undefined ? (
          <Money amount={amount} className={bold ? "font-medium" : undefined} />
        ) : null}
      </TableCell>
    </TableRow>
  );
}

/* ═══════════════════════════════════════════════
   9c. BalanceSheetFormulaRow
   Sub-row shown inside expanded balance sheet items.
   Shows one line of the breakdown in small italic text.
   ═══════════════════════════════════════════════ */

interface BalanceSheetFormulaRowProps {
  label: string;
  amount: number;
}

export function BalanceSheetFormulaRow({ label, amount }: BalanceSheetFormulaRowProps) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <TableRow
        className="bg-primary/5 cursor-pointer hover:bg-primary/10"
        data-expandable-row="true"
        onClick={() => setOpen(v => !v)}
      >
        <TableCell className="pl-12 py-0.5 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            <span className="italic">Formula</span>
          </div>
        </TableCell>
        <TableCell className="py-0.5" />
      </TableRow>
      {open && (
        <TableRow className="bg-primary/[0.03]" data-expandable-row="true">
          <TableCell className="pl-16 py-0.5 text-xs text-muted-foreground italic">
            {label}
          </TableCell>
          <TableCell className="text-right py-0.5 font-mono text-xs text-muted-foreground">
            <Money amount={amount} />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
