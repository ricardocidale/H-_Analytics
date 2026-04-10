import * as React from "react";
import { cn } from "@/lib/utils";
import { Money } from "@/components/Money";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { TableRow, TableCell } from "@/components/ui/table";
import { ChevronRight, ChevronDown } from "@/components/icons/themed-icons";
import { useCalcDetails } from "./context";

/* ═══════════════════════════════════════════════
   6. MetricRow
   KPI / ratio row — formatted as percentage,
   multiplier, or plain text.  Used for
   Cash-on-Cash, DSCR, NOI Margin, etc.
   ═══════════════════════════════════════════════ */

interface MetricRowProps {
  label: string;
  /** Pre-formatted string values (e.g. "18.1%", "1.45x", "N/A") */
  values: string[];
  tooltip?: string;
  formula?: string;
  /** Highlight class per value — e.g. "text-accent" or "text-destructive" */
  highlights?: (string | undefined)[];
}

export function MetricRow({ label, values, tooltip, formula, highlights }: MetricRowProps) {
  const showDetails = useCalcDetails();
  return (
    <TableRow>
      <TableCell className="pl-6 sticky left-0 bg-card py-1">
        <span className="flex items-center gap-1">
          {label}
          {showDetails && tooltip && <InfoTooltip text={tooltip} formula={formula} />}
        </span>
      </TableCell>
      {values.map((v, i) => (
        <TableCell
          key={i}
          className={cn("text-right font-medium py-1 font-mono px-2", highlights?.[i])}
        >
          {v}
        </TableCell>
      ))}
    </TableRow>
  );
}

/* ═══════════════════════════════════════════════
   7b. MarginRow
   Italic percentage row shown beneath subtotals
   to display common-size analysis (value ÷ base × 100).
   Used for margins like GOP %, NOI %, Net Income %.
   ═══════════════════════════════════════════════ */

interface MarginRowProps {
  label: string;
  values: number[];
  baseValues: number[];
}

export function MarginRow({ label, values, baseValues }: MarginRowProps) {
  return (
    <TableRow>
      <TableCell className="sticky left-0 bg-card py-0.5 text-xs text-muted-foreground italic pl-6">
        {label}
      </TableCell>
      {values.map((v, i) => {
        const base = baseValues[i] || 0;
        const pctVal = base !== 0 ? (v / base) * 100 : 0;
        return (
          <TableCell key={i} className="text-right py-0.5 font-mono text-xs text-muted-foreground italic px-2">
            {base !== 0 ? `${pctVal.toFixed(1)}%` : "—"}
          </TableCell>
        );
      })}
    </TableRow>
  );
}

/* ═══════════════════════════════════════════════
   10. FormulaDetailRow
   A row showing the mathematical breakdown of a value.
   Used inside expanded property line items.
   ═══════════════════════════════════════════════ */

interface FormulaDetailRowProps {
  label: string;
  values: number[];
  /** When true, positive values get the accent color */
  positive?: boolean;
}

export function FormulaDetailRow({ label, values, positive }: FormulaDetailRowProps) {
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
        {values.map((_, i) => (
          <TableCell key={i} className="py-0.5" />
        ))}
      </TableRow>
      {open && (
        <TableRow className="bg-primary/[0.03]" data-expandable-row="true">
          <TableCell className="pl-16 py-0.5 text-xs text-muted-foreground italic">
            {label}
          </TableCell>
          {values.map((v, i) => (
            <TableCell
              key={i}
              className={cn(
                "text-right py-0.5 font-mono text-xs",
                v < 0 ? "text-destructive" : positive ? "text-accent" : "text-muted-foreground"
              )}
            >
              <Money amount={v} />
            </TableCell>
          ))}
        </TableRow>
      )}
    </>
  );
}

/* ═══════════════════════════════════════════════
   11. PropertyBreakdownRow
   A row showing a property's contribution to a
   portfolio total.
   ═══════════════════════════════════════════════ */

interface FormulaDetailStringRowProps {
  label: string;
  values: string[];
  colCount?: number;
}

export function FormulaDetailStringRow({ label, values }: FormulaDetailStringRowProps) {
  return (
    <TableRow className="bg-primary/[0.03]" data-expandable-row="true">
      <TableCell className="pl-12 sticky left-0 bg-primary/[0.03] py-0.5 text-xs text-muted-foreground italic">
        {label}
      </TableCell>
      {values.map((v, i) => (
        <TableCell key={i} className="text-right py-0.5 font-mono text-xs text-muted-foreground">
          {v}
        </TableCell>
      ))}
    </TableRow>
  );
}

interface PropertyBreakdownRowProps {
  propertyName: string;
  values: number[];
}

export function PropertyBreakdownRow({ propertyName, values }: PropertyBreakdownRowProps) {
  return (
    <TableRow className="bg-muted/50" data-expandable-row="true">
      <TableCell className="pl-12 py-1 text-sm text-muted-foreground italic">
        {propertyName}
      </TableCell>
      {values.map((v, i) => (
        <TableCell key={i} className="text-right py-1 font-mono text-sm text-muted-foreground">
          <Money amount={v} />
        </TableCell>
      ))}
    </TableRow>
  );
}
