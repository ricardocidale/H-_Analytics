import { useCallback, useMemo, type RefObject } from "react";
import { formatMoney } from "@/lib/financialEngine";
import { downloadCSV } from "@/lib/exports/csvExport";
import { exportTablePNG, captureChartAsImage } from "@/lib/exports/pngExport";
import { drawCanvasAsImage } from "@/lib/exports/pdfHelpers";
import type { SensitivityHeatMapRef } from "@/components/charts/SensitivityHeatMap";
import type { TornadoDiagramRef } from "@/components/charts/TornadoDiagram";
import type { ScenarioResult, TornadoItem } from "./types";

interface UseSensitivityExportsArgs {
  baseResult: ScenarioResult | null;
  adjustedResult: ScenarioResult | null;
  tornadoData: TornadoItem[];
  tornadoMetric: "noi" | "irr";
  advancedChartView: string;
  chartRef: RefObject<HTMLDivElement | null>;
  tableRef: RefObject<HTMLDivElement | null>;
  heatmapRef: RefObject<SensitivityHeatMapRef | null>;
  tornadoD3Ref: RefObject<TornadoDiagramRef | null>;
}

export function useSensitivityExports({
  baseResult,
  adjustedResult,
  tornadoData,
  tornadoMetric,
  advancedChartView,
  chartRef,
  tableRef,
  heatmapRef,
  tornadoD3Ref,
}: UseSensitivityExportsArgs) {
  const comparisonRows = useMemo(() => {
    if (!baseResult || !adjustedResult) return [];
    return [
      { label: "Total Revenue", base: baseResult.totalRevenue, adj: adjustedResult.totalRevenue, fmt: "money" as const },
      { label: "Total NOI", base: baseResult.totalNOI, adj: adjustedResult.totalNOI, fmt: "money" as const },
      { label: "NOI Margin", base: baseResult.avgNOIMargin, adj: adjustedResult.avgNOIMargin, fmt: "pct" as const },
      { label: "Total Cash Flow", base: baseResult.totalCashFlow, adj: adjustedResult.totalCashFlow, fmt: "money" as const },
      { label: "Exit Value", base: baseResult.exitValue, adj: adjustedResult.exitValue, fmt: "money" as const },
      { label: "Levered IRR", base: baseResult.irr * 100, adj: adjustedResult.irr * 100, fmt: "pct" as const },
    ];
  }, [baseResult, adjustedResult]);

  const handleExportPDF = useCallback(async (orientation: "landscape" | "portrait", customFilename?: string) => {
    if (!baseResult) return;
    const { default: jsPDF } = await import("jspdf");
    const { default: autoTable } = await import("jspdf-autotable");
    const { PAGE_DIMS } = await import("@/lib/exports/exportStyles");
    const dims = orientation === "landscape"
      ? { w: PAGE_DIMS.LANDSCAPE_W, h: PAGE_DIMS.LANDSCAPE_H }
      : { w: PAGE_DIMS.PORTRAIT_W, h: PAGE_DIMS.PORTRAIT_H };
    const doc = new jsPDF({ orientation, unit: "mm", format: [dims.w, dims.h] });
    const pageWidth = dims.w;

    doc.setFontSize(20);
    doc.setTextColor(37, 125, 65);
    doc.text("Sensitivity Analysis", 14, 18);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Base IRR: ${(baseResult.irr * 100).toFixed(1)}%  |  Base NOI: ${formatMoney(baseResult.totalNOI)}  |  Exit Value: ${formatMoney(baseResult.exitValue)}`, 14, 26);

    if (comparisonRows.length) {
      doc.setFontSize(13);
      doc.setTextColor(40);
      doc.text("Base vs. Adjusted Scenario", 14, 36);
      autoTable(doc, {
        startY: 40,
        head: [["Metric", "Base Case", "Adjusted", "Change"]],
        body: comparisonRows.map((r) => {
          const delta = r.adj - r.base;
          const deltaPct = r.base !== 0 ? (delta / Math.abs(r.base)) * 100 : 0;
          const fmt = (v: number) => r.fmt === "money" ? formatMoney(v) : `${v.toFixed(1)}%`;
          return [
            r.label,
            fmt(r.base),
            fmt(r.adj),
            `${delta >= 0 ? "+" : ""}${r.fmt === "money" ? formatMoney(delta) : `${delta.toFixed(1)}pp`} (${deltaPct >= 0 ? "+" : ""}${deltaPct.toFixed(1)}%)`,
          ];
        }),
        styles: { fontSize: 10, cellPadding: 3 },
        headStyles: { fillColor: [37, 125, 65], textColor: 255 },
        alternateRowStyles: { fillColor: [245, 252, 247] },
        margin: { left: 14, right: 14 },
      });
    }

    if (tornadoData.length) {
      const finalY = doc.lastAutoTable?.finalY ?? 80;
      doc.setFontSize(13);
      doc.setTextColor(40);
      doc.text(`Tornado Chart — Impact on ${tornadoMetric === "irr" ? "IRR (pp)" : "NOI (%)"}`, 14, finalY + 12);
      autoTable(doc, {
        startY: finalY + 16,
        head: [["Variable", "Upside", "Downside", "Spread"]],
        body: tornadoData.map((d) => [
          d.name,
          `${d.positive >= 0 ? "+" : ""}${d.positive.toFixed(2)}${tornadoMetric === "irr" ? "pp" : "%"}`,
          `${d.negative.toFixed(2)}${tornadoMetric === "irr" ? "pp" : "%"}`,
          `${d.spread.toFixed(2)}${tornadoMetric === "irr" ? "pp" : "%"}`,
        ]),
        styles: { fontSize: 10, cellPadding: 3 },
        headStyles: { fillColor: [37, 125, 65], textColor: 255 },
        alternateRowStyles: { fillColor: [245, 252, 247] },
        margin: { left: 14, right: pageWidth - 14 - (pageWidth - 28) },
      });
    }

    if (advancedChartView === "heatmap" && heatmapRef.current) {
      try {
        const canvas = await heatmapRef.current.toCanvas();
        const pageWidth = doc.internal.pageSize.getWidth();
        doc.addPage();
        doc.setFontSize(12);
        doc.text("Sensitivity Heat Map \u2014 ADR \u00d7 Occupancy", 14, 14);
        drawCanvasAsImage(doc, canvas, 14, 22, pageWidth - 28, 180);
      } catch { /* ignore: chart may not be rendered yet */ }
    }
    if (advancedChartView === "tornado-d3" && tornadoD3Ref.current) {
      try {
        const canvas = await tornadoD3Ref.current.toCanvas();
        const pageWidth = doc.internal.pageSize.getWidth();
        doc.addPage();
        doc.setFontSize(12);
        doc.text("Tornado Diagram \u2014 Assumption Impact", 14, 14);
        drawCanvasAsImage(doc, canvas, 14, 22, pageWidth - 28, 180);
      } catch { /* ignore: chart may not be rendered yet */ }
    }

    const { saveFile } = await import("@/lib/exports/saveFile");
    await saveFile(doc.output("blob"), customFilename || "sensitivity-analysis.pdf");
  }, [baseResult, comparisonRows, tornadoData, tornadoMetric, advancedChartView]);

  const handleExportExcel = useCallback(async (customFilename?: string) => {
    if (!baseResult) return;
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();

    const compSheet = [
      ["Metric", "Base Case", "Adjusted", "Delta", "Delta %"],
      ...comparisonRows.map((r) => {
        const delta = r.adj - r.base;
        const deltaPct = r.base !== 0 ? (delta / Math.abs(r.base)) * 100 : 0;
        const fmt = (v: number) => r.fmt === "money" ? formatMoney(v) : `${v.toFixed(1)}%`;
        return [r.label, fmt(r.base), fmt(r.adj), `${delta >= 0 ? "+" : ""}${fmt(delta)}`, `${deltaPct >= 0 ? "+" : ""}${deltaPct.toFixed(1)}%`];
      }),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(compSheet), "Comparison");

    const tornadoSheet = [
      ["Variable", `Upside (${tornadoMetric === "irr" ? "pp" : "%"})`, `Downside (${tornadoMetric === "irr" ? "pp" : "%"})`, `Spread (${tornadoMetric === "irr" ? "pp" : "%"})`],
      ...tornadoData.map((d) => [d.name, d.positive.toFixed(2), d.negative.toFixed(2), d.spread.toFixed(2)]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(tornadoSheet), "Tornado Chart");

    const { saveFile } = await import("@/lib/exports/saveFile");
    const xlData = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const xlBlob = new Blob([xlData], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    await saveFile(xlBlob, customFilename || "sensitivity-analysis.xlsx");
  }, [baseResult, comparisonRows, tornadoData, tornadoMetric]);

  const handleExportCSV = useCallback((customFilename?: string) => {
    if (!baseResult) return;
    const rows = [
      ["Metric", "Base Case", "Adjusted", "Delta", "Delta %"],
      ...comparisonRows.map((r) => {
        const delta = r.adj - r.base;
        const deltaPct = r.base !== 0 ? (delta / Math.abs(r.base)) * 100 : 0;
        const fmt = (v: number) => r.fmt === "money" ? formatMoney(v) : `${v.toFixed(1)}%`;
        return [r.label, fmt(r.base), fmt(r.adj), `${delta >= 0 ? "+" : ""}${fmt(delta)}`, `${deltaPct >= 0 ? "+" : ""}${deltaPct.toFixed(1)}%`];
      }),
      [],
      [`Tornado Chart — Impact on ${tornadoMetric === "irr" ? "IRR (pp)" : "NOI (%)"}`],
      ["Variable", "Upside", "Downside", "Spread"],
      ...tornadoData.map((d) => [d.name, d.positive.toFixed(2), d.negative.toFixed(2), d.spread.toFixed(2)]),
    ];
    const content = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    downloadCSV(content, customFilename || "sensitivity-analysis.csv");
  }, [baseResult, comparisonRows, tornadoData, tornadoMetric]);

  const handleExportPPTX = useCallback(async (customFilename?: string) => {
    if (!baseResult) return;
    const { default: pptxgen } = await import("pptxgenjs");
    const pres = new pptxgen();
    pres.layout = "LAYOUT_WIDE";

    const title = pres.addSlide();
    title.background = { color: "1a2a3a" };
    title.addShape(pres.ShapeType.rect, { x: 0, y: 0, w: "100%", h: 0.05, fill: { color: "9FBCA4" } });
    title.addText("Sensitivity Analysis", { x: 0.5, y: 1.8, w: 12, h: 0.7, fontSize: 32, fontFace: "Arial", color: "FFFFFF", bold: true });
    title.addText(`Base IRR: ${(baseResult.irr * 100).toFixed(1)}%  |  NOI Margin: ${baseResult.avgNOIMargin.toFixed(1)}%  |  Exit Value: ${formatMoney(baseResult.exitValue)}`, { x: 0.5, y: 2.6, w: 12, h: 0.4, fontSize: 14, fontFace: "Arial", color: "9FBCA4" });

    if (comparisonRows.length) {
      const kpiSlide = pres.addSlide();
      kpiSlide.addText("Base vs. Adjusted Scenario", { x: 0.5, y: 0.3, w: 12, h: 0.5, fontSize: 18, fontFace: "Arial", color: "257D41", bold: true });
      kpiSlide.addTable(
        [
          [{ text: "Metric", options: { bold: true, fill: { color: "257D41" }, color: "FFFFFF" } },
           { text: "Base Case", options: { bold: true, fill: { color: "257D41" }, color: "FFFFFF" } },
           { text: "Adjusted", options: { bold: true, fill: { color: "257D41" }, color: "FFFFFF" } },
           { text: "Change", options: { bold: true, fill: { color: "257D41" }, color: "FFFFFF" } }],
          ...comparisonRows.map((r, i) => {
            const delta = r.adj - r.base;
            const deltaPct = r.base !== 0 ? (delta / Math.abs(r.base)) * 100 : 0;
            const fmt = (v: number) => r.fmt === "money" ? formatMoney(v) : `${v.toFixed(1)}%`;
            const bg = i % 2 === 0 ? "F5FCF7" : "FFFFFF";
            return [
              { text: r.label, options: { fill: { color: bg } } },
              { text: fmt(r.base), options: { fill: { color: bg } } },
              { text: fmt(r.adj), options: { fill: { color: bg }, bold: true } },
              { text: `${delta >= 0 ? "+" : ""}${fmt(delta)} (${deltaPct >= 0 ? "+" : ""}${deltaPct.toFixed(1)}%)`, options: { fill: { color: bg }, color: delta > 0 ? "257D41" : delta < 0 ? "C0392B" : "666666" } },
            ];
          }),
        ],
        { x: 0.5, y: 1.0, w: 12, h: 4.5, fontSize: 11, border: { type: "solid", color: "E5E7EB" } }
      );
    }

    if (tornadoData.length) {
      const tornadoSlide = pres.addSlide();
      tornadoSlide.addText(`Tornado Chart — Impact on ${tornadoMetric === "irr" ? "IRR (pp)" : "NOI (%)"}`, { x: 0.5, y: 0.3, w: 12, h: 0.5, fontSize: 18, fontFace: "Arial", color: "257D41", bold: true });
      tornadoSlide.addTable(
        [
          [
            { text: "Variable", options: { bold: true, fill: { color: "257D41" }, color: "FFFFFF" } },
            { text: "Upside", options: { bold: true, fill: { color: "257D41" }, color: "FFFFFF" } },
            { text: "Downside", options: { bold: true, fill: { color: "257D41" }, color: "FFFFFF" } },
            { text: "Spread", options: { bold: true, fill: { color: "257D41" }, color: "FFFFFF" } },
          ],
          ...tornadoData.map((d, i) => {
            const bg = i % 2 === 0 ? "F5FCF7" : "FFFFFF";
            return [
              { text: d.name, options: { fill: { color: bg } } },
              { text: `+${d.positive.toFixed(2)}`, options: { fill: { color: bg }, color: "257D41" } },
              { text: d.negative.toFixed(2), options: { fill: { color: bg }, color: "C0392B" } },
              { text: d.spread.toFixed(2), options: { fill: { color: bg }, bold: true } },
            ];
          }),
        ],
        { x: 0.5, y: 1.0, w: 12, h: 5, fontSize: 11, border: { type: "solid", color: "E5E7EB" } }
      );
    }

    if (advancedChartView === "heatmap" && heatmapRef.current) {
      try {
        const canvas = await heatmapRef.current.toCanvas();
        const slide = pres.addSlide();
        slide.addText("Sensitivity Heat Map — ADR × Occupancy", { x: 0.5, y: 0.2, w: 12, h: 0.4, fontSize: 16, fontFace: "Arial", color: "257D41", bold: true });
        const dataUrl = canvas.toDataURL("image/png");
        const ar = canvas.width / canvas.height;
        const maxW = 12; const maxH = 6;
        let w = maxW; let h = maxW / ar;
        if (h > maxH) { h = maxH; w = maxH * ar; }
        slide.addImage({ data: dataUrl, x: (13.33 - w) / 2, y: 0.8, w, h });
      } catch { /* ignore: chart may not be rendered yet */ }
    }
    if (advancedChartView === "tornado-d3" && tornadoD3Ref.current) {
      try {
        const canvas = await tornadoD3Ref.current.toCanvas();
        const slide = pres.addSlide();
        slide.addText("Tornado Diagram — Assumption Impact", { x: 0.5, y: 0.2, w: 12, h: 0.4, fontSize: 16, fontFace: "Arial", color: "257D41", bold: true });
        const dataUrl = canvas.toDataURL("image/png");
        const ar = canvas.width / canvas.height;
        const maxW = 12; const maxH = 6;
        let w = maxW; let h = maxW / ar;
        if (h > maxH) { h = maxH; w = maxH * ar; }
        slide.addImage({ data: dataUrl, x: (13.33 - w) / 2, y: 0.8, w, h });
      } catch { /* ignore: chart may not be rendered yet */ }
    }

    const pptxBlob = await pres.write({ outputType: "blob" }) as Blob;
    const { saveFile: savePptx } = await import("@/lib/exports/saveFile");
    await savePptx(pptxBlob, customFilename || "sensitivity-analysis.pptx");
  }, [baseResult, comparisonRows, tornadoData, tornadoMetric, advancedChartView]);

  const handleExportChart = useCallback(async (orientation: "landscape" | "portrait", customFilename?: string) => {
    if (!chartRef.current) return;
    const dataUrl = await captureChartAsImage(chartRef.current);
    if (!dataUrl) return;
    const { default: jsPDF } = await import("jspdf");
    const { PAGE_DIMS } = await import("@/lib/exports/exportStyles");
    const dims = orientation === "landscape"
      ? { w: PAGE_DIMS.LANDSCAPE_W, h: PAGE_DIMS.LANDSCAPE_H }
      : { w: PAGE_DIMS.PORTRAIT_W, h: PAGE_DIMS.PORTRAIT_H };
    const doc = new jsPDF({ orientation, unit: "mm", format: [dims.w, dims.h] });
    const pageWidth = dims.w;
    const pageHeight = dims.h;
    doc.addImage(dataUrl, "PNG", 14, 14, pageWidth - 28, pageHeight - 28);
    const { saveFile } = await import("@/lib/exports/saveFile");
    await saveFile(doc.output("blob"), customFilename || "sensitivity-tornado-chart.pdf");
  }, []);

  const handleExportPNG = useCallback((customFilename?: string) => {
    const el = tableRef.current ?? chartRef.current;
    if (!el) return;
    exportTablePNG({ element: el, filename: customFilename || "sensitivity-analysis.png" });
  }, []);

  return {
    comparisonRows,
    handleExportPDF,
    handleExportExcel,
    handleExportCSV,
    handleExportPPTX,
    handleExportChart,
    handleExportPNG,
  };
}
