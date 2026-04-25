import * as React from "react";
import { cn } from "@/lib/utils";
import { Money } from "@/components/Money";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { TableRow, TableCell } from "@/components/ui/table";
import { useCalcDetails, SUBTOTAL_BG, GRAND_TOTAL_CLASS } from "./context";

/* ═══════════════════════════════════════════════
   1. SectionHeader
   Green-text label that introduces a section
   (e.g. "Revenue", "Operating Expenses").
   ═══════════════════════════════════════════════ */

interface SectionHeaderProps {
  /** Display label — e.g. "Revenue", "Operating Cash Flow" */
  label: string;
  /** Total column count (years + 1 for the label column) */
  colSpan: number;
  /** Optional tooltip shown as an info icon beside the label */
  tooltip?: string;
  /** Override the section header text color (default: text-secondary) */
  textColor?: string;
}

export function SectionHeader({
  label,
  colSpan,
  tooltip,
  textColor = "text-secondary",
}: SectionHeaderProps) {
  const showDetails = useCalcDetails();
  return (
    <TableRow className="bg-muted">
      <TableCell colSpan={colSpan} className={cn("font-medium py-2", textColor)}>
        <span className="flex items-center gap-1.5">
          {label}
          {showDetails && tooltip && <InfoTooltip text={tooltip} />}
        </span>
      </TableCell>
    </TableRow>
  );
}

/* ═══════════════════════════════════════════════
   2. SubtotalRow
   Bold row with tinted background for intermediate
   totals (e.g. "Total Revenue", "GOP", "Cash from
   Operations").
   ═══════════════════════════════════════════════ */

interface SubtotalRowProps {
  label: string;
  values: number[];
  tooltip?: string;
  /** When true, positive values get the accent color */
  positive?: boolean;
  /** Accent color class for positive values (default: text-accent) */
  positiveColor?: string;
  /** Custom background color for the label cell (default: matches row) */
  labelBg?: string;
  /** Override the entire row background (default: ice-blue dark) */
  bgColor?: string;
  formula?: string;
}

export function SubtotalRow({
  label,
  values,
  tooltip,
  positive,
  positiveColor = "text-accent-foreground",
  bgColor,
  labelBg,
  formula,
}: SubtotalRowProps) {
  const showDetails = useCalcDetails();
  const rowStyle = bgColor ? { backgroundColor: bgColor } : { backgroundColor: SUBTOTAL_BG };
  const cellStyle = labelBg ? { backgroundColor: labelBg } : rowStyle;

  return (
    <TableRow style={rowStyle} className="font-medium">
      <TableCell className="sticky left-0 py-1.5" style={cellStyle}>
        <span className="flex items-center gap-1">
          {label}
          {showDetails && tooltip && <InfoTooltip text={tooltip} formula={formula} />}
        </span>
      </TableCell>
      {values.map((v, i) => (
        <TableCell
          key={i}
          className={cn(
            "text-right py-1.5 font-mono px-2",
            v < 0 ? "text-destructive" : positive ? positiveColor : ""
          )}
        >
          <Money amount={v} />
        </TableCell>
      ))}
    </TableRow>
  );
}

/* ═══════════════════════════════════════════════
   3. LineItem
   Standard data row — the workhorse.  Handles
   indentation, negation, zero-suppression,
   tooltips, and custom formatting.
   ═══════════════════════════════════════════════ */

interface LineItemProps {
  label: string;
  values: number[];
  /** Indent the label (true = one level, or pass a number for deeper) */
  indent?: boolean | number;
  tooltip?: string;
  formula?: string;
  /** Show "0" instead of "-" when value is zero */
  showZero?: boolean;
  /** Display values as negative (prepend minus / wrap in parens) */
  negate?: boolean;
  /** Format values as percentages instead of currency */
  formatAsPercent?: boolean;
  /** Extra className on the row */
  className?: string;
  /** Optional content rendered after the label (e.g. a source-of-truth badge). */
  labelSuffix?: React.ReactNode;
}

export function LineItem({
  label,
  values,
  indent,
  tooltip,
  formula,
  showZero,
  negate,
  formatAsPercent,
  className,
  labelSuffix,
}: LineItemProps) {
  const showDetails = useCalcDetails();
  const indentLevel = indent === true ? 1 : typeof indent === "number" ? indent : 0;
  const paddingLeft = indentLevel > 0 ? `${indentLevel * 1.5 + 1}rem` : undefined;

  return (
    <TableRow className={className}>
      <TableCell
        className={cn("sticky left-0 bg-card py-1", indentLevel > 0 && "text-muted-foreground")}
        style={paddingLeft ? { paddingLeft } : undefined}
      >
        <span className="flex items-center gap-1">
          {label}
          {showDetails && tooltip && <InfoTooltip text={tooltip} formula={formula} />}
          {labelSuffix && <span className="ml-1 inline-flex">{labelSuffix}</span>}
        </span>
      </TableCell>
      {values.map((v, i) => {
        const displayVal = negate ? -v : v;
        if (formatAsPercent) {
          return (
            <TableCell key={i} className="text-right py-1 font-mono px-2">
              {v === 0 && !showZero ? "-" : `${displayVal.toFixed(1)}%`}
            </TableCell>
          );
        }
        return (
          <TableCell key={i} className="text-right py-1 font-mono px-2">
            {v === 0 && !showZero ? "-" : <Money amount={displayVal} />}
          </TableCell>
        );
      })}
    </TableRow>
  );
}

/* ═══════════════════════════════════════════════
   5. GrandTotalRow
   Final summary row with the signature primary
   gradient background (used for "TOTAL ASSETS",
   "Net Change in Cash", etc.).
   ═══════════════════════════════════════════════ */

interface GrandTotalRowProps {
  label: string;
  values: number[];
  tooltip?: string;
  /** Use light variant for the tooltip icon */
  lightTooltip?: boolean;
}

export function GrandTotalRow({
  label,
  values,
  tooltip,
  lightTooltip = true,
}: GrandTotalRowProps) {
  const showDetails = useCalcDetails();
  return (
    <TableRow className={GRAND_TOTAL_CLASS}>
      <TableCell className="sticky left-0 bg-primary/70 py-1.5">
        <span className="flex items-center gap-1">
          {label}
          {showDetails && tooltip && <InfoTooltip text={tooltip} light={lightTooltip} />}
        </span>
      </TableCell>
      {values.map((v, i) => (
        <TableCell key={i} className="text-right py-1.5 font-mono px-2">
          <Money amount={v} className={v < 0 ? "text-destructive/60" : ""} />
        </TableCell>
      ))}
    </TableRow>
  );
}

/* ═══════════════════════════════════════════════
   7. SpacerRow
   Empty row for visual breathing room between
   sections.
   ═══════════════════════════════════════════════ */

interface SpacerRowProps {
  colSpan: number;
  height?: string;
}

export function SpacerRow({ colSpan, height = "h-2" }: SpacerRowProps) {
  return (
    <TableRow className={cn(height, "border-none")}>
      <TableCell colSpan={colSpan}></TableCell>
    </TableRow>
  );
}
