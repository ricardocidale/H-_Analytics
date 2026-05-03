/**
 * FinancialStatement.tsx — Monthly pro-forma income statement grid.
 *
 * Renders the first 12 months of a property's USALI-style income statement
 * in a horizontally scrollable table. Key line items shown:
 *   • Occupancy %        — monthly occupancy rate (ramps up for new hotels)
 *   • Room Revenue       — rooms sold × ADR (Average Daily Rate)
 *   • F&B Revenue        — food & beverage (often 25-40% of total revenue)
 *   • Event Revenue      — meetings, banquets, catering
 *   • Total Revenue      — sum of all revenue streams
 *   • GOP                — Gross Operating Profit (revenue minus operating expenses)
 *   • NOI                — Net Operating Income (GOP minus fixed charges)
 *   • ANOI               — Adjusted NOI (NOI minus mgmt fees minus FF&E reserve)
 *   • Cash Flow          — ANOI minus debt service minus income tax
 *
 * The rightmost column aggregates the full-year total for each line item.
 */
import { MonthlyFinancials, formatMoney } from "@/lib/financialEngine";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface FinancialStatementProps {
  data: MonthlyFinancials[];
  title: string;
  startYear?: number;
}

export function FinancialStatement({ data, title, startYear = 2026 }: FinancialStatementProps) {
  const first12Months = data.slice(0, 12);
  
  return (
    <Card className="w-full overflow-hidden rounded-lg bg-card border border-border shadow-sm">
      <div className="p-6 border-b border-border">
        <h3 className="text-xl font-display font-semibold text-primary">{title} - {startYear} Pro Forma</h3>
      </div>
      <ScrollArea className="w-full whitespace-nowrap">
        <div className="p-0">
          <Table>
            <TableHeader className="bg-muted">
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="w-[200px] font-medium text-primary sticky left-0 bg-card z-10 border-r border-border">Line Item</TableHead>
                {first12Months.map((m) => (
                  <TableHead key={m.monthIndex} className="text-right min-w-[120px]">
                    {format(m.date, "MMM yyyy")}
                  </TableHead>
                ))}
                <TableHead className="text-right font-medium bg-muted/50">{startYear} Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {/* OPERATIONAL METRICS */}
              <TableRow className="bg-muted/30 border-border font-medium">
                <TableCell className="sticky left-0 bg-muted/80 z-10 border-r border-border">Occupancy %</TableCell>
                {first12Months.map((m, i) => (
                  <TableCell key={i} className="text-right text-muted-foreground font-mono">{(m.occupancy * 100).toFixed(0)}%</TableCell>
                ))}
                 <TableCell className="text-right font-medium">-</TableCell>
              </TableRow>
              
              {/* REVENUE SECTION */}
              <TableRow className="hover:bg-primary/5 border-border">
                <TableCell className="font-medium sticky left-0 bg-card dark:bg-foreground/50 z-10 border-r border-border">Room Revenue</TableCell>
                {first12Months.map((m, i) => (
                  <TableCell key={i} className="text-right font-mono">{formatMoney(m.revenueRooms)}</TableCell>
                ))}
                <TableCell className="text-right font-medium bg-muted font-mono">{formatMoney(first12Months.reduce((a, b) => a + b.revenueRooms, 0))}</TableCell>
              </TableRow>
              <TableRow className="hover:bg-primary/5 border-border">
                <TableCell className="font-medium sticky left-0 bg-card dark:bg-foreground/50 z-10 border-r border-border">F&B Revenue</TableCell>
                {first12Months.map((m, i) => (
                  <TableCell key={i} className="text-right font-mono">{formatMoney(m.revenueFB)}</TableCell>
                ))}
                <TableCell className="text-right font-medium bg-muted font-mono">{formatMoney(first12Months.reduce((a, b) => a + b.revenueFB, 0))}</TableCell>
              </TableRow>
              <TableRow className="hover:bg-primary/5 border-border">
                <TableCell className="font-medium sticky left-0 bg-card dark:bg-foreground/50 z-10 border-r border-border">Event Revenue</TableCell>
                {first12Months.map((m, i) => (
                  <TableCell key={i} className="text-right font-mono">{formatMoney(m.revenueEvents)}</TableCell>
                ))}
                <TableCell className="text-right font-medium bg-muted font-mono">{formatMoney(first12Months.reduce((a, b) => a + b.revenueEvents, 0))}</TableCell>
              </TableRow>
              <TableRow className="bg-primary/5 border-border font-medium text-primary">
                <TableCell className="sticky left-0 bg-primary/10 z-10 border-r border-border">Total Revenue</TableCell>
                {first12Months.map((m, i) => (
                  <TableCell key={i} className="text-right font-mono">{formatMoney(m.revenueTotal)}</TableCell>
                ))}
                <TableCell className="text-right bg-primary/20 font-mono">{formatMoney(first12Months.reduce((a, b) => a + b.revenueTotal, 0))}</TableCell>
              </TableRow>

              {/* SPACE */}
              <TableRow className="h-4 border-none hover:bg-transparent"><TableCell colSpan={14}></TableCell></TableRow>

              {/* GOP */}
              <TableRow className="bg-accent/10 border-border font-medium">
                <TableCell className="sticky left-0 bg-accent/20 z-10 border-r border-border">Gross Operating Profit (GOP)</TableCell>
                {first12Months.map((m, i) => (
                  <TableCell key={i} className="text-right font-mono">{formatMoney(m.gop)}</TableCell>
                ))}
                <TableCell className="text-right bg-accent/30 font-mono">{formatMoney(first12Months.reduce((a, b) => a + b.gop, 0))}</TableCell>
              </TableRow>

              {/* AGOP = GOP − Management Fees */}
              <TableRow className="bg-primary/10 border-border font-medium">
                <TableCell className="sticky left-0 bg-primary/20 z-10 border-r border-border text-sm">Adjusted GOP (AGOP)</TableCell>
                {first12Months.map((m, i) => (
                  <TableCell key={i} className="text-right font-mono text-sm">{formatMoney(m.agop)}</TableCell>
                ))}
                <TableCell className="text-right bg-primary/30 font-mono text-sm">{formatMoney(first12Months.reduce((a, b) => a + b.agop, 0))}</TableCell>
              </TableRow>

              {/* NOI = AGOP − Fixed Charges (Property Taxes) */}
              <TableRow className="bg-primary/5 border-border font-medium">
                <TableCell className="sticky left-0 bg-primary/10 z-10 border-r border-border text-sm">Net Operating Income (NOI)</TableCell>
                {first12Months.map((m, i) => (
                  <TableCell key={i} className="text-right font-mono text-sm">{formatMoney(m.noi)}</TableCell>
                ))}
                <TableCell className="text-right bg-primary/20 font-mono text-sm">{formatMoney(first12Months.reduce((a, b) => a + b.noi, 0))}</TableCell>
              </TableRow>

              {/* ANOI */}
              <TableRow className="bg-primary/10 border-border font-medium text-lg">
                <TableCell className="sticky left-0 bg-primary/20 z-10 border-r border-border">Adjusted NOI (ANOI)</TableCell>
                {first12Months.map((m, i) => (
                  <TableCell key={i} className="text-right font-mono">{formatMoney(m.anoi)}</TableCell>
                ))}
                <TableCell className="text-right bg-primary/30 font-mono">{formatMoney(first12Months.reduce((a, b) => a + b.anoi, 0))}</TableCell>
              </TableRow>
              
               {/* CASH FLOW */}
              <TableRow className="bg-primary/10 border-border font-medium text-lg">
                <TableCell className="sticky left-0 bg-primary/20 z-10 border-r border-border">Cash Flow</TableCell>
                {first12Months.map((m, i) => (
                  <TableCell key={i} className={cn("text-right font-mono", m.cashFlow < 0 ? "text-destructive" : "text-primary dark:text-primary")}>
                    {formatMoney(m.cashFlow)}
                  </TableCell>
                ))}
                <TableCell className="text-right bg-primary/30 font-mono">{formatMoney(first12Months.reduce((a, b) => a + b.cashFlow, 0))}</TableCell>
              </TableRow>

            </TableBody>
          </Table>
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </Card>
  );
}
