import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Check, X, Search, ChevronDown } from "@/components/icons/themed-icons";
import { IconEye, IconBell, IconStar, IconTrendingUp, IconUsers, IconDollarSign, IconAlertCircle } from "@/components/icons";
import { BarChartCard } from "@/lib/charts/BarChartCard";
import { LineChartMulti } from "@/lib/charts/LineChartMulti";
import type { ChartConfig } from "@/components/ui/chart";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { TooltipProvider } from "@/components/ui/tooltip";
import { IconSetProvider } from "@/components/icons/IconSetContext";
import type { IconSetType } from "@/features/design-themes/types";
import {
  Star as LucideStar,
  Bell as LucideBell,
  Search as LucideSearch,
  Check as LucideCheck,
  AlertTriangle as LucideAlert,
} from "lucide-react";
import {
  Star as PhosphorStar,
  Bell as PhosphorBell,
  MagnifyingGlass as PhosphorSearch,
  Check as PhosphorCheck,
  Warning as PhosphorAlert,
} from "@phosphor-icons/react";
import {
  MdOutlineStarOutline as MaterialStar, MdOutlineNotifications as MaterialBell,
  MdOutlineSearch as MaterialSearch, MdOutlineCheck as MaterialCheck,
  MdOutlineWarningAmber as MaterialAlert,
} from "react-icons/md";

const barChartData = [
  { name: "Q1", value: 320, fill: "var(--color-q1)" },
  { name: "Q2", value: 450, fill: "var(--color-q2)" },
  { name: "Q3", value: 390, fill: "var(--color-q3)" },
  { name: "Q4", value: 520, fill: "var(--color-q4)" },
];

const barChartConfig: ChartConfig = {
  q1: { label: "Q1", color: "hsl(var(--chart-1))" },
  q2: { label: "Q2", color: "hsl(var(--chart-2))" },
  q3: { label: "Q3", color: "hsl(var(--chart-3))" },
  q4: { label: "Q4", color: "hsl(var(--chart-4))" },
  value: { label: "Revenue ($K)" },
};

const lineChartData = [
  { month: "Jan", revenue: 180, noi: 95, occupancy: 72 },
  { month: "Feb", revenue: 200, noi: 110, occupancy: 75 },
  { month: "Mar", revenue: 220, noi: 120, occupancy: 78 },
  { month: "Apr", revenue: 250, noi: 140, occupancy: 82 },
  { month: "May", revenue: 270, noi: 155, occupancy: 85 },
  { month: "Jun", revenue: 300, noi: 170, occupancy: 88 },
];

const lineChartConfig: ChartConfig = {
  revenue: { label: "Revenue", color: "hsl(var(--chart-1))" },
  noi: { label: "NOI", color: "hsl(var(--chart-2))" },
  occupancy: { label: "Occupancy", color: "hsl(var(--chart-3))" },
};

const lineChartSeries = [
  { dataKey: "revenue", color: "var(--color-revenue)", label: "Revenue" },
  { dataKey: "noi", color: "var(--color-noi)", label: "NOI" },
  { dataKey: "occupancy", color: "var(--color-occupancy)", label: "Occupancy" },
];

interface ThemePreviewProps {
  themeName?: string;
  iconSet?: IconSetType;
}

export function ThemePreview({ themeName, iconSet = "lucide" }: ThemePreviewProps) {
  const [previewOpen, setPreviewOpen] = useState(true);

  if (!previewOpen) {
    return (
      <Button
        variant="outline"
        onClick={() => setPreviewOpen(true)}
        className="w-full py-3 px-4 rounded-xl border-2 border-dashed border-border text-sm text-muted-foreground hover:border-primary/40 hover:text-foreground h-auto"
        data-testid="button-show-preview"
      >
        <IconEye className="w-4 h-4" />
        Show Live Preview
      </Button>
    );
  }

  return (
    <Card className="relative overflow-hidden bg-card/80 backdrop-blur-xl border border-border shadow-lg" data-testid="theme-preview-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center">
              <IconEye className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg font-display text-foreground">
                Live Preview{themeName ? ` — ${themeName}` : ""}
              </CardTitle>
              <CardDescription className="text-muted-foreground">See how your theme looks on real UI elements</CardDescription>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setPreviewOpen(false)} data-testid="button-hide-preview">
            <X className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <IconSetProvider value={iconSet}>
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Icon Set — {iconSet === "material" ? "Material" : iconSet === "phosphor" ? "Phosphor" : "Lucide"}</p>
          <div className="flex gap-6" data-testid="preview-icon-set">
            <div className="space-y-2">
              <p className="text-[10px] font-medium text-muted-foreground uppercase">Lucide</p>
              <div className="flex gap-2">
                <LucideStar className="w-5 h-5 text-foreground" />
                <LucideBell className="w-5 h-5 text-foreground" />
                <LucideSearch className="w-5 h-5 text-foreground" />
                <LucideCheck className="w-5 h-5 text-foreground" />
                <LucideAlert className="w-5 h-5 text-foreground" />
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-[10px] font-medium text-muted-foreground uppercase">Phosphor</p>
              <div className="flex gap-2">
                <PhosphorStar className="w-5 h-5 text-foreground" size={20} />
                <PhosphorBell className="w-5 h-5 text-foreground" size={20} />
                <PhosphorSearch className="w-5 h-5 text-foreground" size={20} />
                <PhosphorCheck className="w-5 h-5 text-foreground" size={20} />
                <PhosphorAlert className="w-5 h-5 text-foreground" size={20} />
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-[10px] font-medium text-muted-foreground uppercase">Material</p>
              <div className="flex gap-2">
                <MaterialStar className="w-5 h-5 text-foreground" />
                <MaterialBell className="w-5 h-5 text-foreground" />
                <MaterialSearch className="w-5 h-5 text-foreground" />
                <MaterialCheck className="w-5 h-5 text-foreground" />
                <MaterialAlert className="w-5 h-5 text-foreground" />
              </div>
            </div>
          </div>
          <div className="mt-2 px-2 py-1 rounded bg-muted inline-block">
            <span className="text-xs font-medium text-foreground">Active: {iconSet === "material" ? "Material" : iconSet === "phosphor" ? "Phosphor" : "Lucide"}</span>
          </div>
        </div>

        <Separator />

        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Buttons</p>
          <div className="flex flex-wrap gap-2">
            <Button data-testid="preview-btn-primary">Primary</Button>
            <Button variant="secondary" data-testid="preview-btn-secondary">Secondary</Button>
            <Button variant="outline" data-testid="preview-btn-outline">Outline</Button>
            <Button variant="ghost" data-testid="preview-btn-ghost">Ghost</Button>
            <Button variant="destructive" data-testid="preview-btn-destructive">Delete</Button>
            <Button disabled data-testid="preview-btn-disabled">Disabled</Button>
          </div>
        </div>

        <Separator />

        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Sample Dialog</p>
          <div className="rounded-xl border border-border bg-popover shadow-lg p-0 max-w-sm">
            <div className="p-5 pb-3">
              <h3 className="text-base font-semibold text-popover-foreground">Confirm Action</h3>
              <p className="text-sm text-muted-foreground mt-1">Are you sure you want to save these changes? This will update the portfolio assumptions.</p>
            </div>
            <div className="px-5 pb-2">
              <div className="space-y-2">
                <Label className="text-sm text-foreground">Property Name</Label>
                <Input placeholder="e.g., Grand Hotel Riviera" className="bg-background" readOnly data-testid="preview-input" />
              </div>
            </div>
            <div className="flex justify-end gap-2 p-4 pt-3 border-t border-border">
              <Button variant="outline" size="sm">Cancel</Button>
              <Button size="sm">Save</Button>
            </div>
          </div>
        </div>

        <Separator />

        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Menu & Navigation</p>
          <div className="flex gap-4">
            <div className="w-44 rounded-lg border border-border bg-popover shadow-md overflow-hidden">
              <div className="p-1">
                <div className="px-3 py-2 rounded-md bg-muted text-foreground text-sm font-medium flex items-center gap-2">
                  <IconStar className="w-4 h-4 text-primary" />
                  Dashboard
                </div>
                <div className="px-3 py-2 rounded-md text-muted-foreground text-sm flex items-center gap-2 hover:bg-muted/50 cursor-default">
                  <IconUsers className="w-4 h-4" />
                  Portfolio
                </div>
                <div className="px-3 py-2 rounded-md text-muted-foreground text-sm flex items-center gap-2 hover:bg-muted/50 cursor-default">
                  <IconTrendingUp className="w-4 h-4" />
                  Analysis
                </div>
                <Separator className="my-1" />
                <div className="px-3 py-2 rounded-md text-muted-foreground text-sm flex items-center gap-2 hover:bg-muted/50 cursor-default">
                  <IconDollarSign className="w-4 h-4" />
                  Financing
                </div>
              </div>
            </div>

            <div className="w-52 rounded-lg border border-border bg-popover shadow-md overflow-hidden">
              <div className="px-3 py-2 border-b border-border">
                <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-muted text-muted-foreground text-sm">
                  <Search className="w-3.5 h-3.5" />
                  Search...
                </div>
              </div>
              <div className="p-1">
                <div className="px-3 py-2 rounded-md text-foreground text-sm flex items-center justify-between hover:bg-muted/50 cursor-default">
                  Export PDF
                  <span className="text-xs text-muted-foreground font-mono">Ctrl+P</span>
                </div>
                <div className="px-3 py-2 rounded-md text-foreground text-sm flex items-center justify-between hover:bg-muted/50 cursor-default">
                  Export Excel
                  <span className="text-xs text-muted-foreground font-mono">Ctrl+E</span>
                </div>
                <Separator className="my-1" />
                <div className="px-3 py-2 rounded-md text-destructive text-sm flex items-center gap-2 hover:bg-destructive/10 cursor-default">
                  <IconAlertCircle className="w-3.5 h-3.5" />
                  Delete Property
                </div>
              </div>
            </div>
          </div>
        </div>

        <Separator />

        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Cards & Badges</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-4 rounded-xl bg-card border border-border shadow-sm hover-lift">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Revenue</p>
                <IconDollarSign className="w-4 h-4 text-primary" />
              </div>
              <p className="text-2xl font-semibold text-foreground">$1.2M</p>
              <p className="text-xs text-muted-foreground mt-1">+12.5% from last year</p>
            </div>

            <div className="p-4 rounded-xl bg-card border border-border shadow-sm hover-lift">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Occupancy</p>
                <IconTrendingUp className="w-4 h-4 text-primary" />
              </div>
              <p className="text-2xl font-semibold text-foreground">78%</p>
              <p className="text-xs text-muted-foreground mt-1">Above market avg</p>
            </div>

            <div className="p-4 rounded-xl bg-card border border-border shadow-sm hover-lift">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Properties</p>
                <IconUsers className="w-4 h-4 text-primary" />
              </div>
              <p className="text-2xl font-semibold text-foreground">5</p>
              <p className="text-xs text-muted-foreground mt-1">Active portfolio</p>
            </div>
          </div>
        </div>

        <Separator />

        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Badges & Tags</p>
          <div className="flex flex-wrap gap-2">
            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-primary text-primary-foreground">Default</span>
            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-secondary text-secondary-foreground">Secondary</span>
            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-muted text-muted-foreground">Muted</span>
            <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary">Active</span>
            <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-accent-pop/15 text-accent-pop">Pending</span>
            <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-destructive/15 text-destructive">Declined</span>
          </div>
        </div>

        <Separator />

        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Notification / Toast</p>
          <div className="space-y-2">
            <div className="flex items-start gap-3 p-3 rounded-lg border border-border bg-card shadow-sm">
              <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                <IconBell className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">Assumptions Updated</p>
                <p className="text-xs text-muted-foreground mt-0.5">Revenue growth rate changed from 3.0% to 3.5% for Year 2.</p>
              </div>
              <Button variant="ghost" size="sm" className="flex-shrink-0">
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg border border-primary/20 bg-primary/10">
              <Check className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-primary">Export Complete</p>
                <p className="text-xs text-primary/70 mt-0.5">Portfolio summary exported to PDF successfully.</p>
              </div>
            </div>
          </div>
        </div>

        <Separator />

        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3" data-testid="preview-section-bar-chart">Bar Chart</p>
          <div className="h-[200px]" data-testid="preview-bar-chart">
            <BarChartCard
              data={barChartData}
              config={barChartConfig}
              layout="horizontal"
              showLabel={false}
              barRadius={4}
              className="h-full w-full"
            />
          </div>
        </div>

        <Separator />

        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3" data-testid="preview-section-line-chart">Line Chart</p>
          <div className="h-[200px]" data-testid="preview-line-chart">
            <LineChartMulti
              data={lineChartData}
              config={lineChartConfig}
              series={lineChartSeries}
              xAxisKey="month"
              xAxisFormatter={(v) => v}
              className="h-full w-full"
            />
          </div>
        </div>

        <Separator />

        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3" data-testid="preview-section-infotips">Infotips</p>
          <TooltipProvider>
            <div className="space-y-3">
              <div className="flex items-center gap-2 p-3 rounded-lg border border-border bg-card" data-testid="preview-infotip-adr">
                <span className="text-sm text-foreground font-medium">ADR</span>
                <InfoTooltip
                  text="Average Daily Rate — the average rental income per paid occupied room over a given period."
                  formula="ADR = Total Room Revenue / Number of Rooms Sold"
                  side="right"
                />
              </div>
              <div className="flex items-center gap-2 p-3 rounded-lg border border-border bg-card" data-testid="preview-infotip-caprate">
                <span className="text-sm text-foreground font-medium">Cap Rate</span>
                <InfoTooltip
                  text="Capitalization Rate — measures the rate of return on a real estate investment property based on its net operating income."
                  formula="Cap Rate = NOI / Property Value"
                  side="right"
                />
              </div>
              <div className="flex items-center gap-2 p-3 rounded-lg border border-border bg-card" data-testid="preview-infotip-ffe">
                <span className="text-sm text-foreground font-medium">FF&E Reserve</span>
                <InfoTooltip
                  text="Furniture, Fixtures & Equipment Reserve — funds set aside for the periodic replacement of furniture, fixtures, and equipment."
                  side="right"
                />
              </div>
            </div>
          </TooltipProvider>
        </div>

        <Separator />

        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3" data-testid="preview-section-chart-colors">Chart Colors</p>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex flex-col items-center gap-1" data-testid={`preview-chart-swatch-${i}`}>
                <div
                  className="w-8 h-8 rounded-md border border-border"
                  style={{ backgroundColor: `hsl(var(--chart-${i}))` }}
                />
                <span className="text-[10px] text-muted-foreground">Chart {i}</span>
              </div>
            ))}
          </div>
        </div>
        </IconSetProvider>
      </CardContent>
    </Card>
  );
}
