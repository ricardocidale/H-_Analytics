/**
 * pdfHelpers.ts — Shared PDF generation helpers for jsPDF
 *
 * Centralises branded page layout, typography, table formatting, and footer
 * rendering for all PDF exports (financial statements, research reports).
 *
 * ─── Usage ────────────────────────────────────────────────────────────────
 *   const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: [406.4, 228.6] });
 *   drawBrandedHeader(doc, pageW);
 *   drawTitle(doc, "Income Statement", 14, 18);
 *   // … add content …
 *   addFooters(doc, "My Company");   // call LAST — iterates all pages
 */

import { BRAND, PAGE_DIMS, type BrandPalette, type ExportRowMeta, classifyRow, indentLabel, formatByType, normalizeCaps } from "./exportStyles";

export function drawBrandedHeader(doc: any, pageW: number, height = 28, brand: BrandPalette = BRAND) {
  doc.setFillColor(...brand.PRIMARY_RGB);
  doc.rect(0, 0, pageW, height, "F");
  doc.setFillColor(...brand.SECONDARY_RGB);
  doc.rect(0, height - 2, pageW, 2, "F");
}

export function drawTitle(doc: any, text: string, x: number, y: number, opts?: {
  fontSize?: number; color?: [number, number, number]; bold?: boolean;
}, brand: BrandPalette = BRAND) {
  const { fontSize = 18, color = brand.FOREGROUND_RGB, bold = true } = opts || {};
  doc.setFont("helvetica", bold ? "bold" : "normal");
  doc.setFontSize(fontSize);
  doc.setTextColor(...color);
  doc.text(text, x, y);
}

export function drawSubtitle(doc: any, text: string, x: number, y: number, opts?: {
  fontSize?: number; color?: [number, number, number];
}, brand: BrandPalette = BRAND) {
  const { fontSize = 10, color = brand.BORDER_RGB } = opts || {};
  doc.setFont("helvetica", "normal");
  doc.setFontSize(fontSize);
  doc.setTextColor(...color);
  doc.text(text, x, y);
}

export function drawSubtitleRow(doc: any, leftText: string, rightText: string, x: number, y: number, pageW: number, opts?: {
  fontSize?: number; color?: [number, number, number]; rightColor?: [number, number, number];
}, brand: BrandPalette = BRAND) {
  const { fontSize = 10, color = brand.BORDER_RGB, rightColor = brand.ACCENT_RGB } = opts || {};
  doc.setFont("helvetica", "normal");
  doc.setFontSize(fontSize);
  doc.setTextColor(...color);
  doc.text(leftText, x, y);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(fontSize - 1);
  doc.setTextColor(...rightColor);
  doc.text(rightText, pageW - x, y, { align: "right" });
}

export interface DashboardSummaryMetric {
  label: string;
  value: string;
  section?: string;
}

export function drawDashboardSummaryPage(
  doc: any,
  pageW: number,
  entityTag: string,
  companyName: string,
  metrics: DashboardSummaryMetric[],
  propertyTable?: { name: string; market: string; rooms: number; status: string }[],
  brand: BrandPalette = BRAND,
) {
  drawTitle(doc, `${companyName} \u2014 Portfolio Dashboard`, 14, 15, undefined, brand);
  drawSubtitleRow(doc, `Investment Overview & Key Performance Indicators`, entityTag, 14, 22, pageW, undefined, brand);
  drawSubtitle(doc, `Generated: ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`, 14, 27, undefined, brand);

  const cardW = (pageW - 28 - 10) / 3;
  const cardH = 18;
  const startX = 14;
  const pageH = doc.internal.pageSize.getHeight();
  const bottomMargin = pageH - 15;
  let y = 35;

  const checkPageBreak = (needed: number) => {
    if (y + needed > bottomMargin) {
      doc.addPage();
      y = 20;
    }
  };


  let currentSection = "";
  metrics.forEach((m, i) => {
    if (m.section && m.section !== currentSection) {
      currentSection = m.section;
      if (i > 0) y += 4;
      checkPageBreak(cardH + 10);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...brand.ACCENT_RGB);
      doc.text(currentSection, startX, y);
      doc.setDrawColor(...brand.SECONDARY_RGB);
      doc.setLineWidth(0.3);
      doc.line(startX, y + 1.5, pageW - 14, y + 1.5);
      y += 6;
    }

    const sectionStart = metrics.findIndex(mm => mm.section === m.section);
    const idxInSection = i - sectionStart;
    const col = idxInSection % 3;

    if (col === 0) checkPageBreak(cardH + 4);

    const x = startX + col * (cardW + 5);

    doc.setFillColor(...brand.BACKGROUND_RGB);
    doc.setDrawColor(...brand.SECONDARY_RGB);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y, cardW, cardH, 2, 2, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(...brand.ACCENT_RGB);
    doc.text(m.value, x + 4, y + 8);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...brand.BORDER_RGB);
    doc.text(m.label, x + 4, y + 14);

    if (col === 2 || i === metrics.length - 1) {
      y += cardH + 4;
    }
  });

  if (propertyTable && propertyTable.length > 0) {
    y += 4;
    checkPageBreak(20);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...brand.ACCENT_RGB);
    doc.text("Portfolio Composition", startX, y);
    doc.setDrawColor(...brand.SECONDARY_RGB);
    doc.setLineWidth(0.3);
    doc.line(startX, y + 1.5, pageW - 14, y + 1.5);
    y += 5;

    const colWidths = [(pageW - 28) * 0.35, (pageW - 28) * 0.30, (pageW - 28) * 0.15, (pageW - 28) * 0.20];
    const headers = ["Property", "Market", "Rooms", "Status"];

    doc.setFillColor(...brand.SECONDARY_RGB);
    doc.rect(startX, y, pageW - 28, 6, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...brand.WHITE_RGB);
    let hx = startX + 2;
    headers.forEach((h, hi) => {
      doc.text(h, hx, y + 4);
      hx += colWidths[hi];
    });
    y += 7;

    propertyTable.forEach((p, pi) => {
      checkPageBreak(6);
      if (pi % 2 === 1) {
        doc.setFillColor(...brand.SURFACE_RGB);
        doc.rect(startX, y - 3, pageW - 28, 5, "F");
      }
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(...brand.FOREGROUND_RGB);
      let px = startX + 2;
      [p.name, p.market, String(p.rooms), p.status].forEach((val, vi) => {
        doc.text(val, px, y);
        px += colWidths[vi];
      });
      y += 5;
    });
  }
}

export function drawSectionHeader(doc: any, title: string, y: number, color?: [number, number, number], brand: BrandPalette = BRAND): number {
  if (!color) color = brand.ACCENT_RGB;
  if (y > 260) { doc.addPage(); y = 20; }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...color);
  doc.text(title, 14, y);
  doc.setDrawColor(...color);
  doc.setLineWidth(0.5);
  doc.line(14, y + 2, 80, y + 2);
  return y + 8;
}

export function drawParagraph(doc: any, text: string, y: number, pageW: number, opts?: {
  fontSize?: number; indent?: number; italic?: boolean;
}, brand: BrandPalette = BRAND): number {
  if (!text) return y;
  const { fontSize = 9, indent = 14, italic = false } = opts || {};
  doc.setFont("helvetica", italic ? "italic" : "normal");
  doc.setFontSize(fontSize);
  doc.setTextColor(...brand.FOREGROUND_RGB);
  const lines = doc.splitTextToSize(text, pageW - indent - 14);
  for (const line of lines) {
    if (y > 275) { doc.addPage(); y = 20; }
    doc.text(line, indent, y);
    y += fontSize * 0.5;
  }
  return y + 2;
}

export function drawKeyValue(doc: any, label: string, value: string, y: number, x = 18, brand: BrandPalette = BRAND): number {
  if (y > 275) { doc.addPage(); y = 20; }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...brand.BORDER_RGB);
  doc.text(label + ":", x, y);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...brand.FOREGROUND_RGB);
  doc.text(value || "N/A", x + 52, y);
  return y + 5;
}

/**
 * Build a jspdf-autotable config with brand styling, proper indent/bold/italic
 * support via didParseCell, alternating row tint, thicker section divider
 * lines, and an outer table frame.
 */
export function buildFinancialTableConfig(
  years: (string | number)[],
  rows: ExportRowMeta[],
  orientation: "landscape" | "portrait",
  startY = 32,
  brand: BrandPalette = BRAND,
): Record<string, any> {
  const yearLabels = years.map((y) => typeof y === "number" ? `FY ${y}` : y);
  const numCols = years.length;
  const labelColW = orientation === "landscape" ? 55 : 40;
  const availableWidth = (orientation === "landscape" ? PAGE_DIMS.LANDSCAPE_W : PAGE_DIMS.PORTRAIT_W) - 28 - labelColW;
  const dataColW = availableWidth / numCols;

  const colStyles: Record<number, any> = { 0: { cellWidth: labelColW } };
  for (let i = 1; i <= numCols; i++) {
    colStyles[i] = { halign: "right", cellWidth: dataColW };
  }

  const body = rows.map((row) => {
    const { isSectionHeader } = classifyRow(row);
    const isSectionPlaceholder = (isSectionHeader || row.isHeader) && row.values.every(val => val === 0 || val === "0");
    return [
      indentLabel(normalizeCaps(row.category), row.indent),
      ...row.values.map((v) => {
        if (isSectionPlaceholder && (v === 0 || v === "0")) return "";
        if (typeof v === "string") return v;
        if (row.format) return formatByType(v, row.format);
        if (typeof v === "number" && row.category.includes("%")) return `${v.toFixed(1)}%`;
        return formatByType(v, "currency");
      }),
    ];
  });

  const fontSize = numCols <= 6 ? 7.5 : numCols <= 10 ? 7 : 6;

  return {
    head: [["", ...yearLabels]],
    body,
    startY,
    styles: {
      fontSize,
      cellPadding: 1.5,
      overflow: "linebreak",
      font: "helvetica",
      lineColor: brand.MUTED_RGB,
      lineWidth: 0.25,
    },
    headStyles: {
      fillColor: brand.SECONDARY_RGB,
      textColor: brand.WHITE_RGB,
      fontStyle: "bold",
      halign: "center",
      lineWidth: 0.4,
      lineColor: brand.SECONDARY_RGB,
    },
    columnStyles: colStyles,
    margin: { left: 14, right: 14 },
    tableWidth: "auto",
    tableLineColor: brand.SECONDARY_RGB,
    tableLineWidth: 0.6,
    didParseCell: (() => {
      let dataRowIdx = 0;
      let lastRowIndex = -1;
      return (data: any) => {
        if (data.section !== "body") return;
        const idx = data.row.index;
        if (idx === undefined || idx >= rows.length) return;
        const row = rows[idx];
        const { isSectionHeader, isSubtotal, isFormula } = classifyRow(row);

        if (isSectionHeader) {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.fillColor = brand.BACKGROUND_RGB;
        } else if (isSubtotal) {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.lineWidth = { top: 0.5 };
          data.cell.styles.lineColor = { top: brand.BORDER_RGB };
        } else if (isFormula) {
          data.cell.styles.fontStyle = "italic";
          data.cell.styles.textColor = brand.FORMULA_RGB;
          data.cell.styles.fontSize = (data.cell.styles.fontSize || fontSize) - 0.5;
          if (idx !== lastRowIndex) { dataRowIdx++; lastRowIndex = idx; }
          if (dataRowIdx % 2 === 0) {
            data.cell.styles.fillColor = brand.SURFACE_RGB;
          }
        } else {
          if (idx !== lastRowIndex) { dataRowIdx++; lastRowIndex = idx; }
          if (dataRowIdx % 2 === 0) {
            data.cell.styles.fillColor = brand.SURFACE_RGB;
          }
        }

        if (data.column.index > 0 && !isSectionHeader) {
          data.cell.styles.font = "courier";
        }
      };
    })(),
  };
}

export function drawCanvasAsImage(
  doc: any,
  canvas: HTMLCanvasElement,
  x: number,
  y: number,
  maxW: number,
  maxH: number,
): number {
  const aspectRatio = canvas.width / canvas.height;
  let drawW = maxW;
  let drawH = maxW / aspectRatio;
  if (drawH > maxH) {
    drawH = maxH;
    drawW = maxH * aspectRatio;
  }
  const dataUrl = canvas.toDataURL("image/png");
  doc.addImage(dataUrl, "PNG", x, y, drawW, drawH);
  return y + drawH + 4;
}

export function addFooters(doc: any, companyName: string, opts?: { skipPages?: Set<number> }, brand: BrandPalette = BRAND) {
  const totalPages = doc.internal.getNumberOfPages();
  const pageH = doc.internal.pageSize.getHeight();
  const pageW = doc.internal.pageSize.getWidth();
  const skipPages = opts?.skipPages;

  for (let i = 1; i <= totalPages; i++) {
    if (skipPages?.has(i)) continue;
    doc.setPage(i);

    doc.setDrawColor(...brand.SECONDARY_RGB);
    doc.setLineWidth(0.4);
    doc.line(14, pageH - 10, pageW - 14, pageH - 10);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...brand.MUTED_RGB);
    doc.text(`${companyName} \u2014 Confidential`, 14, pageH - 6);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.setTextColor(...brand.MUTED_RGB);
    doc.text("Powered by Norfolk AI", pageW / 2, pageH - 6, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...brand.MUTED_RGB);
    doc.text(`Page ${i} of ${totalPages}`, pageW - 14, pageH - 6, { align: "right" });
  }
}
