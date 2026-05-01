import React from "react";
import { formatMoney } from "@/lib/financialEngine";
import { MONTHS_PER_YEAR } from "@/lib/constants";
import { TableRow, TableCell } from "@/components/ui/table";
import { ChevronRight, ChevronDown } from "@/components/icons/themed-icons";
import { FormulaRow, type IncomeRowsProps } from "./income-helpers";

export default function IncomeExpenseRows({
  financials,
  global,
  projectionYears,
  expandedRows,
  toggleRow,
}: IncomeRowsProps) {
  return (
    <>
      <TableRow
        className="bg-muted font-semibold cursor-pointer hover:bg-muted"
        onClick={() => toggleRow('opex')}
      >
        <TableCell className="sticky left-0 bg-muted flex items-center gap-2">
          {expandedRows.has('opex') ? (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          )}
          Operating Expenses
        </TableCell>
        {Array.from({ length: projectionYears }, (_, y) => {
          const yearData = financials.slice(y * MONTHS_PER_YEAR, (y + 1) * MONTHS_PER_YEAR);
          const total = yearData.reduce((a, m) => a + m.totalExpenses, 0);
          return <TableCell key={y} className="text-right font-mono">{formatMoney(total)}</TableCell>;
        })}
      </TableRow>
      <FormulaRow
        rowKey="formula-totalExpenses"
        label="= Compensation + Fixed Overhead + Variable Costs"
        projectionYears={projectionYears}
        expandedRows={expandedRows}
        toggleRow={toggleRow}
        values={Array.from({ length: projectionYears }, (_, y) => {
          const yearData = financials.slice(y * MONTHS_PER_YEAR, (y + 1) * MONTHS_PER_YEAR);
          const comp = yearData.reduce((a, m) => a + m.partnerCompensation + m.staffCompensation, 0);
          const fixed = yearData.reduce((a, m) => a + m.officeLease + m.professionalServices + m.techInfrastructure + m.businessInsurance, 0);
          const variable = yearData.reduce((a, m) => a + m.travelCosts + m.itLicensing + m.marketing + m.miscOps, 0);
          return `${formatMoney(comp)} + ${formatMoney(fixed)} + ${formatMoney(variable)}`;
        })}
      />
      {expandedRows.has('opex') && (
        <>
          <TableRow
            className="cursor-pointer hover:bg-muted"
            onClick={() => toggleRow('opexComp')}
          >
            <TableCell className="sticky left-0 bg-card pl-6 flex items-center gap-2">
              {expandedRows.has('opexComp') ? (
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              )}
              Compensation
            </TableCell>
            {Array.from({ length: projectionYears }, (_, y) => {
              const yearData = financials.slice(y * MONTHS_PER_YEAR, (y + 1) * MONTHS_PER_YEAR);
              const total = yearData.reduce((a, m) => a + m.partnerCompensation + m.staffCompensation, 0);
              return <TableCell key={y} className="text-right text-muted-foreground font-mono">{formatMoney(total)}</TableCell>;
            })}
          </TableRow>
          {expandedRows.has('opexComp') && (
            <>
              <TableRow className="bg-muted/50">
                <TableCell className="sticky left-0 bg-muted/50 pl-12 text-sm text-muted-foreground">Partner Compensation</TableCell>
                {Array.from({ length: projectionYears }, (_, y) => {
                  const yearData = financials.slice(y * MONTHS_PER_YEAR, (y + 1) * MONTHS_PER_YEAR);
                  const total = yearData.reduce((a, m) => a + m.partnerCompensation, 0);
                  return <TableCell key={y} className="text-right text-sm text-muted-foreground font-mono">{formatMoney(total)}</TableCell>;
                })}
              </TableRow>
              <TableRow className="bg-muted/50">
                <TableCell className="sticky left-0 bg-muted/50 pl-12 text-sm text-muted-foreground">Staff Compensation</TableCell>
                {Array.from({ length: projectionYears }, (_, y) => {
                  const yearData = financials.slice(y * MONTHS_PER_YEAR, (y + 1) * MONTHS_PER_YEAR);
                  const total = yearData.reduce((a, m) => a + m.staffCompensation, 0);
                  return <TableCell key={y} className="text-right text-sm text-muted-foreground font-mono">{formatMoney(total)}</TableCell>;
                })}
              </TableRow>
            </>
          )}
          <TableRow
            className="cursor-pointer hover:bg-muted"
            onClick={() => toggleRow('opexFixed')}
          >
            <TableCell className="sticky left-0 bg-card pl-6 flex items-center gap-2">
              {expandedRows.has('opexFixed') ? (
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              )}
              Fixed Overhead
            </TableCell>
            {Array.from({ length: projectionYears }, (_, y) => {
              const yearData = financials.slice(y * MONTHS_PER_YEAR, (y + 1) * MONTHS_PER_YEAR);
              const total = yearData.reduce((a, m) => a + m.officeLease + m.professionalServices + m.techInfrastructure + m.businessInsurance, 0);
              return <TableCell key={y} className="text-right text-muted-foreground font-mono">{formatMoney(total)}</TableCell>;
            })}
          </TableRow>
          {expandedRows.has('opexFixed') && (
            <>
              <TableRow className="bg-muted/50">
                <TableCell className="sticky left-0 bg-muted/50 pl-12 text-sm text-muted-foreground">Office Lease</TableCell>
                {Array.from({ length: projectionYears }, (_, y) => {
                  const yearData = financials.slice(y * MONTHS_PER_YEAR, (y + 1) * MONTHS_PER_YEAR);
                  const total = yearData.reduce((a, m) => a + m.officeLease, 0);
                  return <TableCell key={y} className="text-right text-sm text-muted-foreground font-mono">{formatMoney(total)}</TableCell>;
                })}
              </TableRow>
              <TableRow className="bg-muted/50">
                <TableCell className="sticky left-0 bg-muted/50 pl-12 text-sm text-muted-foreground">Professional Services</TableCell>
                {Array.from({ length: projectionYears }, (_, y) => {
                  const yearData = financials.slice(y * MONTHS_PER_YEAR, (y + 1) * MONTHS_PER_YEAR);
                  const total = yearData.reduce((a, m) => a + m.professionalServices, 0);
                  return <TableCell key={y} className="text-right text-sm text-muted-foreground font-mono">{formatMoney(total)}</TableCell>;
                })}
              </TableRow>
              <TableRow className="bg-muted/50">
                <TableCell className="sticky left-0 bg-muted/50 pl-12 text-sm text-muted-foreground">Tech Infrastructure</TableCell>
                {Array.from({ length: projectionYears }, (_, y) => {
                  const yearData = financials.slice(y * MONTHS_PER_YEAR, (y + 1) * MONTHS_PER_YEAR);
                  const total = yearData.reduce((a, m) => a + m.techInfrastructure, 0);
                  return <TableCell key={y} className="text-right text-sm text-muted-foreground font-mono">{formatMoney(total)}</TableCell>;
                })}
              </TableRow>
              <TableRow className="bg-muted/50">
                <TableCell className="sticky left-0 bg-muted/50 pl-12 text-sm text-muted-foreground">Business Insurance</TableCell>
                {Array.from({ length: projectionYears }, (_, y) => {
                  const yearData = financials.slice(y * MONTHS_PER_YEAR, (y + 1) * MONTHS_PER_YEAR);
                  const total = yearData.reduce((a, m) => a + m.businessInsurance, 0);
                  return <TableCell key={y} className="text-right text-sm text-muted-foreground font-mono">{formatMoney(total)}</TableCell>;
                })}
              </TableRow>
            </>
          )}
          <TableRow
            className="cursor-pointer hover:bg-muted"
            onClick={() => toggleRow('opexVar')}
          >
            <TableCell className="sticky left-0 bg-card pl-6 flex items-center gap-2">
              {expandedRows.has('opexVar') ? (
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              )}
              Variable Costs
            </TableCell>
            {Array.from({ length: projectionYears }, (_, y) => {
              const yearData = financials.slice(y * MONTHS_PER_YEAR, (y + 1) * MONTHS_PER_YEAR);
              const total = yearData.reduce((a, m) => a + m.travelCosts + m.itLicensing + m.marketing + m.miscOps, 0);
              return <TableCell key={y} className="text-right text-muted-foreground font-mono">{formatMoney(total)}</TableCell>;
            })}
          </TableRow>
          {expandedRows.has('opexVar') && (
            <>
              <TableRow className="bg-muted/50">
                <TableCell className="sticky left-0 bg-muted/50 pl-12 text-sm text-muted-foreground">Travel Costs</TableCell>
                {Array.from({ length: projectionYears }, (_, y) => {
                  const yearData = financials.slice(y * MONTHS_PER_YEAR, (y + 1) * MONTHS_PER_YEAR);
                  const total = yearData.reduce((a, m) => a + m.travelCosts, 0);
                  return <TableCell key={y} className="text-right text-sm text-muted-foreground font-mono">{formatMoney(total)}</TableCell>;
                })}
              </TableRow>
              <TableRow className="bg-muted/50">
                <TableCell className="sticky left-0 bg-muted/50 pl-12 text-sm text-muted-foreground">IT Licensing</TableCell>
                {Array.from({ length: projectionYears }, (_, y) => {
                  const yearData = financials.slice(y * MONTHS_PER_YEAR, (y + 1) * MONTHS_PER_YEAR);
                  const total = yearData.reduce((a, m) => a + m.itLicensing, 0);
                  return <TableCell key={y} className="text-right text-sm text-muted-foreground font-mono">{formatMoney(total)}</TableCell>;
                })}
              </TableRow>
              <TableRow className="bg-muted/50">
                <TableCell className="sticky left-0 bg-muted/50 pl-12 text-sm text-muted-foreground">Marketing</TableCell>
                {Array.from({ length: projectionYears }, (_, y) => {
                  const yearData = financials.slice(y * MONTHS_PER_YEAR, (y + 1) * MONTHS_PER_YEAR);
                  const total = yearData.reduce((a, m) => a + m.marketing, 0);
                  return <TableCell key={y} className="text-right text-sm text-muted-foreground font-mono">{formatMoney(total)}</TableCell>;
                })}
              </TableRow>
              <FormulaRow
                rowKey="formula-marketing"
                label={`= ${((global.marketingRate ?? 0) * 100).toFixed(1)}% of Total Revenue`}
                projectionYears={projectionYears}
                expandedRows={expandedRows}
                toggleRow={toggleRow}
                values={Array.from({ length: projectionYears }, (_, y) => {
                  const yearData = financials.slice(y * MONTHS_PER_YEAR, (y + 1) * MONTHS_PER_YEAR);
                  const revenue = yearData.reduce((a, m) => a + m.totalRevenue, 0);
                  const rate = ((global.marketingRate ?? 0) * 100).toFixed(1);
                  return `${rate}% × ${formatMoney(revenue)}`;
                })}
              />
              <TableRow className="bg-muted/50">
                <TableCell className="sticky left-0 bg-muted/50 pl-12 text-sm text-muted-foreground">Misc Operations</TableCell>
                {Array.from({ length: projectionYears }, (_, y) => {
                  const yearData = financials.slice(y * MONTHS_PER_YEAR, (y + 1) * MONTHS_PER_YEAR);
                  const total = yearData.reduce((a, m) => a + m.miscOps, 0);
                  return <TableCell key={y} className="text-right text-sm text-muted-foreground font-mono">{formatMoney(total)}</TableCell>;
                })}
              </TableRow>
              <FormulaRow
                rowKey="formula-miscOps"
                label={`= ${((global.miscOpsRate ?? 0) * 100).toFixed(1)}% of Total Revenue`}
                projectionYears={projectionYears}
                expandedRows={expandedRows}
                toggleRow={toggleRow}
                values={Array.from({ length: projectionYears }, (_, y) => {
                  const yearData = financials.slice(y * MONTHS_PER_YEAR, (y + 1) * MONTHS_PER_YEAR);
                  const revenue = yearData.reduce((a, m) => a + m.totalRevenue, 0);
                  const rate = ((global.miscOpsRate ?? 0) * 100).toFixed(1);
                  return `${rate}% × ${formatMoney(revenue)}`;
                })}
              />
            </>
          )}
        </>
      )}
    </>
  );
}
