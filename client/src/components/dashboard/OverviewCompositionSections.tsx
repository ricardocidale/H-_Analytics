import React from "react";
import { PropertyStatus } from "@shared/constants";
import { Property } from "@shared/schema";
import { AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChartContainer, ChartLegend, ChartLegendContent, type ChartConfig } from "@/components/ui/chart";
import { CurrentThemeTab } from "@/components/ui/tabs";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, PieChart, Pie, Cell, ReferenceLine } from "recharts";
import { InsightPanel, type Insight } from "@/components/graphics";
import { Link } from "wouter";
import { formatMoney } from "@/lib/financialEngine";
import { STATUSES, STATUS_COLORS, formatCompact, type WaterfallItem } from "./overview-helpers";

function WaterfallTooltipContent({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const item = payload[0]?.payload as WaterfallItem;
  if (!item) return null;
  return (
    <div className="rounded-md border bg-card px-3 py-2 shadow-md text-sm">
      <p className="font-medium text-card-foreground">{item.name}</p>
      <p className="text-muted-foreground">
        {item.isSubtotal ? "" : "−"}{formatCompact(item.value)}
      </p>
    </div>
  );
}

interface CompositionProps {
  totalProperties: number;
  totalRooms: number;
  avgRoomsPerProperty: number;
  avgADR: number;
  totalPurchasePrice: number;
  avgPurchasePrice: number;
  avgExitCapRate: number;
  investmentHorizon: number;
  totalProjectionRevenue: number;
  totalProjectionNOI: number;
  marketCounts: Record<string, number>;
}

export function PortfolioCompositionSection({
  totalProperties,
  totalRooms,
  avgRoomsPerProperty,
  avgADR,
  totalPurchasePrice,
  avgPurchasePrice,
  avgExitCapRate,
  investmentHorizon,
  totalProjectionRevenue,
  totalProjectionNOI,
  marketCounts,
}: CompositionProps) {
  return (
    <AccordionItem value="composition" className="border-none">
      <div className="flex items-center gap-2 py-3 px-1">
        <AccordionTrigger className="hover:no-underline p-0">
          <span className="text-sm font-semibold text-foreground tracking-wide uppercase">Portfolio & Capital Structure</span>
        </AccordionTrigger>
        <InfoTooltip
          text="Composition shows the physical portfolio makeup. Capital Structure breaks down how the investments are funded and what returns are projected."
          light
          side="right"
        />
      </div>
      <AccordionContent className="pt-2 pb-4">
      <div className="grid gap-4 md:grid-cols-2" data-export-section="portfolio-composition">
        <div className="bg-card/80 rounded-lg p-6 border border-primary/10 shadow-[0_2px_8px_rgba(var(--primary-rgb,159,188,164),0.08)]">
          <h3 className="text-sm font-semibold text-foreground mb-5 font-display">Portfolio Composition</h3>
          <div className="space-y-4">
            {[
              { label: "Properties", value: String(totalProperties), tip: "Number of hotel assets in the portfolio." },
              { label: "Total Rooms", value: String(totalRooms), tip: "Combined room count across all properties." },
              { label: "Avg Rooms/Property", value: avgRoomsPerProperty.toFixed(0), tip: "Average number of rooms per hotel — indicates typical asset size." },
              { label: "Markets", value: String(Object.keys(marketCounts).length), tip: "Number of distinct geographic markets for diversification." },
              { label: "Avg Daily Rate", value: formatMoney(avgADR), highlight: true, tip: "Weighted average ADR across all properties. ADR = Room Revenue / Rooms Sold." },
            ].map(row => (
              <div key={row.label} className="flex justify-between items-center py-1 border-b border-foreground/5 last:border-0">
                <span className="text-sm text-foreground/60 label-text flex items-center">{row.label}<InfoTooltip text={row.tip} light side="right" /></span>
                <span className={`font-semibold font-mono text-sm ${row.highlight ? 'text-primary' : 'text-foreground'}`}>{row.value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-card/80 rounded-lg p-6 border border-primary/10 shadow-[0_2px_8px_rgba(var(--primary-rgb,159,188,164),0.08)]">
          <h3 className="text-sm font-semibold text-foreground mb-5 font-display">Capital Structure</h3>
          <div className="space-y-4">
            {[
              { label: "Total Purchase Price", value: formatMoney(totalPurchasePrice), tip: "Combined acquisition cost of all hotel properties." },
              { label: "Avg Purchase Price", value: formatMoney(avgPurchasePrice), tip: "Mean acquisition cost per property." },
              { label: "Avg Exit Cap Rate", value: `${(avgExitCapRate * 100).toFixed(1)}%`, highlight: true, tip: "Capitalization rate used to value properties at sale. Lower cap rate = higher valuation.", formula: "Cap Rate = NOI / Property Value" },
              { label: "Hold Period", value: `${investmentHorizon} Years`, tip: "Total planned ownership duration before exit/sale." },
              { label: "ANOI Margin", value: `${totalProjectionRevenue > 0 ? ((totalProjectionNOI / totalProjectionRevenue) * 100).toFixed(1) : '0.0'}%`, highlight: true, tip: "ANOI as a percentage of total revenue — measures overall operating efficiency after all charges.", formula: "ANOI Margin = ANOI / Revenue × 100" },
            ].map(row => (
              <div key={row.label} className="flex justify-between items-center py-1 border-b border-foreground/5 last:border-0">
                <span className="text-sm text-foreground/60 label-text flex items-center">{row.label}<InfoTooltip text={row.tip} formula={'formula' in row ? row.formula : undefined} light side="right" /></span>
                <span className={`font-semibold font-mono text-sm ${row.highlight ? 'text-primary' : 'text-foreground'}`}>{row.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      </AccordionContent>
    </AccordionItem>
  );
}

interface InsightsSectionProps {
  properties: Property[];
  propertyIRRData: { name: string; fullName: string; irr: number }[];
  insights: Insight[];
}

export function PortfolioInsightsSection({ properties, propertyIRRData, insights }: InsightsSectionProps) {
  return (
    <AccordionItem value="insights" className="border-none">
      <div className="flex items-center gap-2 py-3 px-1">
        <AccordionTrigger className="hover:no-underline p-0">
          <span className="text-sm font-semibold text-foreground tracking-wide uppercase">Portfolio Insights</span>
        </AccordionTrigger>
        <InfoTooltip
          text="AI-generated observations about portfolio performance, diversification, and risk factors."
          light
          side="right"
        />
      </div>
      <AccordionContent className="pt-2 pb-4 space-y-4">
      <div className="rounded-lg border border-border overflow-hidden" data-testid="portfolio-property-table" data-export-section="portfolio-property-table">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="text-xs font-semibold text-muted-foreground w-[30px]">#</TableHead>
              <TableHead className="text-xs font-semibold text-muted-foreground">Property</TableHead>
              <TableHead className="text-xs font-semibold text-muted-foreground">Market</TableHead>
              <TableHead className="text-xs font-semibold text-muted-foreground text-center">Rooms</TableHead>
              <TableHead className="text-xs font-semibold text-muted-foreground text-center">Status</TableHead>
              <TableHead className="text-xs font-semibold text-muted-foreground text-right">Acquisition</TableHead>
              <TableHead className="text-xs font-semibold text-muted-foreground text-right">ADR</TableHead>
              <TableHead className="text-xs font-semibold text-muted-foreground text-right">IRR</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {properties.map((prop, idx) => {
              const irr = propertyIRRData[idx]?.irr ?? 0;
              return (
                <TableRow key={prop.id} className="hover:bg-muted/30" data-testid={`row-property-${prop.id}`}>
                  <TableCell className="text-xs text-muted-foreground font-mono py-2.5">{idx + 1}</TableCell>
                  <TableCell className="py-2.5">
                    <Link href={`/property/${prop.id}`} className="text-sm font-medium text-foreground hover:text-primary transition-colors">
                      {prop.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground py-2.5">{prop.market}</TableCell>
                  <TableCell className="text-xs text-foreground font-mono text-center py-2.5">{prop.roomCount}</TableCell>
                  <TableCell className="text-center py-2.5">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${
                      prop.status === PropertyStatus.OPERATING ? "bg-primary/10 text-primary" :
                      prop.status === PropertyStatus.IMPROVEMENTS ? "bg-accent-pop/10 text-accent-pop" :
                      prop.status === PropertyStatus.ACQUIRED ? "bg-chart-1/10 text-chart-1" :
                      prop.status === PropertyStatus.PLANNED ? "bg-chart-1/10 text-chart-1" :
                      prop.status === PropertyStatus.IN_NEGOTIATION ? "bg-chart-3/10 text-chart-3" :
                      "bg-muted text-muted-foreground"
                    }`}>
                      {prop.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-foreground font-mono text-right py-2.5">{formatMoney(prop.purchasePrice)}</TableCell>
                  <TableCell className="text-xs text-foreground font-mono text-right py-2.5">${prop.startAdr.toFixed(0)}</TableCell>
                  <TableCell className="text-xs font-mono text-right py-2.5">
                    <span className={irr >= 0 ? "text-primary" : "text-destructive"}>{irr.toFixed(1)}%</span>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <InsightPanel
        data-testid="insight-dashboard"
        title="Portfolio Insights"
        insights={insights}
      />
      </AccordionContent>
    </AccordionItem>
  );
}

interface MarketStatusSectionProps {
  totalProperties: number;
  marketData: { market: string; name: string; value: number; fill: string }[];
  marketChartConfig: ChartConfig;
  statusCounts: Record<string, number>;
}

export function MarketStatusSection({ totalProperties, marketData, marketChartConfig, statusCounts }: MarketStatusSectionProps) {
  return (
    <AccordionItem value="marketStatus" className="border-none">
      <div className="flex items-center gap-2 py-3 px-1">
        <AccordionTrigger className="hover:no-underline p-0">
          <span className="text-sm font-semibold text-foreground tracking-wide uppercase">Portfolio Composition</span>
        </AccordionTrigger>
        <InfoTooltip
          text="Geographic distribution of properties across markets and the lifecycle status of each asset in the portfolio."
          light
          side="right"
        />
      </div>
      <AccordionContent className="pt-2 pb-4">
        <div className="grid gap-4 md:grid-cols-2" data-export-section="market-status-charts">
          <Card className="flex flex-col">
            <CardHeader className="items-center pb-0">
              <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                Portfolio by Market
                <InfoTooltip text="Number of properties in each geographic market. Diversification across markets reduces concentration risk." light side="right" />
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 pb-0">
              {marketData.length > 0 ? (
                <ChartContainer
                  config={marketChartConfig}
                  className="mx-auto aspect-square max-h-[280px]"
                >
                  <PieChart>
                    <Pie data={marketData} dataKey="value" nameKey="market" />
                    <ChartLegend
                      content={<ChartLegendContent nameKey="market" />}
                      className="-translate-y-2 flex-wrap gap-2 [&>*]:basis-1/4 [&>*]:justify-center"
                    />
                  </PieChart>
                </ChartContainer>
              ) : (
                <div className="flex items-center justify-center h-[220px] text-sm text-muted-foreground">
                  No properties to display
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                Properties by Status
                <InfoTooltip text="Lifecycle status of each property: Operating (revenue-generating), Improvements (under renovation), Acquired (closed but not yet operating), In Negotiation (under contract), Planned (in pipeline)." light side="right" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-4 py-2">
                {STATUSES.map((status) => {
                  const count = statusCounts[status] || 0;
                  if (count === 0) return null;
                  const pct = totalProperties > 0 ? (count / totalProperties) * 100 : 0;
                  return (
                    <div key={status} className="flex items-center gap-3" data-testid={`status-bar-${status.toLowerCase().replace(/\s+/g, '-')}`}>
                      <span className="text-sm font-medium w-[120px] shrink-0">{status}</span>
                      <div className="flex-1 h-6 bg-muted rounded overflow-hidden">
                        <div
                          className={`h-full rounded transition-all duration-300 ${STATUS_COLORS[status] || "bg-primary/70"}`}
                          style={{ width: `${pct}%`, minWidth: count > 0 ? 4 : 0 }}
                        />
                      </div>
                      <span className="text-base font-bold font-mono tabular-nums w-6 text-right">{count}</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

interface WaterfallSectionProps {
  waterfallData: WaterfallItem[];
  waterfallYear: string;
  setWaterfallYear: (year: string) => void;
  yearTabs: { value: string; label: string }[];
}

export function WaterfallSection({ waterfallData, waterfallYear, setWaterfallYear, yearTabs }: WaterfallSectionProps) {
  return (
    <AccordionItem value="waterfall" className="border-none">
      <div className="flex items-center gap-2 py-3 px-1">
        <AccordionTrigger className="hover:no-underline p-0">
          <span className="text-sm font-semibold text-foreground tracking-wide uppercase">USALI Profit Waterfall</span>
        </AccordionTrigger>
        <InfoTooltip
          text="How total revenue flows down to ANOI through each layer of operating expenses, following the USALI 11th Edition framework."
          formula="Revenue → GOP → NOI → ANOI"
          light
          side="right"
        />
      </div>
      <AccordionContent className="pt-2 pb-4">
        <Card data-testid="usali-waterfall-card" data-export-section="usali-waterfall-chart">
          <CardHeader className="pb-2">
            <p className="text-xs text-muted-foreground">Revenue cascade through operating expenses to net income (consolidated portfolio)</p>
          </CardHeader>
          <CardContent className="space-y-3">
            <CurrentThemeTab
              tabs={yearTabs}
              activeTab={waterfallYear}
              onTabChange={setWaterfallYear}
            />
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={waterfallData} margin={{ top: 16, right: 16, bottom: 4, left: 8 }}>
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11, fill: "hsl(var(--foreground))" }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tickFormatter={(v: number) => formatCompact(Math.abs(v))}
                  tick={{ fontSize: 11, fill: "hsl(var(--foreground))" }}
                  tickLine={false}
                  axisLine={false}
                  width={60}
                />
                <RechartsTooltip content={<WaterfallTooltipContent />} />
                <ReferenceLine y={0} stroke="hsl(var(--border))" />
                <Bar dataKey="base" stackId="waterfall" fill="transparent" isAnimationActive={false} />
                <Bar dataKey="value" stackId="waterfall" radius={[4, 4, 0, 0]} isAnimationActive>
                  {waterfallData.map((entry, index) => (
                    <Cell key={index} fill={entry.fill} opacity={entry.isSubtotal ? 1 : 0.75} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="flex items-center justify-center gap-6 mt-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm" style={{ background: "hsl(var(--chart-1))" }} />
                Subtotals
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm opacity-75" style={{ background: "hsl(var(--chart-2))" }} />
                Deductions
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm" style={{ background: "hsl(var(--primary))" }} />
                Net Result
              </span>
            </div>
          </CardContent>
        </Card>
      </AccordionContent>
    </AccordionItem>
  );
}
