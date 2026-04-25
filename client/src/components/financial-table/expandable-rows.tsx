import * as React from "react";
import { cn } from "@/lib/utils";
import { Money } from "@/components/Money";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { ChevronDown, ChevronRight } from "@/components/icons/themed-icons";
import { TableRow, TableCell } from "@/components/ui/table";
import { useCalcDetails } from "./context";

/* ═══════════════════════════════════════════════
   4. ExpandableLineItem
   Collapsible section — click to show/hide child
   rows (e.g. revenue breakdown, expense detail).
   ═══════════════════════════════════════════════ */

interface ExpandableLineItemProps {
  label: string;
  values: number[];
  tooltip?: string;
  children: React.ReactNode;
  expanded: boolean;
  onToggle: () => void;
  /** Display values as negative */
  negate?: boolean;
  /** Optional content rendered after the label (e.g. a source-of-truth badge). */
  labelSuffix?: React.ReactNode;
}

export function ExpandableLineItem({
  label,
  values,
  tooltip,
  children,
  expanded,
  onToggle,
  negate,
  labelSuffix,
}: ExpandableLineItemProps) {
  const showDetails = useCalcDetails();

  return (
    <>
      <TableRow className="cursor-pointer hover:bg-muted" onClick={onToggle}>
        <TableCell className="pl-6 sticky left-0 bg-card py-1">
          <span className="flex items-center gap-1">
            {expanded ? (
              <ChevronDown className="w-4 h-4 flex-shrink-0" />
            ) : (
              <ChevronRight className="w-4 h-4 flex-shrink-0" />
            )}
            <span className="ml-1">{label}</span>
            {showDetails && tooltip && <InfoTooltip text={tooltip} />}
            {labelSuffix && (
              <span onClick={(e) => e.stopPropagation()} className="ml-1 inline-flex">
                {labelSuffix}
              </span>
            )}
          </span>
        </TableCell>
        {values.map((v, i) => {
          const displayVal = negate ? -v : v;
          return (
            <TableCell key={i} className="text-right font-medium py-1 font-mono px-2">
              <Money amount={displayVal} />
            </TableCell>
          );
        })}
      </TableRow>
      {expanded && children}
    </>
  );
}

/* ═══════════════════════════════════════════════
   6b. ExpandableMetricRow
   Like MetricRow but with an accordion chevron.
   Click to expand/collapse child detail rows.
   ═══════════════════════════════════════════════ */

interface ExpandableMetricRowProps {
  label: string;
  values: string[];
  tooltip?: string;
  highlights?: (string | undefined)[];
  children: React.ReactNode;
  expanded: boolean;
  onToggle: () => void;
}

export function ExpandableMetricRow({
  label,
  values,
  tooltip,
  highlights,
  children,
  expanded,
  onToggle,
}: ExpandableMetricRowProps) {
  const showDetails = useCalcDetails();

  return (
    <>
      <TableRow className="cursor-pointer hover:bg-muted" onClick={onToggle}>
        <TableCell className="pl-6 sticky left-0 bg-card py-1">
          <span className="flex items-center gap-1">
            {expanded ? (
              <ChevronDown className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
            )}
            {label}
            {showDetails && tooltip && <InfoTooltip text={tooltip} />}
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
      {expanded && children}
    </>
  );
}

/* ═══════════════════════════════════════════════
   9b. ExpandableBalanceSheetLineItem
   Accordion line item for Balance Sheet — click to
   expand/collapse child detail rows (e.g. breakdown
   of Cash, PP&E, Debt, Equity components).
   ═══════════════════════════════════════════════ */

interface ExpandableBalanceSheetLineItemProps {
  label: string;
  amount: number;
  indent?: number;
  bold?: boolean;
  isSubtotal?: boolean;
  isTotal?: boolean;
  tooltip?: string;
  children: React.ReactNode;
  expanded: boolean;
  onToggle: () => void;
}

export function ExpandableBalanceSheetLineItem({
  label,
  amount,
  indent = 0,
  bold,
  isSubtotal,
  isTotal,
  tooltip,
  children,
  expanded,
  onToggle,
}: ExpandableBalanceSheetLineItemProps) {
  const showDetails = useCalcDetails();
  const paddingLeft = indent > 0 ? `${indent * 1.5}rem` : undefined;

  return (
    <>
      <TableRow
        className={cn(
          "cursor-pointer hover:bg-muted",
          isSubtotal && "bg-primary/5",
          isTotal && "bg-primary/10 font-medium"
        )}
        onClick={onToggle}
      >
        <TableCell
          className={cn(bold && "font-medium")}
          style={paddingLeft ? { paddingLeft } : undefined}
        >
          <span className="flex items-center gap-1">
            {expanded ? (
              <ChevronDown className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
            )}
            {label}
            {showDetails && tooltip && <InfoTooltip text={tooltip} />}
          </span>
        </TableCell>
        <TableCell className="text-right font-mono">
          <Money amount={amount} className={bold ? "font-medium" : undefined} />
        </TableCell>
      </TableRow>
      {expanded && children}
    </>
  );
}
