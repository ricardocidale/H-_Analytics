import React from "react";
import { TableCell, TableRow } from "@/components/ui/table";
import { ChevronRight, ChevronDown } from "@/components/icons/themed-icons";
import { formatMoney } from "@/lib/financialEngine";
import type { AssetsSectionProps } from "./balance-sheet-helpers";

export function AssetsSection({
  years, properties, expandedRows, expandedFormulas, toggleRow, toggleFormula,
  perPropertyByYear, consolidatedTotalAssets, consolidatedCash, consolidatedPPE,
  consolidatedAccDep, consolidatedDeferredFC, consolidatedNetFixed,
}: AssetsSectionProps) {
  return (
    <>
      <TableRow className="bg-muted/20 font-bold" onClick={() => toggleRow("assets")} style={{ cursor: 'pointer' }} data-testid="row-assets-header">
        <TableCell className="sticky left-0 bg-card z-10">
          <div className="flex items-center gap-2">
            {expandedRows.has("assets") ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            TOTAL ASSETS
          </div>
        </TableCell>
        {consolidatedTotalAssets.map((val, i) => (
          <TableCell key={i} className="text-right font-mono">{formatMoney(val)}</TableCell>
        ))}
      </TableRow>
      {expandedRows.has("assets") && (
        <>
          <TableRow
            className="bg-primary/5 cursor-pointer hover:bg-primary/10"
            data-expandable-row="true"
            onClick={() => toggleFormula("assets-formula")}
          >
            <TableCell className="pl-10 sticky left-0 bg-primary/5 z-10 py-1 text-sm text-muted-foreground">
              <div className="flex items-center gap-1.5">
                {expandedFormulas.has("assets-formula") ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                <span className="italic">Formula</span>
              </div>
            </TableCell>
            {consolidatedTotalAssets.map((_, i) => (
              <TableCell key={i} className="py-0.5" />
            ))}
          </TableRow>
          {expandedFormulas.has("assets-formula") && (
            <TableRow className="bg-primary/[0.03]" data-expandable-row="true">
              <TableCell className="pl-14 sticky left-0 bg-primary/[0.03] z-10 py-1 text-sm text-muted-foreground italic">
                = Current Assets + Net Fixed Assets + Other Assets
              </TableCell>
              {consolidatedTotalAssets.map((val, i) => (
                <TableCell key={i} className="text-right font-mono text-sm text-foreground py-1">
                  {formatMoney(val)}
                </TableCell>
              ))}
            </TableRow>
          )}

          <TableRow data-testid="row-bs-current-assets-header">
            <TableCell className="pl-10 sticky left-0 bg-card z-10 text-sm font-semibold">Current Assets</TableCell>
            {years.map((_, i) => (<TableCell key={i} />))}
          </TableRow>

          <TableRow
            className="cursor-pointer hover:bg-muted/10"
            onClick={() => toggleFormula("cash-detail")}
            data-testid="row-bs-cash"
          >
            <TableCell className="pl-14 sticky left-0 bg-card z-10 text-sm text-muted-foreground">
              <div className="flex items-center gap-1.5">
                {expandedFormulas.has("cash-detail") ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                Cash & Cash Equivalents
              </div>
            </TableCell>
            {consolidatedCash.map((val, i) => (
              <TableCell key={i} className="text-right font-mono text-sm text-muted-foreground">{formatMoney(val)}</TableCell>
            ))}
          </TableRow>
          {expandedFormulas.has("cash-detail") && (
            <>
              <TableRow className="bg-primary/[0.03]" data-expandable-row="true">
                <TableCell className="pl-[72px] sticky left-0 bg-primary/[0.03] z-10 py-1 text-sm text-muted-foreground italic">
                  = Operating Reserves + Cumulative Cash Flow + Refinancing Proceeds
                </TableCell>
                {consolidatedCash.map((val, i) => (
                  <TableCell key={i} className="text-right font-mono text-sm text-foreground py-1">{formatMoney(val)}</TableCell>
                ))}
              </TableRow>
              {properties.map((prop, idx) => (
                <TableRow key={idx} data-expandable-row="true">
                  <TableCell className="pl-[72px] sticky left-0 bg-card z-10 text-muted-foreground text-xs">{prop.name}</TableCell>
                  {years.map((_, y) => (
                    <TableCell key={y} className="text-right font-mono text-muted-foreground text-xs">
                      {formatMoney(perPropertyByYear[y]?.get(idx)?.cash ?? 0)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </>
          )}

          <TableRow data-testid="row-bs-total-current-assets">
            <TableCell className="pl-10 sticky left-0 bg-card z-10 text-sm font-semibold border-t">Total Current Assets</TableCell>
            {consolidatedCash.map((val, i) => (
              <TableCell key={i} className="text-right font-mono text-sm font-semibold border-t">{formatMoney(val)}</TableCell>
            ))}
          </TableRow>

          <TableRow data-testid="row-bs-fixed-assets-header">
            <TableCell className="pl-10 sticky left-0 bg-card z-10 text-sm font-semibold">Fixed Assets</TableCell>
            {years.map((_, i) => (<TableCell key={i} />))}
          </TableRow>

          <TableRow
            className="cursor-pointer hover:bg-muted/10"
            onClick={() => toggleFormula("ppe-detail")}
            data-testid="row-bs-ppe"
          >
            <TableCell className="pl-14 sticky left-0 bg-card z-10 text-sm text-muted-foreground">
              <div className="flex items-center gap-1.5">
                {expandedFormulas.has("ppe-detail") ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                Property, Plant & Equipment
              </div>
            </TableCell>
            {consolidatedPPE.map((val, i) => (
              <TableCell key={i} className="text-right font-mono text-sm text-muted-foreground">{formatMoney(val)}</TableCell>
            ))}
          </TableRow>
          {expandedFormulas.has("ppe-detail") && properties.map((prop, idx) => (
            <TableRow key={idx} data-expandable-row="true">
              <TableCell className="pl-[72px] sticky left-0 bg-card z-10 text-muted-foreground text-xs">{prop.name}</TableCell>
              {years.map((_, y) => (
                <TableCell key={y} className="text-right font-mono text-muted-foreground text-xs">
                  {formatMoney(perPropertyByYear[y]?.get(idx)?.ppe ?? 0)}
                </TableCell>
              ))}
            </TableRow>
          ))}

          <TableRow
            className="cursor-pointer hover:bg-muted/10"
            onClick={() => toggleFormula("accdep-detail")}
            data-testid="row-bs-accdep"
          >
            <TableCell className="pl-14 sticky left-0 bg-card z-10 text-sm text-muted-foreground">
              <div className="flex items-center gap-1.5">
                {expandedFormulas.has("accdep-detail") ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                Less: Accumulated Depreciation
              </div>
            </TableCell>
            {consolidatedAccDep.map((val, i) => (
              <TableCell key={i} className="text-right font-mono text-sm text-muted-foreground">{formatMoney(-val)}</TableCell>
            ))}
          </TableRow>
          {expandedFormulas.has("accdep-detail") && (
            <>
              <TableRow className="bg-primary/[0.03]" data-expandable-row="true">
                <TableCell className="pl-[72px] sticky left-0 bg-primary/[0.03] z-10 py-1 text-sm text-muted-foreground italic">
                  Straight-line over 39 years (ASC 360)
                </TableCell>
                {consolidatedAccDep.map((val, i) => (
                  <TableCell key={i} className="text-right font-mono text-sm text-foreground py-1">{formatMoney(-val)}</TableCell>
                ))}
              </TableRow>
              {properties.map((prop, idx) => (
                <TableRow key={idx} data-expandable-row="true">
                  <TableCell className="pl-[72px] sticky left-0 bg-card z-10 text-muted-foreground text-xs">{prop.name}</TableCell>
                  {years.map((_, y) => (
                    <TableCell key={y} className="text-right font-mono text-muted-foreground text-xs">
                      {formatMoney(-(perPropertyByYear[y]?.get(idx)?.accDep ?? 0))}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </>
          )}

          <TableRow data-testid="row-bs-net-fixed-assets">
            <TableCell className="pl-10 sticky left-0 bg-card z-10 text-sm font-semibold border-t">Net Fixed Assets</TableCell>
            {consolidatedNetFixed.map((val, i) => (
              <TableCell key={i} className="text-right font-mono text-sm font-semibold border-t">{formatMoney(val)}</TableCell>
            ))}
          </TableRow>

          {consolidatedDeferredFC.some(v => v > 0) && (
            <>
              <TableRow data-testid="row-bs-other-assets-header">
                <TableCell className="pl-10 sticky left-0 bg-card z-10 text-sm font-semibold">Other Assets</TableCell>
                {years.map((_, i) => (<TableCell key={i} />))}
              </TableRow>

              <TableRow
                className="cursor-pointer hover:bg-muted/10"
                onClick={() => toggleFormula("deferredfc-detail")}
                data-testid="row-bs-deferred-financing"
              >
                <TableCell className="pl-14 sticky left-0 bg-card z-10 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    {expandedFormulas.has("deferredfc-detail") ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    Deferred Financing Costs
                  </div>
                </TableCell>
                {consolidatedDeferredFC.map((val, i) => (
                  <TableCell key={i} className="text-right font-mono text-sm text-muted-foreground">{formatMoney(val)}</TableCell>
                ))}
              </TableRow>
              {expandedFormulas.has("deferredfc-detail") && (
                <>
                  <TableRow className="bg-primary/[0.03]" data-expandable-row="true">
                    <TableCell className="pl-[72px] sticky left-0 bg-primary/[0.03] z-10 py-1 text-sm text-muted-foreground italic">
                      Refinancing closing costs capitalized per ASC 835-30
                    </TableCell>
                    {consolidatedDeferredFC.map((val, i) => (
                      <TableCell key={i} className="text-right font-mono text-sm text-foreground py-1">{formatMoney(val)}</TableCell>
                    ))}
                  </TableRow>
                  {properties.map((prop, idx) => {
                    const hasAny = years.some((_, y) => (perPropertyByYear[y]?.get(idx)?.deferredFinancing ?? 0) > 0);
                    if (!hasAny) return null;
                    return (
                      <TableRow key={idx} data-expandable-row="true">
                        <TableCell className="pl-[72px] sticky left-0 bg-card z-10 text-muted-foreground text-xs">{prop.name}</TableCell>
                        {years.map((_, y) => (
                          <TableCell key={y} className="text-right font-mono text-muted-foreground text-xs">
                            {formatMoney(perPropertyByYear[y]?.get(idx)?.deferredFinancing ?? 0)}
                          </TableCell>
                        ))}
                      </TableRow>
                    );
                  })}
                </>
              )}
            </>
          )}

          <TableRow
            className="cursor-pointer hover:bg-muted/10"
            onClick={() => toggleFormula("assets-by-entity")}
            data-testid="row-bs-assets-by-entity"
          >
            <TableCell className="pl-10 sticky left-0 bg-card z-10 text-sm text-muted-foreground">
              <div className="flex items-center gap-1.5">
                {expandedFormulas.has("assets-by-entity") ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                Assets by Entity (SPV)
              </div>
            </TableCell>
            {consolidatedTotalAssets.map((val, i) => (
              <TableCell key={i} className="text-right font-mono text-sm text-muted-foreground">{formatMoney(val)}</TableCell>
            ))}
          </TableRow>
          {expandedFormulas.has("assets-by-entity") && properties.map((prop, idx) => (
            <TableRow key={idx} data-expandable-row="true">
              <TableCell className="pl-14 sticky left-0 bg-card z-10 text-muted-foreground text-xs">{prop.name}</TableCell>
              {years.map((_, y) => (
                <TableCell key={y} className="text-right font-mono text-muted-foreground text-xs">
                  {formatMoney(perPropertyByYear[y]?.get(idx)?.totalAssets ?? 0)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </>
      )}
    </>
  );
}
