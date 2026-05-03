import React from "react";
import { TableCell, TableRow } from "@/components/ui/table";
import { Property } from "@shared/schema";
import type { YearlyPerPropertyBS } from "./useBalanceSheetData";

export interface SectionProps {
  years: number[];
  properties: Property[];
  expandedRows: Set<string>;
  expandedFormulas: Set<string>;
  toggleRow: (id: string) => void;
  toggleFormula: (id: string) => void;
  perPropertyByYear: Map<number, YearlyPerPropertyBS>[];
}

export interface AssetsSectionProps extends SectionProps {
  consolidatedTotalAssets: number[];
  consolidatedCash: number[];
  consolidatedPPE: number[];
  consolidatedAccDep: number[];
  consolidatedDeferredFC: number[];
  consolidatedNetFixed: number[];
}

export interface LiabilitiesSectionProps extends SectionProps {
  consolidatedTotalLiabilities: number[];
  consolidatedDebt: number[];
}

export interface EquitySectionProps extends SectionProps {
  consolidatedTotalEquity: number[];
  consolidatedEquity: number[];
  consolidatedRetained: number[];
}

export function MetricItemRow({ label, values }: { label: string; values: string[] }) {
  return (
    <TableRow data-testid={`row-bs-metric-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}>
      <TableCell className="pl-10 sticky left-0 bg-card z-10 text-sm text-muted-foreground italic">{label}</TableCell>
      {values.map((val, i) => (
        <TableCell key={i} className="text-right font-mono text-sm text-muted-foreground italic">
          {val}
        </TableCell>
      ))}
    </TableRow>
  );
}
