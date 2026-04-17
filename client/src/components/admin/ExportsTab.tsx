import { useState, useCallback, useEffect } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { IconDownload, IconTrending, IconFileCheck } from "@/components/icons";
import { saveExportConfig, DEFAULT_EXPORT_CONFIG, type ExportConfig } from "@/lib/exportConfig";

const EXPORT_CONFIG_API = "/api/admin/export-config";

async function fetchExportConfigFromApi(): Promise<ExportConfig> {
  const res = await fetch(EXPORT_CONFIG_API);
  if (!res.ok) throw new Error("Failed to load export config");
  return res.json();
}

async function putExportConfigToApi(cfg: ExportConfig): Promise<ExportConfig> {
  const res = await fetch(EXPORT_CONFIG_API, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cfg),
  });
  if (!res.ok) throw new Error("Failed to save export config");
  return res.json();
}

function SectionToggle({
  id, label, description, checked, onChange, disabled,
}: {
  id: string; label: string; description: string;
  checked: boolean; onChange: (v: boolean) => void; disabled?: boolean;
}) {
  return (
    <div className={`flex items-start gap-3 py-2.5 ${disabled ? "opacity-40 pointer-events-none" : ""}`}>
      <Checkbox
        id={id} checked={checked}
        onCheckedChange={(v) => onChange(!!v)}
        className="mt-0.5 shrink-0"
        data-testid={`checkbox-export-${id}`}
      />
      <div className="flex-1 min-w-0">
        <Label htmlFor={id} className="text-sm font-medium cursor-pointer leading-snug">{label}</Label>
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

function SettingSwitch({
  id, label, description, checked, onChange,
}: {
  id: string; label: string; description: string;
  checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="flex-1 min-w-0">
        <Label htmlFor={id} className="text-sm font-medium cursor-pointer leading-snug">{label}</Label>
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{description}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} className="shrink-0" data-testid={`switch-export-${id}`} />
    </div>
  );
}

function GroupHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-2 pt-3 pb-1 first:pt-0">
      <span className="text-[10px] font-semibold tracking-widest uppercase text-muted-foreground/70 whitespace-nowrap">
        {title}
      </span>
      <div className="flex-1 h-px bg-border/60" />
    </div>
  );
}

function ContentCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
      <div className="bg-muted/30 border-b border-border px-4 py-2.5">
        <span className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">Report Sections</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-border px-4">
        {children}
      </div>
    </div>
  );
}

function SettingsCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-muted/20 overflow-hidden shadow-sm">
      <div className="bg-muted/40 border-b border-border px-4 py-2.5">
        <span className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">{title}</span>
      </div>
      <div className="px-4 py-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6">
        {children}
      </div>
    </div>
  );
}

export default function ExportsTab() {
  const { toast } = useToast();
  const [config, setConfig] = useState<ExportConfig>(DEFAULT_EXPORT_CONFIG);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchExportConfigFromApi()
      .then((cfg) => { setConfig(cfg); saveExportConfig(cfg); })
      .catch(() => toast({ title: "Could not load export settings", description: "Showing defaults.", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, []);

  const updateNested = useCallback(<
    G extends "overview" | "statements" | "analysis",
    K extends keyof ExportConfig[G],
  >(group: G, key: K, value: ExportConfig[G][K]) => {
    setConfig((prev) => ({ ...prev, [group]: { ...prev[group], [key]: value } }));
    setDirty(true);
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const saved = await putExportConfigToApi(config);
      saveExportConfig(saved);
      setConfig(saved);
      setDirty(false);
      toast({ title: "Export settings saved", description: "Changes will apply to all new exports." });
    } catch {
      toast({ title: "Failed to save", description: "Check your connection and try again.", variant: "destructive" });
    } finally { setSaving(false); }
  };

  const handleReset = async () => {
    setSaving(true);
    try {
      const saved = await putExportConfigToApi(DEFAULT_EXPORT_CONFIG);
      saveExportConfig(saved);
      setConfig(saved);
      setDirty(false);
      toast({ title: "Export settings reset", description: "All settings restored to defaults." });
    } catch {
      toast({ title: "Failed to reset", description: "Check your connection and try again.", variant: "destructive" });
    } finally { setSaving(false); }
  };

  if (loading) {
    return <div className="py-12 text-center text-sm text-muted-foreground">Loading export settings…</div>;
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Choose what appears in each report, and control orientation, quality, and layout options per export type.
      </p>

      <Tabs defaultValue="overview">
        <TabsList className="w-full">
          <TabsTrigger value="overview" className="flex-1" data-testid="tab-export-overview">
            <IconDownload className="h-3.5 w-3.5 mr-1.5" />Overview
          </TabsTrigger>
          <TabsTrigger value="statements" className="flex-1" data-testid="tab-export-statements">
            <IconTrending className="h-3.5 w-3.5 mr-1.5" />Financial Statements
          </TabsTrigger>
          <TabsTrigger value="analysis" className="flex-1" data-testid="tab-export-analysis">
            <IconFileCheck className="h-3.5 w-3.5 mr-1.5" />Financial Analysis
          </TabsTrigger>
        </TabsList>

        {/* ── OVERVIEW ─────────────────────────────────────── */}
        <TabsContent value="overview" className="mt-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            Controls which sections appear in the <span className="font-medium text-foreground">Portfolio Overview</span> report — the first page users see when exporting from the Dashboard.
          </p>

          <ContentCard>
            <div className="py-1 pr-4">
              <GroupHeader title="Investment Performance" />
              <SectionToggle id="ov-kpi-metrics" label="Investment Performance"
                description="Portfolio IRR gauge, Property IRR Comparison bar chart, Equity by Property bar chart, and four KPI cards — Equity Multiple, Cash-on-Cash, Equity Invested, and Projected Exit value."
                checked={config.overview.kpiMetrics} onChange={(v) => updateNested("overview", "kpiMetrics", v)} />
              <GroupHeader title="Revenue & ANOI Projection" />
              <SectionToggle id="ov-revenue-chart" label="Revenue & ANOI Projection chart"
                description="Area/line chart showing consolidated Revenue and ANOI across the full hold period."
                checked={config.overview.revenueChart} onChange={(v) => updateNested("overview", "revenueChart", v)} />
              <SectionToggle id="ov-projection-table" label="Year-by-year projection table"
                description="Tabular breakdown of Revenue, NOI, ANOI, and Cash Flow for every year — printed below the chart on the same page."
                checked={config.overview.projectionTable} onChange={(v) => updateNested("overview", "projectionTable", v)}
                disabled={!config.overview.revenueChart} />
              <GroupHeader title="Portfolio & Capital Structure" />
              <SectionToggle id="ov-composition-tables" label="Portfolio & Capital Structure tables"
                description="Side-by-side Portfolio Composition stats (properties, rooms, markets, ADR) and Capital Structure stats (purchase price, cap rate, hold period, ANOI margin)."
                checked={config.overview.compositionTables} onChange={(v) => updateNested("overview", "compositionTables", v)} />
            </div>
            <div className="py-1 sm:pl-4">
              <GroupHeader title="Portfolio Insights" />
              <SectionToggle id="ov-property-insights" label="Portfolio Insights property table"
                description="One row per property — name, market, rooms, status, acquisition cost, ADR, and IRR."
                checked={config.overview.propertyInsights} onChange={(v) => updateNested("overview", "propertyInsights", v)} />
              <SectionToggle id="ov-ai-insights" label="Portfolio Insights summary card"
                description="Key portfolio totals — markets breakdown, 10-year consolidated Revenue, NOI, ANOI, and Cash Flow."
                checked={config.overview.aiInsights} onChange={(v) => updateNested("overview", "aiInsights", v)} />
              <GroupHeader title="Portfolio Composition" />
              <SectionToggle id="ov-composition-charts" label="Portfolio Composition charts"
                description="Portfolio by Market pie chart and Properties by Status bar chart showing geographic and status distribution."
                checked={config.overview.compositionCharts} onChange={(v) => updateNested("overview", "compositionCharts", v)} />
              <GroupHeader title="USALI Profit Waterfall" />
              <SectionToggle id="ov-waterfall-table" label="USALI Profit Waterfall"
                description="Revenue cascade from Total Revenue through Operating Expenses, GOP, Management Fees, AGOP, Fixed Charges, NOI, FF&E Reserve, and ANOI — across all projection years."
                checked={config.overview.waterfallTable} onChange={(v) => updateNested("overview", "waterfallTable", v)} />
            </div>
          </ContentCard>

          <SettingsCard title="Format">
            <SettingSwitch id="ov-landscape" label="Allow landscape orientation"
              description="Users can choose landscape when exporting — wider pages fit more columns."
              checked={config.overview.allowLandscape} onChange={(v) => updateNested("overview", "allowLandscape", v)} />
            <SettingSwitch id="ov-portrait" label="Allow portrait orientation"
              description="Users can choose portrait when exporting — taller layout, closer to standard paper."
              checked={config.overview.allowPortrait} onChange={(v) => updateNested("overview", "allowPortrait", v)} />
            <SettingSwitch id="ov-premium" label="Allow premium exports"
              description="Enables the AI-enhanced export mode — richer formatting, data insights, and design-quality output."
              checked={config.overview.allowPremium} onChange={(v) => updateNested("overview", "allowPremium", v)} />
            <SettingSwitch id="ov-dense" label="Dense pagination"
              description="Pack as much content per page as possible. Column headers repeat at the top of each continuation page."
              checked={config.overview.densePagination} onChange={(v) => updateNested("overview", "densePagination", v)} />
          </SettingsCard>

          <SettingsCard title="Report Length">
            <SettingSwitch id="ov-short" label="Allow short reports"
              description="Users can generate a condensed version with only key metrics and headline figures."
              checked={config.overview.allowShort} onChange={(v) => updateNested("overview", "allowShort", v)} />
            <SettingSwitch id="ov-extended" label="Allow extended reports"
              description="Users can generate the full-length report with all sections, charts, and detailed line items."
              checked={config.overview.allowExtended} onChange={(v) => updateNested("overview", "allowExtended", v)} />
          </SettingsCard>
        </TabsContent>

        {/* ── FINANCIAL STATEMENTS ─────────────────────────── */}
        <TabsContent value="statements" className="mt-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            Controls which statements and chart pages appear in <span className="font-medium text-foreground">Income Statement</span>, <span className="font-medium text-foreground">Cash Flow</span>, and <span className="font-medium text-foreground">Balance Sheet</span> exports — for both Dashboard (consolidated) and Property Detail reports.
          </p>

          <ContentCard>
            <div className="py-1 pr-4">
              <GroupHeader title="Income Statement" />
              <SectionToggle id="st-income-statement" label="Income Statement table"
                description="Revenue, operating expenses, GOP, management fees, AGOP, fixed charges, NOI, FF&E reserve, and ANOI — by year."
                checked={config.statements.incomeStatement} onChange={(v) => updateNested("statements", "incomeStatement", v)} />
              <SectionToggle id="st-income-chart" label="Income trend chart page"
                description="Line chart following the Income Statement — Revenue, GOP, AGOP, NOI, and ANOI across the hold period."
                checked={config.statements.incomeChart} onChange={(v) => updateNested("statements", "incomeChart", v)}
                disabled={!config.statements.incomeStatement} />
              <GroupHeader title="Cash Flow Statement" />
              <SectionToggle id="st-cash-flow" label="Cash Flow Statement table"
                description="Operating cash flow, debt service, FCF, principal payments, and Free Cash Flow to Equity — by year."
                checked={config.statements.cashFlow} onChange={(v) => updateNested("statements", "cashFlow", v)} />
              <SectionToggle id="st-cash-flow-chart" label="Cash Flow trend chart page"
                description="Line chart following the Cash Flow table — NOI, ANOI, FCF, and FCFE across the hold period."
                checked={config.statements.cashFlowChart} onChange={(v) => updateNested("statements", "cashFlowChart", v)}
                disabled={!config.statements.cashFlow} />
            </div>
            <div className="py-1 sm:pl-4">
              <GroupHeader title="Balance Sheet" />
              <SectionToggle id="st-balance-sheet" label="Balance Sheet table"
                description="Total assets (cash + property NBV), outstanding debt, equity invested, and retained earnings — by year."
                checked={config.statements.balanceSheet} onChange={(v) => updateNested("statements", "balanceSheet", v)} />
              <SectionToggle id="st-balance-sheet-chart" label="Balance Sheet trend chart page"
                description="Line chart following the Balance Sheet — Total Assets, Liabilities, and Equity across the hold period."
                checked={config.statements.balanceSheetChart} onChange={(v) => updateNested("statements", "balanceSheetChart", v)}
                disabled={!config.statements.balanceSheet} />
            </div>
          </ContentCard>

          <SettingsCard title="Format">
            <SettingSwitch id="st-landscape" label="Allow landscape orientation"
              description="Users can choose landscape when exporting — wider pages fit more columns."
              checked={config.statements.allowLandscape} onChange={(v) => updateNested("statements", "allowLandscape", v)} />
            <SettingSwitch id="st-portrait" label="Allow portrait orientation"
              description="Users can choose portrait when exporting — taller layout, closer to standard paper."
              checked={config.statements.allowPortrait} onChange={(v) => updateNested("statements", "allowPortrait", v)} />
            <SettingSwitch id="st-premium" label="Allow premium exports"
              description="Enables the AI-enhanced export mode — richer formatting, data insights, and design-quality output."
              checked={config.statements.allowPremium} onChange={(v) => updateNested("statements", "allowPremium", v)} />
            <SettingSwitch id="st-dense" label="Dense pagination"
              description="Pack as much content per page as possible. Column headers repeat at the top of each continuation page."
              checked={config.statements.densePagination} onChange={(v) => updateNested("statements", "densePagination", v)} />
          </SettingsCard>

          <SettingsCard title="Report Length">
            <SettingSwitch id="st-short" label="Allow short reports"
              description="Users can generate a condensed version with only key metrics and headline figures."
              checked={config.statements.allowShort} onChange={(v) => updateNested("statements", "allowShort", v)} />
            <SettingSwitch id="st-extended" label="Allow extended reports"
              description="Users can generate the full-length report with all sections, charts, and detailed line items."
              checked={config.statements.allowExtended} onChange={(v) => updateNested("statements", "allowExtended", v)} />
          </SettingsCard>
        </TabsContent>

        {/* ── FINANCIAL ANALYSIS ───────────────────────────── */}
        <TabsContent value="analysis" className="mt-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            Controls which analytical sections appear in exports — available on both the Dashboard and Property Detail reports.
          </p>

          <ContentCard>
            <div className="py-1 pr-4">
              <GroupHeader title="Portfolio KPIs" />
              <SectionToggle id="an-kpi-summary-cards" label="KPI summary cards"
                description="Total Equity, Exit Value, Equity Multiple, Avg Cash-on-Cash, and Portfolio IRR — displayed as highlighted metric cards at the top of the report."
                checked={config.analysis.kpiSummaryCards} onChange={(v) => updateNested("analysis", "kpiSummaryCards", v)} />
              <GroupHeader title="Investment Returns Chart" />
              <SectionToggle id="an-return-chart" label="Investment Returns line chart"
                description="Multi-series chart across the hold period — Net Operating Income (NOI), Adjusted NOI (ANOI), Debt Service, and Free Cash Flow to Equity."
                checked={config.analysis.returnChart} onChange={(v) => updateNested("analysis", "returnChart", v)} />
              <GroupHeader title="Cash Flow Analysis" />
              <SectionToggle id="an-free-cash-flow-table" label="Free Cash Flow Analysis table"
                description="Investor cash flow waterfall by year — Equity Investment, FCFE, Refinancing Proceeds, Exit Proceeds, Net Cash Flow to Investors, and Cumulative Cash Flow."
                checked={config.analysis.freeCashFlowTable} onChange={(v) => updateNested("analysis", "freeCashFlowTable", v)} />
            </div>
            <div className="py-1 sm:pl-4">
              <GroupHeader title="Property-Level Returns" />
              <SectionToggle id="an-property-irr-table" label="Property-Level IRR Analysis"
                description="Per-property table: Equity Investment, Income Tax rate, Exit Cap Rate, Exit Value, Total Distributions, Equity Multiple, and IRR — with Portfolio Total row."
                checked={config.analysis.propertyIrrTable} onChange={(v) => updateNested("analysis", "propertyIrrTable", v)} />
              <GroupHeader title="DCF Analysis" />
              <SectionToggle id="an-dcf-analysis" label="Discounted Cash Flow (DCF) Analysis"
                description="Portfolio WACC, DCF Value, NPV, and Value Creation summary cards — plus per-property DCF table with Country, CRP, Re, E/V, WACC, Equity, DCF Value, NPV, and Value Δ."
                checked={config.analysis.dcfAnalysis} onChange={(v) => updateNested("analysis", "dcfAnalysis", v)} />
              <GroupHeader title="Performance Trend Chart" />
              <SectionToggle id="an-performance-trend" label="Performance Trend line chart"
                description="Portfolio-wide Revenue, Operating Expenses, and Adjusted NOI (ANOI) plotted across the full hold period — shows margin trend over time."
                checked={config.analysis.performanceTrend} onChange={(v) => updateNested("analysis", "performanceTrend", v)} />
            </div>
          </ContentCard>

          <SettingsCard title="Format">
            <SettingSwitch id="an-landscape" label="Allow landscape orientation"
              description="Users can choose landscape when exporting — wider pages fit more columns."
              checked={config.analysis.allowLandscape} onChange={(v) => updateNested("analysis", "allowLandscape", v)} />
            <SettingSwitch id="an-portrait" label="Allow portrait orientation"
              description="Users can choose portrait when exporting — taller layout, closer to standard paper."
              checked={config.analysis.allowPortrait} onChange={(v) => updateNested("analysis", "allowPortrait", v)} />
            <SettingSwitch id="an-premium" label="Allow premium exports"
              description="Enables the AI-enhanced export mode — richer formatting, data insights, and design-quality output."
              checked={config.analysis.allowPremium} onChange={(v) => updateNested("analysis", "allowPremium", v)} />
            <SettingSwitch id="an-dense" label="Dense pagination"
              description="Pack as much content per page as possible. Column headers repeat at the top of each continuation page."
              checked={config.analysis.densePagination} onChange={(v) => updateNested("analysis", "densePagination", v)} />
          </SettingsCard>

          <SettingsCard title="Report Length">
            <SettingSwitch id="an-short" label="Allow short reports"
              description="Users can generate a condensed version with only key metrics and headline figures."
              checked={config.analysis.allowShort} onChange={(v) => updateNested("analysis", "allowShort", v)} />
            <SettingSwitch id="an-extended" label="Allow extended reports"
              description="Users can generate the full-length report with all sections, charts, and detailed line items."
              checked={config.analysis.allowExtended} onChange={(v) => updateNested("analysis", "allowExtended", v)} />
          </SettingsCard>
        </TabsContent>
      </Tabs>

      <div className="flex justify-end gap-2 pt-2 border-t border-border">
        <Button variant="outline" onClick={handleReset} disabled={saving} data-testid="button-export-reset">
          Reset to defaults
        </Button>
        <Button onClick={handleSave} disabled={!dirty || saving} data-testid="button-export-save">
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
