import { useState, useMemo, useRef, useCallback } from "react";
import { useExportSave } from "@/hooks/useExportSave";
import { useStore } from "@/lib/store";
import { AnimatedPage, ScrollReveal, KPIGrid, InsightPanel, DonutChart } from "@/components/graphics";
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Legend, ResponsiveContainer, Tooltip } from "recharts";
import { ExportMenu, pdfAction, excelAction, csvAction, pptxAction, chartAction, pngAction } from "@/components/ui/export-toolbar";
import { exportTablePNG, captureChartAsImage } from "@/lib/exports/pngExport";
import { downloadCSV } from "@/lib/exports/csvExport";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Check, Trophy, Info } from "@/components/icons/themed-icons";
// jspdf, jspdf-autotable, xlsx, pptxgenjs are dynamically imported in export handlers

function fmtMoney(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function fmtPct(value: number): string {
  return (value * 100).toFixed(1) + "%";
}

type MetricRow = {
  label: string;
  key: string;
  format: "text" | "money" | "percent";
  bestDir?: "high" | "low";
};

const METRICS: MetricRow[] = [
  { label: "Location", key: "location", format: "text" },
  { label: "Status", key: "status", format: "text" },
  { label: "Room Count", key: "roomCount", format: "text", bestDir: "high" },
  { label: "Start ADR", key: "startAdr", format: "money", bestDir: "high" },
  { label: "ADR Growth Rate", key: "adrGrowthRate", format: "percent", bestDir: "high" },
  { label: "Start Occupancy", key: "startOccupancy", format: "percent", bestDir: "high" },
  { label: "Max Occupancy", key: "maxOccupancy", format: "percent", bestDir: "high" },
  { label: "Purchase Price", key: "purchasePrice", format: "money", bestDir: "low" },
  { label: "Building Improvements", key: "buildingImprovements", format: "money", bestDir: "low" },
  { label: "Insurance Rate", key: "costRateInsurance", format: "percent", bestDir: "low" },
  { label: "Financing Type", key: "type", format: "text" },
];

export default function ComparisonView({ embedded }: { embedded?: boolean }) {
  const properties = useStore((s) => s.properties);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const chartRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  const selectedProperties = useMemo(
    () => properties.filter((p) => selectedIds.includes(p.id)),
    [properties, selectedIds]
  );

  const toggleProperty = (id: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((x) => x !== id);
      }
      if (prev.length >= 4) return prev;
      return [...prev, id];
    });
  };

  const getBestValue = (key: string, dir?: "high" | "low"): number | string | null => {
    if (!dir || selectedProperties.length < 2) return null;
    const values = selectedProperties.map((p) => (p as unknown as Record<string, unknown>)[key] as number);
    if (values.some((v) => typeof v !== "number")) return null;
    return dir === "high" ? Math.max(...values) : Math.min(...values);
  };

  const formatValue = (value: any, format: "text" | "money" | "percent"): string => {
    if (value === null || value === undefined) return "—";
    if (format === "money") return fmtMoney(value);
    if (format === "percent") return fmtPct(value);
    return String(value);
  };

  const propertyWins = useMemo(() => {
    if (selectedProperties.length < 2) return {};
    const wins: Record<string, number> = {};
    selectedProperties.forEach(p => wins[p.id] = 0);
    
    METRICS.forEach(m => {
      if (!m.bestDir) return;
      const best = getBestValue(m.key, m.bestDir);
      selectedProperties.forEach(p => {
        if ((p as unknown as Record<string, unknown>)[m.key] === best) {
          wins[p.id]++;
        }
      });
    });
    return wins;
  }, [selectedProperties]);

  const overallWinner = useMemo(() => {
    if (selectedProperties.length < 2) return null;
    const winnerId = Object.entries(propertyWins).reduce((a, b) => b[1] > a[1] ? b : a)[0];
    return selectedProperties.find(p => p.id === winnerId);
  }, [propertyWins, selectedProperties]);

  const { requestSave, SaveDialog } = useExportSave();

  const handleExportPDF = useCallback(async (customFilename?: string) => {
    if (selectedProperties.length < 2) return;
    const { default: jsPDF } = await import("jspdf");
    const { default: autoTable } = await import("jspdf-autotable");
    const { PAGE_DIMS } = await import("@/lib/exports/exportStyles");
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: [PAGE_DIMS.LANDSCAPE_W, PAGE_DIMS.LANDSCAPE_H] });
    doc.setFontSize(16);
    doc.text("Property Comparison", 14, 20);
    const headers = ["Metric", ...selectedProperties.map((p) => p.name)];
    const rows = METRICS.map((m) => [
      m.label,
      ...selectedProperties.map((p) => formatValue((p as unknown as Record<string, unknown>)[m.key], m.format)),
    ]);
    autoTable(doc, { head: [headers], body: rows, startY: 28 });
    const { saveFile } = await import("@/lib/exports/saveFile");
    await saveFile(doc.output("blob"), customFilename || "property-comparison.pdf");
  }, [selectedProperties]);

  const handleExportExcel = useCallback(async (customFilename?: string) => {
    if (selectedProperties.length < 2) return;
    const XLSX = await import("xlsx");
    const headers = ["Metric", ...selectedProperties.map((p) => p.name)];
    const rows = METRICS.map((m) => [
      m.label,
      ...selectedProperties.map((p) => formatValue((p as unknown as Record<string, unknown>)[m.key], m.format)),
    ]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Comparison");
    const { saveFile } = await import("@/lib/exports/saveFile");
    const xlData = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const xlBlob = new Blob([xlData], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    await saveFile(xlBlob, customFilename || "property-comparison.xlsx");
  }, [selectedProperties]);

  const handleExportCSV = useCallback((customFilename?: string) => {
    if (selectedProperties.length < 2) return;
    const headers = ["Metric", ...selectedProperties.map((p) => p.name)];
    const rows = METRICS.map((m) => [
      m.label,
      ...selectedProperties.map((p) => formatValue((p as unknown as Record<string, unknown>)[m.key], m.format)),
    ]);
    const csvContent = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    downloadCSV(csvContent, customFilename || "property-comparison.csv");
  }, [selectedProperties]);

  const handleExportPPTX = useCallback(async (customFilename?: string) => {
    if (selectedProperties.length < 2) return;
    const { default: pptxgen } = await import("pptxgenjs");
    const pptx = new pptxgen();
    const slide1 = pptx.addSlide();
    slide1.background = { color: "0F172A" };
    slide1.addText("Property Comparison", { x: 0.5, y: 1.8, w: 9, h: 1.2, fontSize: 36, bold: true, color: "FFFFFF", align: "center" });
    slide1.addText(selectedProperties.map((p) => p.name).join(" vs "), { x: 0.5, y: 3.2, w: 9, h: 0.6, fontSize: 18, color: "94A3B8", align: "center" });
    const slide2 = pptx.addSlide();
    slide2.addText("Comparison Table", { x: 0.5, y: 0.3, w: 9, h: 0.5, fontSize: 20, bold: true, color: "0F172A" });
    const tableRows = [
      [{ text: "Metric", options: { bold: true } }, ...selectedProperties.map((p) => ({ text: p.name, options: { bold: true } }))],
      ...METRICS.map((m) => [
        { text: m.label, options: {} },
        ...selectedProperties.map((p) => ({ text: formatValue((p as unknown as Record<string, unknown>)[m.key], m.format), options: {} })),
      ]),
    ];
    slide2.addTable(tableRows, { x: 0.5, y: 1.0, w: 9, colW: [2.5, ...selectedProperties.map(() => 6.5 / selectedProperties.length)] });
    const { saveFile } = await import("@/lib/exports/saveFile");
    const pptxBlob = await pptx.write({ outputType: "blob" }) as Blob;
    await saveFile(pptxBlob, customFilename || "property-comparison.pptx");
  }, [selectedProperties]);

  const handleExportChart = useCallback(async (customFilename?: string) => {
    if (!chartRef.current) return;
    const dataUrl = await captureChartAsImage(chartRef.current);
    if (!dataUrl) return;
    const { saveDataUrl } = await import("@/lib/exports/saveFile");
    await saveDataUrl(dataUrl, customFilename || "property-comparison-chart.png");
  }, []);

  const handleExportPNG = useCallback((customFilename?: string) => {
    if (!tableRef.current) return;
    exportTablePNG({ element: tableRef.current, filename: customFilename || "property-comparison-table.png" });
  }, []);

  const content = (
    <div className={embedded ? "space-y-6" : "min-h-screen bg-background p-6 md:p-8"} data-testid="comparison-view">
      {SaveDialog}
      <div className={embedded ? "space-y-6" : "max-w-7xl mx-auto space-y-8"}>
        {!embedded && (
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground" data-testid="text-page-title">
              Property Comparison
            </h1>
            <p className="text-muted-foreground mt-1" data-testid="text-page-subtitle">
              Select 2–4 properties to compare assumptions side by side
            </p>
          </div>
          {selectedProperties.length >= 2 && (
            <ExportMenu
              actions={[
                pdfAction(() => requestSave("Property Comparison", ".pdf", (f) => handleExportPDF(f))),
                excelAction(() => requestSave("Property Comparison", ".xlsx", (f) => handleExportExcel(f))),
                csvAction(() => requestSave("Property Comparison", ".csv", (f) => handleExportCSV(f))),
                pptxAction(() => requestSave("Property Comparison", ".pptx", (f) => handleExportPPTX(f))),
                chartAction(() => requestSave("Property Comparison Chart", ".png", (f) => handleExportChart(f))),
                pngAction(() => requestSave("Property Comparison Table", ".png", (f) => handleExportPNG(f))),
              ]}
            />
          )}
        </div>
        )}

        <div className="bg-card rounded-xl border border-border p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-1">Property Comparison</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Compare up to 4 properties side by side across key assumptions — room count, ADR, occupancy, purchase price, and more. 
                Best values are highlighted in green to quickly spot which properties have the strongest fundamentals. 
                Use this to evaluate acquisition targets or benchmark existing portfolio assets.
              </p>
            </div>
          </div>
        </div>

        <div className="bg-card rounded-xl border border-border p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-foreground mb-4" data-testid="text-selector-heading">
            Select Properties ({selectedIds.length}/4)
          </h2>
          <div className="flex flex-wrap gap-3">
            {properties.map((p) => {
              const checked = selectedIds.includes(p.id);
              const disabled = !checked && selectedIds.length >= 4;
              return (
                <Card
                  key={p.id}
                  className={`relative cursor-pointer transition-all duration-200 hover:shadow-md ${
                    checked
                      ? "ring-2 ring-primary border-primary bg-primary/5"
                      : disabled
                      ? "opacity-50 cursor-not-allowed grayscale"
                      : "hover:border-primary/50"
                  }`}
                  onClick={() => !disabled && toggleProperty(p.id)}
                  data-testid={`card-property-${p.id}`}
                >
                  <CardContent className="p-4 flex flex-col items-center text-center gap-2">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center ${checked ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                      {checked ? <Check className="w-6 h-6" /> : <div className="w-6 h-6 rounded-full border-2 border-dashed border-current" />}
                    </div>
                    <div>
                      <p className="text-sm font-bold truncate max-w-[120px]">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{p.location}</p>
                    </div>
                    <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                      {p.status}
                    </Badge>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        {selectedProperties.length >= 2 ? (
          <>
          {overallWinner && (
            <div className="bg-primary/10 border border-primary/20 rounded-xl p-4 flex items-center justify-between shadow-sm animate-in fade-in slide-in-from-top-4 duration-500">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center text-primary-foreground shadow-sm">
                  <Trophy className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-foreground">Performance Leader: {overallWinner.name}</h3>
                  <p className="text-xs text-muted-foreground">Wins on {propertyWins[overallWinner.id]} out of {METRICS.filter(m => m.bestDir).length} key metrics compared.</p>
                </div>
              </div>
              <div className="flex gap-2">
                {selectedProperties.map(p => (
                   <div key={p.id} className="flex flex-col items-center">
                     <div className="text-[10px] font-bold text-muted-foreground mb-1">{p.name}</div>
                     <div className="h-1.5 w-16 bg-muted rounded-full overflow-hidden">
                        <div 
                          className={`h-full transition-all duration-500 ${p.id === overallWinner.id ? 'bg-primary' : 'bg-muted-foreground/30'}`} 
                          style={{ width: `${(propertyWins[p.id] / METRICS.filter(m => m.bestDir).length) * 100}%` }}
                        />
                     </div>
                   </div>
                ))}
              </div>
            </div>
          )}

          <KPIGrid
            data-testid="kpi-comparison"
            items={[
              { label: "Properties Selected", value: selectedProperties.length, sublabel: "comparing side by side" },
              { label: "Avg Start ADR", value: selectedProperties.reduce((s, p) => s + p.startAdr, 0) / selectedProperties.length, format: (v: number) => fmtMoney(v) },
              { label: "Avg Occupancy", value: selectedProperties.reduce((s, p) => s + p.startOccupancy, 0) / selectedProperties.length * 100, format: (v: number) => `${v.toFixed(1)}%` },
              { label: "Total Rooms", value: selectedProperties.reduce((s, p) => s + p.roomCount, 0) },
            ]}
            columns={4}
            variant="light"
          />
          <ScrollReveal>
            <div ref={chartRef} className="bg-card rounded-xl border border-border shadow-sm p-8">
              <h3 className="text-lg font-display text-foreground mb-6 text-center">Relative Performance Profile</h3>
              <div className="h-[450px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart cx="50%" cy="50%" outerRadius="80%" data={[
                    { metric: "ADR", ...Object.fromEntries(selectedProperties.map(p => [p.name, Math.min(p.startAdr / 5, 100)])) },
                    { metric: "Occupancy", ...Object.fromEntries(selectedProperties.map(p => [p.name, p.startOccupancy * 100])) },
                    { metric: "Rooms", ...Object.fromEntries(selectedProperties.map(p => [p.name, Math.min(p.roomCount, 100)])) },
                    { metric: "Growth", ...Object.fromEntries(selectedProperties.map(p => [p.name, p.adrGrowthRate * 100 * 10])) },
                    { metric: "Max Occ", ...Object.fromEntries(selectedProperties.map(p => [p.name, p.maxOccupancy * 100])) },
                  ]}>
                    <PolarGrid stroke="hsl(var(--border))" />
                    <PolarAngleAxis dataKey="metric" tick={{ fill: "hsl(var(--foreground))", fontSize: 13, fontWeight: 500 }} />
                    <PolarRadiusAxis tick={false} axisLine={false} />
                    {selectedProperties.map((p, i) => (
                      <Radar 
                        key={p.id} 
                        name={p.name} 
                        dataKey={p.name} 
                        stroke={["hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))"][i]} 
                        fill={["hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))"][i]} 
                        fillOpacity={0.25} 
                        strokeWidth={3} 
                        animationDuration={1500}
                      />
                    ))}
                    <Legend verticalAlign="bottom" wrapperStyle={{ paddingTop: '30px', fontSize: 13, fontWeight: 500 }} />
                    <Tooltip 
                      contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      itemStyle={{ padding: '2px 0' }}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </ScrollReveal>
          <div className="grid gap-6 lg:grid-cols-2">
            <DonutChart
              data-testid="donut-comparison-rooms"
              data={selectedProperties.map(p => ({ name: p.name, value: p.roomCount }))}
              title="Room Distribution"
              subtitle="Room count by property"
              centerValue={String(selectedProperties.reduce((s, p) => s + p.roomCount, 0))}
              centerLabel="Total Rooms"
            />
            <DonutChart
              data-testid="donut-comparison-price"
              data={selectedProperties.map(p => ({ name: p.name, value: p.purchasePrice }))}
              title="Investment Distribution"
              subtitle="Purchase price by property"
              centerValue={fmtMoney(selectedProperties.reduce((s, p) => s + p.purchasePrice, 0))}
              centerLabel="Total Investment"
              formatValue={fmtMoney}
            />
          </div>
          <InsightPanel
            data-testid="insight-comparison"
            variant="compact"
            title="Comparison Findings"
            insights={(() => {
              const insights: Array<{text: string; metric?: string; type: "positive" | "negative" | "warning" | "neutral"}> = [];
              const adrs = selectedProperties.map(p => ({ name: p.name, v: p.startAdr }));
              const bestAdr = adrs.reduce((a, b) => a.v > b.v ? a : b);
              insights.push({ text: `Highest ADR: ${bestAdr.name}`, metric: fmtMoney(bestAdr.v), type: "positive" });
              const occs = selectedProperties.map(p => ({ name: p.name, v: p.maxOccupancy }));
              const bestOcc = occs.reduce((a, b) => a.v > b.v ? a : b);
              insights.push({ text: `Best Max Occupancy: ${bestOcc.name}`, metric: fmtPct(bestOcc.v), type: "positive" });
              const prices = selectedProperties.map(p => ({ name: p.name, v: p.purchasePrice }));
              const lowestPrice = prices.reduce((a, b) => a.v < b.v ? a : b);
              insights.push({ text: `Lowest Purchase Price: ${lowestPrice.name}`, metric: fmtMoney(lowestPrice.v), type: "positive" });
              return insights;
            })()}
          />
          <div ref={tableRef} className="bg-card rounded-xl border border-border shadow-md overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="table-comparison">
                <thead>
                  <tr>
                    <th className="text-left px-6 py-4 bg-muted/80 text-muted-foreground font-bold border-b min-w-[200px] uppercase tracking-wider text-xs">
                      Metric
                    </th>
                    {selectedProperties.map((p) => (
                      <th
                        key={p.id}
                        className="text-center px-6 py-4 border-b bg-muted/80 text-foreground font-bold min-w-[180px]"
                        data-testid={`header-property-${p.id}`}
                      >
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-sm">{p.name}</span>
                          <Badge variant="secondary" className="text-[10px] font-medium h-4 px-1.5">
                            {p.location}
                          </Badge>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {METRICS.map((metric, idx) => {
                    const best = getBestValue(metric.key, metric.bestDir);
                    return (
                      <tr
                        key={metric.key}
                        className={`transition-colors hover:bg-muted/30 ${idx % 2 === 0 ? "bg-card" : "bg-muted/20"}`}
                        data-testid={`row-${metric.key}`}
                      >
                        <td className="px-6 py-4 font-semibold text-foreground border-r border-border/50">
                          {metric.label}
                        </td>
                        {selectedProperties.map((p) => {
                          const raw = (p as unknown as Record<string, unknown>)[metric.key];
                          const isBest =
                            best !== null &&
                            typeof raw === "number" &&
                            raw === best;
                          return (
                            <td
                              key={p.id}
                              className={`px-6 py-4 text-center transition-all ${
                                isBest ? "bg-primary/5" : "text-foreground"
                              }`}
                              data-testid={`cell-${metric.key}-${p.id}`}
                            >
                              {isBest ? (
                                <div className="flex items-center justify-center gap-2">
                                  <Badge variant="default" className="bg-primary hover:bg-primary font-bold shadow-none text-primary-foreground border-none">
                                    {formatValue(raw, metric.format)}
                                  </Badge>
                                </div>
                              ) : (
                                formatValue(raw, metric.format)
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
        ) : (
          <div className="bg-card rounded-xl border border-border p-12 text-center shadow-sm">
            <p className="text-muted-foreground text-lg" data-testid="text-empty-state">
              {selectedIds.length === 0
                ? "Select at least 2 properties above to begin comparing."
                : "Select one more property to start the comparison."}
            </p>
          </div>
        )}
      </div>
    </div>
  );

  if (embedded) return content;
  return <AnimatedPage>{content}</AnimatedPage>;
}
