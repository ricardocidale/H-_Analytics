import React from "react";
import { formatMoney } from "@/lib/financialEngine";
import { MONTHS_PER_YEAR } from "@/lib/constants";
import { TableRow, TableCell } from "@/components/ui/table";
import { ChevronRight, ChevronDown } from "@/components/icons/themed-icons";
import { FormulaRow, getPropertyYearlyBaseFee, type IncomeRowsProps } from "./income-helpers";

export default function IncomeRevenueRows({
  financials,
  properties,
  projectionYears,
  expandedRows,
  toggleRow,
  propertyFinancials,
}: IncomeRowsProps) {
  return (
    <>
      <TableRow className="bg-muted font-semibold border-border">
        <TableCell className="sticky left-0 bg-muted text-foreground">Revenue</TableCell>
        {Array.from({ length: projectionYears }, (_, y) => {
          const yearData = financials.slice(y * MONTHS_PER_YEAR, (y + 1) * MONTHS_PER_YEAR);
          const total = yearData.reduce((a, m) => a + m.totalRevenue, 0);
          return <TableCell key={y} className="text-right font-mono">{formatMoney(total)}</TableCell>;
        })}
      </TableRow>
      <FormulaRow
        rowKey="formula-totalRevenue"
        label="= Service Fees + Incentive Fees + Other Revenue"
        projectionYears={projectionYears}
        expandedRows={expandedRows}
        toggleRow={toggleRow}
        values={Array.from({ length: projectionYears }, (_, y) => {
          const yearData = financials.slice(y * MONTHS_PER_YEAR, (y + 1) * MONTHS_PER_YEAR);
          const base = yearData.reduce((a, m) => a + m.baseFeeRevenue, 0);
          const incentive = yearData.reduce((a, m) => a + m.incentiveFeeRevenue, 0);
          const other = yearData.reduce((a, m) => a + m.totalRevenue, 0) - base - incentive;
          if (other > 0) {
            return `${formatMoney(base)} + ${formatMoney(incentive)} + ${formatMoney(other)}`;
          }
          return `${formatMoney(base)} + ${formatMoney(incentive)}`;
        })}
      />

      <TableRow
        className="cursor-pointer hover:bg-muted"
        onClick={() => toggleRow('baseFees')}
        data-testid="row-service-fees"
      >
        <TableCell className="sticky left-0 bg-card pl-6 flex items-center gap-2">
          {expandedRows.has('baseFees') ? (
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

      {expandedRows.has('baseFees') && (() => {
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
          const propRowKey = `base-prop-${propId}`;
          return (
            <React.Fragment key={propRowKey}>
              <TableRow
                className={hasMultipleCategories ? "cursor-pointer hover:bg-muted/70" : "bg-muted/50"}
                onClick={hasMultipleCategories ? () => toggleRow(propRowKey) : undefined}
                data-testid={`row-property-${propId}`}
              >
                <TableCell className={`sticky left-0 ${hasMultipleCategories ? 'bg-card' : 'bg-muted/50'} pl-12 flex items-center gap-2 text-sm text-muted-foreground`}>
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
                    {formatMoney(getPropertyYearlyBaseFee(propertyFinancials, idx, y))}
                  </TableCell>
                ))}
              </TableRow>
              {hasMultipleCategories && expandedRows.has(propRowKey) && propCategories.map(catName => (
                <TableRow key={`base-prop-${propId}-cat-${catName}`} className="bg-muted/30" data-testid={`row-property-${propId}-category-${catName.toLowerCase().replace(/\s+/g, '-')}`}>
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
        onClick={() => toggleRow('incentiveFees')}
        data-testid="row-incentive-fees"
      >
        <TableCell className="sticky left-0 bg-card pl-6 flex items-center gap-2">
          {expandedRows.has('incentiveFees') ? (
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

      {expandedRows.has('incentiveFees') && properties.map((prop) => (
        <TableRow key={`incentive-${prop.id}`} className="bg-muted/50">
          <TableCell className="sticky left-0 bg-muted/50 pl-12 text-sm text-muted-foreground">
            {prop.name}
          </TableCell>
          {Array.from({ length: projectionYears }, (_, y) => {
            const yearData = financials.slice(y * MONTHS_PER_YEAR, (y + 1) * MONTHS_PER_YEAR);
            const total = yearData.reduce((a, m) => (m.incentiveFeeByPropertyId?.[String(prop.id)] ?? 0) + a, 0);
            return <TableCell key={y} className="text-right text-sm text-muted-foreground font-mono">{formatMoney(total)}</TableCell>;
          })}
        </TableRow>
      ))}

      {financials.some(m => m.totalVendorCost > 0) && (
        <>
          <TableRow
            className="cursor-pointer hover:bg-muted"
            onClick={() => toggleRow('vendorCosts')}
            data-testid="row-vendor-costs"
          >
            <TableCell className="sticky left-0 bg-card pl-6 flex items-center gap-2 text-muted-foreground">
              {expandedRows.has('vendorCosts') ? (
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              )}
              Cost of Centralized Services
            </TableCell>
            {Array.from({ length: projectionYears }, (_, y) => {
              const yearData = financials.slice(y * MONTHS_PER_YEAR, (y + 1) * MONTHS_PER_YEAR);
              const total = yearData.reduce((a, m) => a + m.totalVendorCost, 0);
              return <TableCell key={y} className="text-right text-muted-foreground font-mono">({formatMoney(total)})</TableCell>;
            })}
          </TableRow>
          {expandedRows.has('vendorCosts') && (() => {
            const formulaTotalKey = 'formula-vendorCosts-total';
            return (
              <>
                <TableRow
                  className="bg-primary/5 cursor-pointer hover:bg-primary/10"
                  data-expandable-row="true"
                  onClick={() => toggleRow(formulaTotalKey)}
                  data-testid="row-vendor-costs-formula-toggle"
                >
                  <TableCell className="sticky left-0 bg-primary/5 pl-10 py-0.5 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      {expandedRows.has(formulaTotalKey) ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                      <span className="italic">Aggregate Markup Formula</span>
                    </div>
                  </TableCell>
                  {Array.from({ length: projectionYears }, (_, i) => (
                    <TableCell key={i} className="py-0.5" />
                  ))}
                </TableRow>
                {expandedRows.has(formulaTotalKey) && (() => {
                  const yearlyCentralizedRevenue = Array.from({ length: projectionYears }, (_, y) => {
                    const yearData = financials.slice(y * MONTHS_PER_YEAR, (y + 1) * MONTHS_PER_YEAR);
                    return yearData.reduce((a, m) => a + (m.costOfCentralizedServices?.centralizedRevenue ?? 0), 0);
                  });
                  const yearlyTotalVendorCost = Array.from({ length: projectionYears }, (_, y) => {
                    const yearData = financials.slice(y * MONTHS_PER_YEAR, (y + 1) * MONTHS_PER_YEAR);
                    return yearData.reduce((a, m) => a + m.totalVendorCost, 0);
                  });
                  const yearlyTotalGrossProfit = yearlyCentralizedRevenue.map((rev, i) => rev - yearlyTotalVendorCost[i]);
                  return (
                    <>
                      <TableRow className="bg-primary/[0.03]" data-expandable-row="true">
                        <TableCell className="sticky left-0 bg-primary/[0.03] pl-14 py-0.5 text-xs text-muted-foreground italic">
                          Total Fee Revenue from Centralized Services
                        </TableCell>
                        {yearlyCentralizedRevenue.map((v, i) => (
                          <TableCell key={i} className="text-right py-0.5 font-mono text-xs text-muted-foreground">
                            {formatMoney(v)}
                          </TableCell>
                        ))}
                      </TableRow>
                      <TableRow className="bg-primary/[0.03]" data-expandable-row="true">
                        <TableCell className="sticky left-0 bg-primary/[0.03] pl-14 py-0.5 text-xs text-muted-foreground italic">
                          − Total Vendor Cost
                        </TableCell>
                        {yearlyTotalVendorCost.map((v, i) => (
                          <TableCell key={i} className="text-right py-0.5 font-mono text-xs text-destructive">
                            ({formatMoney(v)})
                          </TableCell>
                        ))}
                      </TableRow>
                      <TableRow className="bg-primary/[0.03]" data-expandable-row="true">
                        <TableCell className="sticky left-0 bg-primary/[0.03] pl-14 py-0.5 text-xs text-muted-foreground italic">
                          = Total Gross Profit
                        </TableCell>
                        {yearlyTotalGrossProfit.map((v, i) => (
                          <TableCell key={i} className="text-right py-0.5 font-mono text-xs text-accent">
                            {formatMoney(v)}
                          </TableCell>
                        ))}
                      </TableRow>
                    </>
                  );
                })()}
              </>
            );
          })()}
          {expandedRows.has('vendorCosts') && (() => {
            const costData = financials.find(m => m.costOfCentralizedServices)?.costOfCentralizedServices;
            if (!costData) return null;
            return Object.entries(costData.byCategory)
              .filter(([, v]) => v.serviceModel === 'centralized')
              .map(([catName]) => {
                const formulaKey = `formula-vendor-${catName}`;
                return (
                  <React.Fragment key={`vendor-${catName}`}>
                    <TableRow
                      className="bg-muted/30 cursor-pointer hover:bg-muted/50"
                      onClick={() => toggleRow(formulaKey)}
                      data-testid={`row-vendor-${catName}`}
                    >
                      <TableCell className="sticky left-0 bg-muted/30 pl-12 text-sm text-muted-foreground flex items-center gap-2">
                        {expandedRows.has(formulaKey) ? (
                          <ChevronDown className="w-3 h-3 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="w-3 h-3 text-muted-foreground" />
                        )}
                        {catName}
                      </TableCell>
                      {Array.from({ length: projectionYears }, (_, y) => {
                        const yearData = financials.slice(y * MONTHS_PER_YEAR, (y + 1) * MONTHS_PER_YEAR);
                        const total = yearData.reduce((a, m) => {
                          const cat = m.costOfCentralizedServices?.byCategory?.[catName];
                          return a + (cat?.vendorCost ?? 0);
                        }, 0);
                        return <TableCell key={y} className="text-right text-sm text-muted-foreground font-mono">({formatMoney(total)})</TableCell>;
                      })}
                    </TableRow>
                    {expandedRows.has(formulaKey) && (() => {
                      const cat = costData.byCategory[catName];
                      if (!cat) return null;
                      const yearlyRevenue = Array.from({ length: projectionYears }, (_, y) => {
                        const yearData = financials.slice(y * MONTHS_PER_YEAR, (y + 1) * MONTHS_PER_YEAR);
                        return yearData.reduce((a, m) => a + (m.costOfCentralizedServices?.byCategory?.[catName]?.revenue ?? 0), 0);
                      });
                      const yearlyVendorCost = Array.from({ length: projectionYears }, (_, y) => {
                        const yearData = financials.slice(y * MONTHS_PER_YEAR, (y + 1) * MONTHS_PER_YEAR);
                        return yearData.reduce((a, m) => a + (m.costOfCentralizedServices?.byCategory?.[catName]?.vendorCost ?? 0), 0);
                      });
                      const yearlyGrossProfit = Array.from({ length: projectionYears }, (_, y) => {
                        const yearData = financials.slice(y * MONTHS_PER_YEAR, (y + 1) * MONTHS_PER_YEAR);
                        return yearData.reduce((a, m) => a + (m.costOfCentralizedServices?.byCategory?.[catName]?.grossProfit ?? 0), 0);
                      });
                      const markupPct = cat.markup;
                      return (
                        <>
                          <TableRow className="bg-primary/5" data-expandable-row="true">
                            <TableCell className="sticky left-0 bg-primary/5 pl-16 py-0.5 text-xs text-muted-foreground italic">
                              Fee Charged to Property
                            </TableCell>
                            {yearlyRevenue.map((v, i) => (
                              <TableCell key={i} className="text-right py-0.5 font-mono text-xs text-muted-foreground">
                                {formatMoney(v)}
                              </TableCell>
                            ))}
                          </TableRow>
                          <TableRow className="bg-primary/5" data-expandable-row="true">
                            <TableCell className="sticky left-0 bg-primary/5 pl-16 py-0.5 text-xs text-muted-foreground italic">
                              Markup Rate: {(markupPct * 100).toFixed(0)}%
                            </TableCell>
                            {Array.from({ length: projectionYears }, (_, i) => (
                              <TableCell key={i} className="py-0.5" />
                            ))}
                          </TableRow>
                          <TableRow className="bg-primary/5" data-expandable-row="true">
                            <TableCell className="sticky left-0 bg-primary/5 pl-16 py-0.5 text-xs text-muted-foreground italic">
                              Vendor Cost = Fee ÷ (1 + {(markupPct * 100).toFixed(0)}%)
                            </TableCell>
                            {yearlyVendorCost.map((v, i) => (
                              <TableCell key={i} className="text-right py-0.5 font-mono text-xs text-destructive">
                                ({formatMoney(v)})
                              </TableCell>
                            ))}
                          </TableRow>
                          <TableRow className="bg-primary/5" data-expandable-row="true">
                            <TableCell className="sticky left-0 bg-primary/5 pl-16 py-0.5 text-xs text-muted-foreground italic">
                              Markup Margin = Fee − Vendor Cost
                            </TableCell>
                            {yearlyGrossProfit.map((v, i) => (
                              <TableCell key={i} className="text-right py-0.5 font-mono text-xs text-accent">
                                {formatMoney(v)}
                              </TableCell>
                            ))}
                          </TableRow>
                        </>
                      );
                    })()}
                  </React.Fragment>
                );
              });
          })()}
          <TableRow className="bg-primary/10 font-semibold border-border">
            <TableCell className="sticky left-0 bg-primary/10 text-foreground">Gross Profit</TableCell>
            {Array.from({ length: projectionYears }, (_, y) => {
              const yearData = financials.slice(y * MONTHS_PER_YEAR, (y + 1) * MONTHS_PER_YEAR);
              const total = yearData.reduce((a, m) => a + m.grossProfit, 0);
              return <TableCell key={y} className="text-right text-foreground font-mono">{formatMoney(total)}</TableCell>;
            })}
          </TableRow>
        </>
      )}
    </>
  );
}
