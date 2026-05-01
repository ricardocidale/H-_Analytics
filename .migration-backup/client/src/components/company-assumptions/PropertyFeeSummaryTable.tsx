import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { IconTrending } from "@/components/icons";
import { formatPercent } from "@/lib/financialEngine";
import { Badge } from "@/components/ui/badge";
import {
  DEFAULT_BASE_MANAGEMENT_FEE_RATE,
  DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE,
} from "@/lib/constants";
import type { PortfolioPropertySummary } from "./types";
import type { FeeCategoryResponse } from "@/lib/api";

interface PropertyFeeSummaryTableProps {
  properties: PortfolioPropertySummary[];
  allFeeCategories: FeeCategoryResponse[];
}

export function PropertyFeeSummaryTable({ properties, allFeeCategories }: PropertyFeeSummaryTableProps) {
  const allCatNames = Array.from(new Set(allFeeCategories.filter(c => c.isActive).map(c => c.name)));
  const hasCategoryData = allCatNames.length > 0;

  return (
    <Card className="bg-card border border-border/80 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
          <IconTrending className="w-4 h-4 text-muted-foreground" />
          Per-Property Fee Summary
          <InfoTooltip text="Read-only view of fee rates across the portfolio. Each property inherits defaults from service categories above but can override them individually. Click a property name to edit its rates." />
        </CardTitle>
        <CardDescription className="label-text">
          Current fee rates for each property. Edit rates on each property's assumptions page.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="table-property-fee-summary">
              <thead>
                <tr className="bg-primary/10 border-b border-border">
                  <th className="text-left px-4 py-2 font-semibold text-foreground whitespace-nowrap">Property</th>
                  {hasCategoryData ? (
                    <>
                      {allCatNames.map(name => (
                        <th key={name} className="text-right px-3 py-2 font-semibold text-foreground whitespace-nowrap text-xs">{name}</th>
                      ))}
                      <th className="text-right px-3 py-2 font-semibold text-foreground whitespace-nowrap">Total Service</th>
                    </>
                  ) : (
                    <th className="text-right px-4 py-2 font-semibold text-foreground">Base Fee (% of Revenue)</th>
                  )}
                  <th className="text-right px-4 py-2 font-semibold text-foreground whitespace-nowrap">Incentive (% of GOP)</th>
                </tr>
              </thead>
              <tbody>
                {properties.length === 0 ? (
                  <tr><td colSpan={hasCategoryData ? allCatNames.length + 3 : 3} className="px-4 py-3 text-center text-muted-foreground">No properties configured</td></tr>
                ) : (
                  properties.map((prop) => {
                    const isInactive = prop.isActive === false;
                    const propCats = allFeeCategories.filter(c => c.propertyId === prop.id);
                    const propTotalServiceRate = propCats.filter(c => c.isActive).reduce((sum, c) => sum + c.rate, 0);
                    return (
                      <tr key={prop.id} className={`border-b border-primary/10 last:border-b-0 ${isInactive ? 'opacity-60 saturate-50' : 'hover:bg-primary/5'}`} data-testid={`row-fee-property-${prop.id}`}>
                        <td className="px-4 py-2 text-foreground whitespace-nowrap">
                          <span className="flex items-center gap-2">
                            <Link href={`/property/${prop.id}/edit`} className={`hover:underline ${isInactive ? 'text-muted-foreground' : 'text-primary'}`}>{prop.name}</Link>
                            {isInactive && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400" data-testid={`badge-excluded-${prop.id}`}>
                                Excluded
                              </Badge>
                            )}
                          </span>
                        </td>
                        {hasCategoryData ? (
                          <>
                            {allCatNames.map(name => {
                              const cat = propCats.find(c => c.name === name && c.isActive);
                              return (
                                <td key={name} className="px-3 py-2 text-right font-mono text-xs text-foreground">
                                  {cat ? formatPercent(cat.rate) : '—'}
                                </td>
                              );
                            })}
                            <td className="px-3 py-2 text-right font-mono font-semibold text-foreground">{formatPercent(propTotalServiceRate)}</td>
                          </>
                        ) : (
                          <td className="px-4 py-2 text-right font-mono text-foreground">{formatPercent(prop.baseManagementFeeRate ?? DEFAULT_BASE_MANAGEMENT_FEE_RATE)}</td>
                        )}
                        <td className="px-4 py-2 text-right font-mono text-foreground">{formatPercent(prop.incentiveManagementFeeRate ?? DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
