/**
 * financial-table.tsx — Pre-styled table component for financial statement display.
 *
 * Builds on the base shadcn Table with financial-specific formatting:
 * sticky row headers, right-aligned monetary columns, subtotal/total row
 * styling, and color-coded negative values. Used by the property and
 * company income statement views.
 */
import * as React from "react";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/financialEngine";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface FinancialTableColumn {
  label: string;
  key: string;
}

export interface FinancialTableRow {
  label: string;
  values: (number | string | null)[];
  indent?: number;
  bold?: boolean;
  isSection?: boolean;
  isSeparator?: boolean;
  isSubtotal?: boolean;
  isTotal?: boolean;
  className?: string;
  negative?: boolean;
  formatAsPercent?: boolean;
}

export interface FinancialTableProps {
  title?: string;
  rows: FinancialTableRow[];
  columns: string[];
  stickyLabel?: string;
  className?: string;
  tableRef?: React.Ref<HTMLDivElement>;
  variant?: "light" | "dark";
  "data-testid"?: string;
}

function formatValue(
  val: number | string | null,
  opts?: { negative?: boolean; formatAsPercent?: boolean }
): string {
  if (val === null || val === undefined) return "-";
  if (typeof val === "string") return val;
  if (opts?.formatAsPercent) return `${val.toFixed(1)}%`;
  if (opts?.negative) return `(${formatMoney(Math.abs(val))})`;
  return formatMoney(val);
}

function FinancialTable({
  title,
  rows,
  columns,
  stickyLabel = "Category",
  className,
  tableRef,
  variant = "light",
  ...props
}: FinancialTableProps) {
  const isDark = variant === "dark";

  return (
    <div
      ref={tableRef}
      className={cn(
        "rounded-lg p-6 shadow-sm border",
        isDark ? "bg-card border-border" : "bg-card border-border",
        className
      )}
      data-testid={props["data-testid"]}
    >
      {title && (
        <h3
          className={cn(
            "text-lg font-display mb-4",
            isDark ? "text-foreground" : "text-foreground"
          )}
        >
          {title}
        </h3>
      )}
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className={isDark ? "border-border" : "border-border"}>
              <TableHead
                className={cn(
                  "sticky left-0",
                  isDark ? "bg-muted text-foreground" : "bg-muted text-foreground"
                )}
              >
                {stickyLabel}
              </TableHead>
              {columns.map((col, i) => (
                <TableHead
                  key={i}
                  className={cn(
                    "text-right min-w-[100px]",
                    isDark ? "text-foreground" : "text-foreground"
                  )}
                >
                  {col}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, rowIdx) => {
              if (row.isSeparator) {
                return (
                  <TableRow key={rowIdx}>
                    <TableCell colSpan={columns.length + 1} className="h-2 p-0" />
                  </TableRow>
                );
              }

              const bgClass = row.isSection
                ? isDark
                  ? "bg-muted font-semibold"
                  : "bg-muted font-semibold"
                : row.isSubtotal
                ? isDark
                  ? "bg-muted font-semibold"
                  : "bg-muted/50 font-semibold"
                : row.isTotal
                ? isDark
                  ? "bg-primary/10 font-bold"
                  : "bg-primary/10 font-bold"
                : "";

              const paddingLeft = row.indent ? `${(row.indent * 1.5) + 1}rem` : undefined;

              return (
                <TableRow
                  key={rowIdx}
                  className={cn(bgClass, row.className)}
                >
                  <TableCell
                    className={cn(
                      "sticky left-0",
                      row.bold && "font-semibold",
                      isDark ? "bg-inherit text-foreground" : "bg-inherit"
                    )}
                    style={paddingLeft ? { paddingLeft } : undefined}
                  >
                    {row.label}
                  </TableCell>
                  {row.values.map((val, colIdx) => (
                    <TableCell
                      key={colIdx}
                      className={cn(
                        "text-right font-mono",
                        isDark ? "text-muted-foreground" : "text-muted-foreground",
                        typeof val === "number" && val < 0 && "text-destructive"
                      )}
                    >
                      {formatValue(val, {
                        negative: row.negative,
                        formatAsPercent: row.formatAsPercent,
                      })}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export { FinancialTable };
