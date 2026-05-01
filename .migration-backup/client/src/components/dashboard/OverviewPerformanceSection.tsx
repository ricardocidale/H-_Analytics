import React from "react";
import { AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, CartesianGrid, LabelList } from "recharts";
import { RadialGauge } from "@/lib/charts";
import { formatMoney } from "@/lib/financialEngine";

interface PerformanceSectionProps {
  investmentHorizon: number;
  totalProperties: number;
  totalRooms: number;
  portfolioIRR: number;
  equityMultiple: number;
  cashOnCash: number;
  totalInitialEquity: number;
  totalExitValue: number;
  exitGainPercent: string;
  propertyIRRData: { name: string; fullName: string; irr: number }[];
  propertyInvestmentData: { name: string; fullName: string; investment: number }[];
  chartsRef: React.RefObject<HTMLDivElement | null>;
}

export function InvestmentPerformanceSection({
  investmentHorizon,
  totalProperties,
  totalRooms,
  portfolioIRR,
  equityMultiple,
  cashOnCash,
  totalInitialEquity,
  totalExitValue,
  exitGainPercent,
  propertyIRRData,
  propertyInvestmentData,
  chartsRef,
}: PerformanceSectionProps) {
  return (
    <AccordionItem value="performance" className="border-none">
      <div className="flex items-center gap-2 py-3 px-1">
        <AccordionTrigger className="hover:no-underline p-0">
          <span className="text-sm font-semibold text-foreground tracking-wide uppercase">Investment Performance</span>
        </AccordionTrigger>
        <InfoTooltip
          text="Key return metrics for the entire portfolio across all properties and the full hold period."
          formula="IRR = discount rate where NPV of all cash flows = 0"
          light
          side="right"
        />
      </div>
      <AccordionContent className="pt-2 pb-4">
      <div className="relative" data-export-section="investment-performance">
        <div className="text-center mb-8">
          <p className="text-foreground/50 text-sm label-text">
            <span className="font-mono">{investmentHorizon}</span>-Year Hold | <span className="font-mono">{totalProperties}</span> Properties | <span className="font-mono">{totalRooms}</span> Rooms
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 items-stretch gap-4 sm:gap-6 mb-6 sm:mb-10">
          <div className="bg-card rounded-lg p-3 sm:p-6 border border-border shadow-sm flex flex-col" data-testid="gauge-portfolio-irr" data-export-section="kpi-portfolio-irr">
            <p className="text-xs font-medium tracking-widest text-foreground/60 uppercase mb-3 text-center label-text flex items-center justify-center gap-1">
              Portfolio IRR
              <InfoTooltip text="Internal Rate of Return — the annualized return that makes the net present value of all cash flows equal to zero." formula="NPV = Σ CFₜ / (1+IRR)ᵗ = 0" light side="bottom" />
            </p>
            <div className="flex-1 flex items-center justify-center">
              <RadialGauge
                data={[{ name: "irr", value: Math.min(Math.max(portfolioIRR * 100, 0), 100), fill: "hsl(var(--accent-pop))" }]}
                config={{ irr: { label: "Portfolio IRR", color: "hsl(var(--accent-pop))" } }}
                dataKey="value"
                centerValue={`${(portfolioIRR * 100).toFixed(1)}%`}
                centerLabel="Portfolio IRR"
                endAngle={Math.min(Math.max(portfolioIRR * 100, 0), 100) * 3.6}
                innerRadius={70}
                outerRadius={110}
                className="mx-auto aspect-square max-h-[180px] sm:max-h-[220px] w-full"
              />
            </div>
            <div className="text-center" data-testid="text-portfolio-irr">
              <span className="sr-only">{(portfolioIRR * 100).toFixed(1)}%</span>
            </div>
          </div>

          <div ref={chartsRef} className="bg-card rounded-lg p-3 sm:p-6 border border-border shadow-sm flex flex-col" data-testid="chart-property-irr-comparison" data-export-section="kpi-property-irr">
            <p className="text-xs font-medium tracking-widest text-foreground/60 uppercase mb-3 text-center label-text">Property IRR Comparison</p>
            <ChartContainer config={{ irr: { label: "IRR", color: "var(--chart-1)" } } satisfies ChartConfig} className="h-[180px] sm:h-[200px] w-full">
              <BarChart data={propertyIRRData} margin={{ top: 20, right: 5, left: 0, bottom: 30 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="name" tickLine={false} tickMargin={8} axisLine={false} angle={-30} textAnchor="end" height={45} tick={{ fontSize: 9 }} />
                <ChartTooltip
                  cursor={false}
                  content={<ChartTooltipContent
                    hideLabel
                    formatter={(value) => [`${Number(value).toFixed(1)}%`, 'IRR']}
                  />}
                />
                <Bar dataKey="irr" fill="var(--color-irr)" radius={8} maxBarSize={44}>
                  <LabelList position="top" offset={12} className="fill-foreground" fontSize={12} formatter={(v: number) => `${v}%`} />
                </Bar>
              </BarChart>
            </ChartContainer>
          </div>

          <div className="bg-card rounded-lg p-3 sm:p-6 border border-border shadow-sm flex flex-col" data-testid="chart-property-investment" data-export-section="kpi-equity-by-property">
            <p className="text-xs font-medium tracking-widest text-foreground/60 uppercase mb-3 text-center label-text">Equity by Property</p>
            <ChartContainer config={{ investment: { label: "Equity Invested", color: "var(--chart-2)" } } satisfies ChartConfig} className="h-[180px] sm:h-[200px] w-full">
              <BarChart data={propertyInvestmentData} margin={{ top: 20, right: 5, left: 0, bottom: 30 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="name" tickLine={false} tickMargin={8} axisLine={false} angle={-30} textAnchor="end" height={45} tick={{ fontSize: 9 }} />
                <ChartTooltip
                  cursor={false}
                  content={<ChartTooltipContent
                    hideLabel
                    formatter={(value) => { const num = Number(value); return [`$${Number.isFinite(num) ? num.toLocaleString("en-US") : "0"}`, 'Equity']; }}
                  />}
                />
                <Bar dataKey="investment" fill="var(--color-investment)" radius={8} maxBarSize={44}>
                  <LabelList position="top" offset={12} className="fill-foreground" fontSize={11} formatter={(v: number) => v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1)}M` : `$${(v / 1_000).toFixed(0)}K`} />
                </Bar>
              </BarChart>
            </ChartContainer>
          </div>
        </div>

        <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4" data-export-section="kpi-metrics-grid">
          <div className="bg-card rounded-lg p-3 sm:p-5 border border-border shadow-sm transition-all duration-300">
            <div className="flex items-center gap-2 sm:gap-4 mb-3">
              <div className="relative w-10 h-10 sm:w-14 sm:h-14 flex-shrink-0">
                <svg className="w-10 h-10 sm:w-14 sm:h-14" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="40" fill="none" stroke="hsl(var(--muted))" strokeWidth="6" />
                  <circle
                    cx="50" cy="50" r="40" fill="none" stroke="hsl(var(--accent-pop))" strokeWidth="6"
                    strokeDasharray={`${Math.min(equityMultiple * 63, 251)} 251`}
                    strokeLinecap="round"
                    transform="rotate(-90 50 50)"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-[10px] sm:text-sm font-bold text-foreground font-mono">{equityMultiple.toFixed(1)}x</span>
                </div>
              </div>
              <div className="min-w-0">
                <p className="text-lg sm:text-2xl font-bold text-primary font-mono" data-testid="text-equity-multiple">{equityMultiple.toFixed(2)}x</p>
                <p className="text-xs sm:text-sm text-foreground/60 label-text flex items-center">Equity Multiple<InfoTooltip text="Total cash returned divided by total equity invested. A 2.0x multiple means investors received $2 for every $1 invested." formula="EM = (Total Distributions + Exit Value) / Total Equity" light side="right" /></p>
              </div>
            </div>
          </div>

          <div className="bg-card rounded-lg p-3 sm:p-5 border border-border shadow-sm transition-all duration-300">
            <div className="flex items-center gap-2 sm:gap-4 mb-3">
              <div className="relative w-10 h-10 sm:w-14 sm:h-14 flex-shrink-0">
                <svg className="w-10 h-10 sm:w-14 sm:h-14" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="40" fill="none" stroke="hsl(var(--muted))" strokeWidth="6" />
                  <circle
                    cx="50" cy="50" r="40" fill="none" stroke="hsl(var(--accent-pop))" strokeWidth="6"
                    strokeDasharray={`${Math.min(Math.max(cashOnCash, 0) * 12.5, 251)} 251`}
                    strokeLinecap="round"
                    transform="rotate(-90 50 50)"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-[10px] sm:text-sm font-bold text-foreground font-mono">{cashOnCash.toFixed(0)}%</span>
                </div>
              </div>
              <div className="min-w-0">
                <p className="text-lg sm:text-2xl font-bold text-primary font-mono" data-testid="text-cash-on-cash">{cashOnCash.toFixed(1)}%</p>
                <p className="text-xs sm:text-sm text-foreground/60 label-text flex items-center whitespace-nowrap">Cash-on-Cash<InfoTooltip text="Annual pre-tax cash flow as a percentage of total equity invested. Measures the yield on your cash investment." formula="CoC = Annual Cash Flow / Total Equity Invested" light side="right" /></p>
              </div>
            </div>
          </div>

          <div className="bg-card rounded-lg p-3 sm:p-5 border border-border shadow-sm transition-all duration-300">
            <div className="mb-2">
              <p className="text-base sm:text-2xl font-bold text-foreground font-mono truncate" data-testid="text-equity-invested">{formatMoney(totalInitialEquity)}</p>
              <p className="text-xs sm:text-sm text-foreground/60 label-text flex items-center">Equity Invested<InfoTooltip text="Total cash equity contributed by investors across all properties, excluding any debt financing." light side="right" /></p>
            </div>
            <div className="h-1.5 bg-foreground/10 rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{ width: '100%', background: 'linear-gradient(to right, hsl(var(--accent-pop)), hsl(var(--accent-pop-2)))' }} />
            </div>
          </div>

          <div className="bg-card rounded-lg p-3 sm:p-5 border border-border shadow-sm transition-all duration-300">
            <div className="mb-2">
              <p className="text-base sm:text-2xl font-bold text-primary font-mono truncate" data-testid="text-exit-value">{formatMoney(totalExitValue)}</p>
              <p className="text-xs sm:text-sm text-foreground/60 label-text flex items-center">Projected Exit<InfoTooltip text="Estimated total sale proceeds at the end of the hold period, based on projected NOI and exit cap rate." formula="Exit Value = NOI / Exit Cap Rate" light side="right" /></p>
            </div>
            <div className="flex items-center gap-1.5">
              <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
              </svg>
              <span className="text-sm font-medium text-primary font-mono">+{exitGainPercent}% gain</span>
            </div>
          </div>
        </div>
      </div>
      </AccordionContent>
    </AccordionItem>
  );
}
