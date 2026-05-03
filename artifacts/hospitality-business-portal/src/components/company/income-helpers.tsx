import React from "react";
import { TableRow, TableCell } from "@/components/ui/table";
import { ChevronRight, ChevronDown } from "@/components/icons/themed-icons";
import { MONTHS_PER_YEAR } from "@/lib/constants";
import type { CompanyMonthlyFinancials, MonthlyFinancials } from "@/lib/financialEngine";
import type { GlobalResponse, PropertyResponse } from "@/lib/api/types";

export interface IncomeRowsProps {
  financials: CompanyMonthlyFinancials[];
  properties: PropertyResponse[];
  global: GlobalResponse;
  projectionYears: number;
  expandedRows: Set<string>;
  toggleRow: (rowId: string) => void;
  propertyFinancials: { property: PropertyResponse; financials: MonthlyFinancials[] }[];
}

export function FormulaRow({
  rowKey,
  label,
  values,
  projectionYears,
  expandedRows,
  toggleRow,
}: {
  rowKey: string;
  label: string;
  values: string[];
  projectionYears: number;
  expandedRows: Set<string>;
  toggleRow: (rowId: string) => void;
}) {
  return (
    <>
      <TableRow
        className="bg-primary/5 cursor-pointer hover:bg-primary/10"
        data-expandable-row="true"
        onClick={() => toggleRow(rowKey)}
      >
        <TableCell className="sticky left-0 bg-primary/5 pl-8 py-0.5 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            {expandedRows.has(rowKey) ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            <span className="italic">Formula</span>
          </div>
        </TableCell>
        {Array.from({ length: projectionYears }, (_, i) => (
          <TableCell key={i} className="py-0.5" />
        ))}
      </TableRow>
      {expandedRows.has(rowKey) && (
        <TableRow className="bg-primary/[0.03]" data-expandable-row="true">
          <TableCell className="sticky left-0 bg-primary/[0.03] pl-12 py-0.5 text-xs text-muted-foreground italic">
            {label}
          </TableCell>
          {values.map((v, i) => (
            <TableCell key={i} className="text-right py-0.5 font-mono text-xs text-muted-foreground">
              {v}
            </TableCell>
          ))}
        </TableRow>
      )}
    </>
  );
}

export function getPropertyYearlyBaseFee(
  propertyFinancials: { property: PropertyResponse; financials: MonthlyFinancials[] }[],
  propIdx: number,
  year: number,
) {
  const pf = propertyFinancials[propIdx].financials;
  const yearData = pf.slice(year * MONTHS_PER_YEAR, (year + 1) * MONTHS_PER_YEAR);
  return yearData.reduce((a, m) => a + m.feeBase, 0);
}
