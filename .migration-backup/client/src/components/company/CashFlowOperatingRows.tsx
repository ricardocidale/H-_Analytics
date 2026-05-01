import React from "react";
import { formatMoney } from "@/lib/financialEngine";
import { MONTHS_PER_YEAR } from "@/lib/constants";
import { TableCell, TableRow } from "@/components/ui/table";
import { ChevronRight, ChevronDown } from "@/components/icons/themed-icons";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import type { CompanyTabProps } from "./types";

interface OperatingRowsProps {
  financials: CompanyTabProps["financials"];
  properties: CompanyTabProps["properties"];
  projectionYears: number;
  expandedRows: Set<string>;
  toggleRow: (rowId: string) => void;
  fundingLabel: string;
  propertyFinancials: CompanyTabProps["propertyFinancials"];
  getPropertyYearlyBaseFee: (propIdx: number, year: number) => number;
  FormulaRow: React.ComponentType<{ rowKey: string; label: string; values: string[] }>;
}

export function CashFlowOperatingRows({
  financials,
  properties,
  projectionYears,
  expandedRows,
  toggleRow,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  fundingLabel,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  propertyFinancials,
  getPropertyYearlyBaseFee,
  FormulaRow,
}: OperatingRowsProps) {
  return (
    <>
      <TableRow>
        <TableCell className="sticky left-0 bg-card pl-6">Cash Received from Management Fees</TableCell>
        {Array.from({ length: projectionYears }, (_, y) => {
          const yearData = financials.slice(y * MONTHS_PER_YEAR, (y + 1) * MONTHS_PER_YEAR);
          const total = yearData.reduce((a, m) => a + m.totalRevenue, 0);
          return <TableCell key={y} className="text-right text-muted-foreground font-mono">{formatMoney(total)}</TableCell>;
        })}
      </TableRow>
      <TableRow 
        className="cursor-pointer hover:bg-muted"
        onClick={() => toggleRow('cfBaseFees')}
      >
        <TableCell className="sticky left-0 bg-card flex items-center gap-2 pl-10">
          {expandedRows.has('cfBaseFees') ? (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          )}
          Service Fees
        </TableCell>
        {Array.from({ length: projectionYears }, (_, y) => {
          const yearData = financials.slice(y * MONTHS_PER_YEAR, (y + 1) * MONTHS_PER_YEAR);
          const total = yearData.reduce((a, m) => a + m.baseFeeRevenue, 0);
          return <TableCell key={y} className="text-right text-muted-foreground font-mono">{formatMoney(total)}</TableCell>;
        })}
      </TableRow>
      {expandedRows.has('cfBaseFees') && (() => {
        const propCategoryMap: Record<string, Set<string>> = {};
        for (const month of financials) {
          const byCatByPropMonth = month.serviceFeeBreakdown?.byCategoryByPropertyId ?? {};
          for (const catName of Object.keys(byCatByPropMonth)) {
            for (const pId of Object.keys(byCatByPropMonth[catName] ?? {})) {
              if (!propCategoryMap[pId]) propCategoryMap[pId] = new Set();
              propCategoryMap[pId].add(catName);
            }
          }
        }
        const getCategoriesForProperty = (propId: string) => {
          return Array.from(propCategoryMap[propId] ?? []);
        };
        return properties.map((prop, idx) => {
          const propId = String(prop.id);
          const propCategories = getCategoriesForProperty(propId);
          const hasMultipleCategories = propCategories.length > 1;
          const propRowKey = `cf-prop-${propId}`;
          return (
            <React.Fragment key={propRowKey}>
              <TableRow
                className={hasMultipleCategories ? "cursor-pointer hover:bg-muted/70" : "bg-muted/50"}
                onClick={hasMultipleCategories ? () => toggleRow(propRowKey) : undefined}
                data-testid={`row-cf-property-${propId}`}
              >
                <TableCell className={`sticky left-0 ${hasMultipleCategories ? 'bg-card' : 'bg-muted/50'} pl-14 flex items-center gap-2 text-sm text-muted-foreground`}>
                  {hasMultipleCategories && (
                    expandedRows.has(propRowKey) ? (
                      <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                    )
                  )}
                  {prop.name}
                </TableCell>
                {Array.from({ length: projectionYears }, (_, y) => (
                  <TableCell key={y} className="text-right text-sm text-muted-foreground font-mono">
                    {formatMoney(getPropertyYearlyBaseFee(idx, y))}
                  </TableCell>
                ))}
              </TableRow>
              {hasMultipleCategories && expandedRows.has(propRowKey) && propCategories.map(catName => (
                <TableRow key={`cf-prop-${propId}-cat-${catName}`} className="bg-muted/30" data-testid={`row-cf-property-${propId}-category-${catName.toLowerCase().replace(/\s+/g, '-')}`}>
                  <TableCell className="sticky left-0 bg-muted/30 pl-[4.5rem] text-xs text-muted-foreground">
                    {catName}
                  </TableCell>
                  {Array.from({ length: projectionYears }, (_, y) => {
                    const yearData = financials.slice(y * MONTHS_PER_YEAR, (y + 1) * MONTHS_PER_YEAR);
                    const total = yearData.reduce((a, m) => (m.serviceFeeBreakdown?.byCategoryByPropertyId?.[catName]?.[propId] ?? 0) + a, 0);
                    return <TableCell key={y} className="text-right text-xs text-muted-foreground font-mono">{formatMoney(total)}</TableCell>;
                  })}
                </TableRow>
              ))}
            </React.Fragment>
          );
        });
      })()}
      <TableRow 
        className="cursor-pointer hover:bg-muted"
        onClick={() => toggleRow('cfIncentiveFees')}
      >
        <TableCell className="sticky left-0 bg-card flex items-center gap-2 pl-10">
          {expandedRows.has('cfIncentiveFees') ? (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          )}
          Incentive Fees
        </TableCell>
        {Array.from({ length: projectionYears }, (_, y) => {
          const yearData = financials.slice(y * MONTHS_PER_YEAR, (y + 1) * MONTHS_PER_YEAR);
          const total = yearData.reduce((a, m) => a + m.incentiveFeeRevenue, 0);
          return <TableCell key={y} className="text-right text-muted-foreground font-mono">{formatMoney(total)}</TableCell>;
        })}
      </TableRow>
      {expandedRows.has('cfIncentiveFees') && properties.map((prop) => (
        <TableRow key={`cfinc-${prop.id}`} className="bg-muted/50">
          <TableCell className="sticky left-0 bg-muted/50 pl-14 text-sm text-muted-foreground">
            {prop.name}
          </TableCell>
          {Array.from({ length: projectionYears }, (_, y) => {
            const yearData = financials.slice(y * MONTHS_PER_YEAR, (y + 1) * MONTHS_PER_YEAR);
            const total = yearData.reduce((a, m) => (m.incentiveFeeByPropertyId?.[String(prop.id)] ?? 0) + a, 0);
            return <TableCell key={y} className="text-right text-sm text-muted-foreground font-mono">{formatMoney(total)}</TableCell>;
          })}
        </TableRow>
      ))}
      <TableRow
        className="cursor-pointer hover:bg-muted"
        onClick={() => toggleRow('cfOutflows')}
      >
        <TableCell className="sticky left-0 bg-card flex items-center gap-2 pl-6">
          {expandedRows.has('cfOutflows') ? (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          )}
          Cash Paid for Operating Expenses
        </TableCell>
        {Array.from({ length: projectionYears }, (_, y) => {
          const yearData = financials.slice(y * MONTHS_PER_YEAR, (y + 1) * MONTHS_PER_YEAR);
          const total = yearData.reduce((a, m) => a + m.totalExpenses, 0);
          return <TableCell key={y} className="text-right font-mono">({formatMoney(total)})</TableCell>;
        })}
      </TableRow>
      {expandedRows.has('cfOutflows') && (
        <>
          <TableRow 
            className="cursor-pointer hover:bg-muted"
            onClick={() => toggleRow('cfComp')}
          >
            <TableCell className="sticky left-0 bg-card pl-6 flex items-center gap-2">
              {expandedRows.has('cfComp') ? (
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              )}
              Compensation
            </TableCell>
            {Array.from({ length: projectionYears }, (_, y) => {
              const yearData = financials.slice(y * MONTHS_PER_YEAR, (y + 1) * MONTHS_PER_YEAR);
              const total = yearData.reduce((a, m) => a + m.partnerCompensation + m.staffCompensation, 0);
              return <TableCell key={y} className="text-right text-muted-foreground font-mono">({formatMoney(total)})</TableCell>;
            })}
          </TableRow>
          {expandedRows.has('cfComp') && (
            <>
              <TableRow className="bg-muted/50">
                <TableCell className="sticky left-0 bg-muted/50 pl-12 text-sm text-muted-foreground">Partner Compensation</TableCell>
                {Array.from({ length: projectionYears }, (_, y) => {
                  const yearData = financials.slice(y * MONTHS_PER_YEAR, (y + 1) * MONTHS_PER_YEAR);
                  const total = yearData.reduce((a, m) => a + m.partnerCompensation, 0);
                  return <TableCell key={y} className="text-right text-sm text-muted-foreground font-mono">({formatMoney(total)})</TableCell>;
                })}
              </TableRow>
              <TableRow className="bg-muted/50">
                <TableCell className="sticky left-0 bg-muted/50 pl-12 text-sm text-muted-foreground">Staff Compensation</TableCell>
                {Array.from({ length: projectionYears }, (_, y) => {
                  const yearData = financials.slice(y * MONTHS_PER_YEAR, (y + 1) * MONTHS_PER_YEAR);
                  const total = yearData.reduce((a, m) => a + m.staffCompensation, 0);
                  return <TableCell key={y} className="text-right text-sm text-muted-foreground font-mono">({formatMoney(total)})</TableCell>;
                })}
              </TableRow>
            </>
          )}
          <TableRow 
            className="cursor-pointer hover:bg-muted"
            onClick={() => toggleRow('cfFixed')}
          >
            <TableCell className="sticky left-0 bg-card pl-6 flex items-center gap-2">
              {expandedRows.has('cfFixed') ? (
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              )}
              Fixed Overhead
            </TableCell>
            {Array.from({ length: projectionYears }, (_, y) => {
              const yearData = financials.slice(y * MONTHS_PER_YEAR, (y + 1) * MONTHS_PER_YEAR);
              const total = yearData.reduce((a, m) => a + m.officeLease + m.professionalServices + m.techInfrastructure + m.businessInsurance, 0);
              return <TableCell key={y} className="text-right text-muted-foreground font-mono">({formatMoney(total)})</TableCell>;
            })}
          </TableRow>
          {expandedRows.has('cfFixed') && (
            <>
              <TableRow className="bg-muted/50">
                <TableCell className="sticky left-0 bg-muted/50 pl-12 text-sm text-muted-foreground">Office Lease</TableCell>
                {Array.from({ length: projectionYears }, (_, y) => {
                  const yearData = financials.slice(y * MONTHS_PER_YEAR, (y + 1) * MONTHS_PER_YEAR);
                  const total = yearData.reduce((a, m) => a + m.officeLease, 0);
                  return <TableCell key={y} className="text-right text-sm text-muted-foreground font-mono">({formatMoney(total)})</TableCell>;
                })}
              </TableRow>
              <TableRow className="bg-muted/50">
                <TableCell className="sticky left-0 bg-muted/50 pl-12 text-sm text-muted-foreground">Professional Services</TableCell>
                {Array.from({ length: projectionYears }, (_, y) => {
                  const yearData = financials.slice(y * MONTHS_PER_YEAR, (y + 1) * MONTHS_PER_YEAR);
                  const total = yearData.reduce((a, m) => a + m.professionalServices, 0);
                  return <TableCell key={y} className="text-right text-sm text-muted-foreground font-mono">({formatMoney(total)})</TableCell>;
                })}
              </TableRow>
              <TableRow className="bg-muted/50">
                <TableCell className="sticky left-0 bg-muted/50 pl-12 text-sm text-muted-foreground">Tech Infrastructure</TableCell>
                {Array.from({ length: projectionYears }, (_, y) => {
                  const yearData = financials.slice(y * MONTHS_PER_YEAR, (y + 1) * MONTHS_PER_YEAR);
                  const total = yearData.reduce((a, m) => a + m.techInfrastructure, 0);
                  return <TableCell key={y} className="text-right text-sm text-muted-foreground font-mono">({formatMoney(total)})</TableCell>;
                })}
              </TableRow>
              <TableRow className="bg-muted/50">
                <TableCell className="sticky left-0 bg-muted/50 pl-12 text-sm text-muted-foreground">Business Insurance</TableCell>
                {Array.from({ length: projectionYears }, (_, y) => {
                  const yearData = financials.slice(y * MONTHS_PER_YEAR, (y + 1) * MONTHS_PER_YEAR);
                  const total = yearData.reduce((a, m) => a + m.businessInsurance, 0);
                  return <TableCell key={y} className="text-right text-sm text-muted-foreground font-mono">({formatMoney(total)})</TableCell>;
                })}
              </TableRow>
            </>
          )}
          <TableRow 
            className="cursor-pointer hover:bg-muted"
            onClick={() => toggleRow('cfVar')}
          >
            <TableCell className="sticky left-0 bg-card pl-6 flex items-center gap-2">
              {expandedRows.has('cfVar') ? (
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              )}
              Variable Costs
            </TableCell>
            {Array.from({ length: projectionYears }, (_, y) => {
              const yearData = financials.slice(y * MONTHS_PER_YEAR, (y + 1) * MONTHS_PER_YEAR);
              const total = yearData.reduce((a, m) => a + m.travelCosts + m.itLicensing + m.marketing + m.miscOps, 0);
              return <TableCell key={y} className="text-right text-muted-foreground font-mono">({formatMoney(total)})</TableCell>;
            })}
          </TableRow>
          {expandedRows.has('cfVar') && (
            <>
              <TableRow className="bg-muted/50">
                <TableCell className="sticky left-0 bg-muted/50 pl-12 text-sm text-muted-foreground">Travel Costs</TableCell>
                {Array.from({ length: projectionYears }, (_, y) => {
                  const yearData = financials.slice(y * MONTHS_PER_YEAR, (y + 1) * MONTHS_PER_YEAR);
                  const total = yearData.reduce((a, m) => a + m.travelCosts, 0);
                  return <TableCell key={y} className="text-right text-sm text-muted-foreground font-mono">({formatMoney(total)})</TableCell>;
                })}
              </TableRow>
              <TableRow className="bg-muted/50">
                <TableCell className="sticky left-0 bg-muted/50 pl-12 text-sm text-muted-foreground">IT Licensing</TableCell>
                {Array.from({ length: projectionYears }, (_, y) => {
                  const yearData = financials.slice(y * MONTHS_PER_YEAR, (y + 1) * MONTHS_PER_YEAR);
                  const total = yearData.reduce((a, m) => a + m.itLicensing, 0);
                  return <TableCell key={y} className="text-right text-sm text-muted-foreground font-mono">({formatMoney(total)})</TableCell>;
                })}
              </TableRow>
              <TableRow className="bg-muted/50">
                <TableCell className="sticky left-0 bg-muted/50 pl-12 text-sm text-muted-foreground">Marketing</TableCell>
                {Array.from({ length: projectionYears }, (_, y) => {
                  const yearData = financials.slice(y * MONTHS_PER_YEAR, (y + 1) * MONTHS_PER_YEAR);
                  const total = yearData.reduce((a, m) => a + m.marketing, 0);
                  return <TableCell key={y} className="text-right text-sm text-muted-foreground font-mono">({formatMoney(total)})</TableCell>;
                })}
              </TableRow>
              <TableRow className="bg-muted/50">
                <TableCell className="sticky left-0 bg-muted/50 pl-12 text-sm text-muted-foreground">Misc Operations</TableCell>
                {Array.from({ length: projectionYears }, (_, y) => {
                  const yearData = financials.slice(y * MONTHS_PER_YEAR, (y + 1) * MONTHS_PER_YEAR);
                  const total = yearData.reduce((a, m) => a + m.miscOps, 0);
                  return <TableCell key={y} className="text-right text-sm text-muted-foreground font-mono">({formatMoney(total)})</TableCell>;
                })}
              </TableRow>
            </>
          )}
        </>
      )}

      <TableRow className="border-t-2 border-border font-semibold">
        <TableCell className="sticky left-0 bg-card">Net Cash from Operating Activities</TableCell>
        {Array.from({ length: projectionYears }, (_, y) => {
          const yearData = financials.slice(y * MONTHS_PER_YEAR, (y + 1) * MONTHS_PER_YEAR);
          const netIncome = yearData.reduce((a, m) => a + m.netIncome, 0);
          const interestAddback = yearData.reduce((a, m) => a + (m.fundingInterestExpense ?? 0), 0);
          const total = netIncome + interestAddback;
          return (
            <TableCell key={y} className={`text-right font-mono ${total < 0 ? 'text-destructive' : ''}`}>
              {formatMoney(total)}
            </TableCell>
          );
        })}
      </TableRow>
      {financials.some(m => (m.fundingInterestExpense ?? 0) > 0) && (
        <TableRow>
          <TableCell className="sticky left-0 bg-card pl-6 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              Add Back: Interest Expense
              <InfoTooltip text="Interest expense is reclassified from operating to financing activities. The full amount is added back here and interest payments appear in financing cash flow." />
            </span>
          </TableCell>
          {Array.from({ length: projectionYears }, (_, y) => {
            const yearData = financials.slice(y * MONTHS_PER_YEAR, (y + 1) * MONTHS_PER_YEAR);
            const interestAddback = yearData.reduce((a, m) => a + (m.fundingInterestExpense ?? 0), 0);
            return (
              <TableCell key={y} className="text-right text-sm text-muted-foreground font-mono">
                {interestAddback > 0 ? formatMoney(interestAddback) : '-'}
              </TableCell>
            );
          })}
        </TableRow>
      )}
      <FormulaRow
        rowKey="formula-operatingCF"
        label={
          financials.some(m => (m.fundingInterestExpense ?? 0) > 0)
            ? (financials.some(m => m.totalVendorCost > 0) ? "= Revenue − Vendor Costs − Expenses − Tax + Interest Addback" : "= Net Income + Interest Expense Addback")
            : (financials.some(m => m.totalVendorCost > 0) ? "= Revenue − Vendor Costs − Expenses − Tax" : "= Total Revenue − Total Expenses − Tax")
        }
        values={Array.from({ length: projectionYears }, (_, y) => {
          const yearData = financials.slice(y * MONTHS_PER_YEAR, (y + 1) * MONTHS_PER_YEAR);
          const netIncome = yearData.reduce((a, m) => a + m.netIncome, 0);
          const interestAddback = yearData.reduce((a, m) => a + (m.fundingInterestExpense ?? 0), 0);
          return formatMoney(netIncome + interestAddback);
        })}
      />
      <TableRow>
        <TableCell className="sticky left-0 bg-card text-xs text-muted-foreground italic pl-6">
          <span className="flex items-center gap-1">
            % of Revenue
            <InfoTooltip text="Operating Cash Flow as a percentage of Total Revenue. Indicates how much of revenue converts to cash." />
          </span>
        </TableCell>
        {Array.from({ length: projectionYears }, (_, y) => {
          const yearData = financials.slice(y * MONTHS_PER_YEAR, (y + 1) * MONTHS_PER_YEAR);
          const netIncome = yearData.reduce((a, m) => a + m.netIncome, 0);
          const interestAddback = yearData.reduce((a, m) => a + (m.fundingInterestExpense ?? 0), 0);
          const cashFromOps = netIncome + interestAddback;
          const totalRevenue = yearData.reduce((a, m) => a + m.totalRevenue, 0);
          const pct = totalRevenue > 0 ? (cashFromOps / totalRevenue) * 100 : 0;
          return (
            <TableCell key={y} className="text-right text-xs text-muted-foreground italic font-mono px-2">
              {totalRevenue > 0 ? `${pct.toFixed(1)}%` : "—"}
            </TableCell>
          );
        })}
      </TableRow>
    </>
  );
}
