import { format } from "date-fns";
import type PptxGenJSType from "pptxgenjs";
import {
  type ExportRowMeta,
  type BrandPalette,
  classifyRow,
  indentLabel,
  formatShort,
  normalizeCaps,
  pptxFontSize,
  pptxColumnWidths,
  lighten,
} from "../exportStyles";
import type { OverviewExportData } from "../../../components/dashboard/overviewExportData";

export const SLIDE_W = 13.33;
export const SLIDE_H = 7.5;
const MARGIN_X = 0.3;

type PptxPres = PptxGenJSType;
type PptxSlide = ReturnType<PptxGenJSType["addSlide"]>;
type PptxTableRow = PptxGenJSType.TableRow;
type PptxTableCell = PptxGenJSType.TableCell;

export interface SlideContext {
  pres: PptxPres;
  companyName: string;
  brand: BrandPalette;
}

export function addAllFooters(ctx: SlideContext, skipFirst = true) {
  const B = ctx.brand;
  const slides = (ctx.pres as unknown as { slides?: PptxSlide[] }).slides;
  if (!slides) return;
  const total = slides.length;
  for (let i = 0; i < total; i++) {
    if (skipFirst && i === 0) continue;
    const slide = slides[i];
    slide.addShape("rect", {
      x: 0, y: SLIDE_H - 0.35, w: SLIDE_W, h: 0.01,
      fill: { color: B.SECONDARY_HEX },
    });
    slide.addText(ctx.companyName + " \u2014 Confidential", {
      x: MARGIN_X, y: SLIDE_H - 0.32, w: 5, h: 0.25,
      fontSize: 7, fontFace: "Arial", color: B.MUTED_HEX, italic: true,
    });
    slide.addText(`${i + 1} / ${total}`, {
      x: SLIDE_W - 1.3, y: SLIDE_H - 0.32, w: 1, h: 0.25,
      fontSize: 7, fontFace: "Arial", color: B.MUTED_HEX, align: "right",
    });
  }
}

export function addTitleSlide(ctx: SlideContext, title: string, subtitle: string, sourceTag: string) {
  const B = ctx.brand;
  const slide = ctx.pres.addSlide();
  slide.background = { color: B.PRIMARY_HEX };

  slide.addShape("rect", {
    x: 0, y: 0, w: SLIDE_W, h: 0.06,
    fill: { color: B.SECONDARY_HEX },
  });
  slide.addShape("rect", {
    x: 0, y: SLIDE_H - 0.06, w: SLIDE_W, h: 0.06,
    fill: { color: B.SECONDARY_HEX },
  });

  const gridColor = lighten(B.PRIMARY_HEX, 0.1);
  for (let gx = 0; gx < SLIDE_W; gx += 0.5) {
    slide.addShape("rect", {
      x: gx, y: 0, w: 0.005, h: SLIDE_H,
      fill: { color: gridColor },
    });
  }
  for (let gy = 0; gy < SLIDE_H; gy += 0.5) {
    slide.addShape("rect", {
      x: 0, y: gy, w: SLIDE_W, h: 0.005,
      fill: { color: gridColor },
    });
  }

  slide.addShape("rect", {
    x: 0.5, y: 1.4, w: 0.08, h: 2.2,
    fill: { color: B.SECONDARY_HEX },
  });

  slide.addText(ctx.companyName, {
    x: 0.8, y: 1.4, w: 11, h: 0.7,
    fontSize: 32, fontFace: "Arial", color: B.WHITE_HEX, bold: true,
  });

  slide.addShape("rect", {
    x: 0.8, y: 2.15, w: 3, h: 0.02,
    fill: { color: B.WHITE_HEX },
  });

  slide.addText(title, {
    x: 0.8, y: 2.4, w: 11, h: 0.5,
    fontSize: 20, fontFace: "Arial", color: B.SECONDARY_HEX,
  });

  slide.addText(subtitle, {
    x: 0.8, y: 3.0, w: 8, h: 0.4,
    fontSize: 13, fontFace: "Arial", color: B.MUTED_HEX,
  });

  const cardX = 0.8;
  const cardY = 4.0;
  const cardW = 5.5;
  const cardH = 1.2;
  slide.addShape("roundRect", {
    x: cardX, y: cardY, w: cardW, h: cardH,
    fill: { color: lighten(B.PRIMARY_HEX, 0.08) },
    line: { color: B.SECONDARY_HEX, width: 0.75 },
    rectRadius: 0.08,
  });

  slide.addText("REPORT", {
    x: cardX + 0.2, y: cardY + 0.12, w: 2, h: 0.22,
    fontSize: 7, fontFace: "Arial", color: B.SECONDARY_HEX, bold: true,
  });
  slide.addText(sourceTag, {
    x: cardX + 0.2, y: cardY + 0.32, w: 2.3, h: 0.22,
    fontSize: 9, fontFace: "Arial", color: B.BORDER_HEX,
  });

  slide.addText("DATE", {
    x: cardX + 0.2, y: cardY + 0.6, w: 2, h: 0.22,
    fontSize: 7, fontFace: "Arial", color: B.SECONDARY_HEX, bold: true,
  });
  slide.addText(format(new Date(), "MMMM d, yyyy"), {
    x: cardX + 0.2, y: cardY + 0.8, w: 2.3, h: 0.22,
    fontSize: 9, fontFace: "Arial", color: B.BORDER_HEX,
  });

  slide.addText("CLASSIFICATION", {
    x: cardX + 2.8, y: cardY + 0.12, w: 2, h: 0.22,
    fontSize: 7, fontFace: "Arial", color: B.SECONDARY_HEX, bold: true,
  });
  slide.addText("CONFIDENTIAL", {
    x: cardX + 2.8, y: cardY + 0.32, w: 2, h: 0.22,
    fontSize: 9, fontFace: "Arial", color: B.BORDER_HEX,
  });

  slide.addText(
    "This document contains proprietary financial projections. Distribution is restricted to authorized recipients.",
    {
      x: 0.8, y: SLIDE_H - 0.7, w: 10, h: 0.3,
      fontSize: 7, fontFace: "Arial", color: B.MUTED_HEX, italic: true,
    },
  );
}

export function addMetricsSlide(
  ctx: SlideContext,
  title: string,
  subtitle: string,
  sourceTag: string,
  metrics: { label: string; value: string }[],
) {
  const B = ctx.brand;
  const slide = ctx.pres.addSlide();

  slide.addText(title, {
    x: 0.5, y: 0.2, w: 8, h: 0.4,
    fontSize: 20, fontFace: "Arial", color: B.PRIMARY_HEX, bold: true,
  });

  slide.addText(subtitle, {
    x: 0.5, y: 0.6, w: 6, h: 0.25,
    fontSize: 9, fontFace: "Arial", color: B.BORDER_HEX,
  });

  slide.addText(sourceTag, {
    x: SLIDE_W - 5.5, y: 0.6, w: 5, h: 0.25,
    fontSize: 9, fontFace: "Arial", color: B.BORDER_HEX, bold: true,
    align: "right",
  });

  slide.addShape("rect", {
    x: 0.5, y: 0.9, w: 12, h: 0.02,
    fill: { color: B.SECONDARY_HEX },
  });

  const cols = 3;
  const cardW = 3.8;
  const cardH = 1.1;
  const gapX = 0.35;
  const startX = 0.5;
  const startY = 1.15;

  metrics.forEach((m, i) => {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const x = startX + col * (cardW + gapX);
    const y = startY + row * (cardH + 0.15);

    slide.addShape("rect", {
      x, y, w: cardW, h: cardH,
      fill: { color: B.CARD_BG_HEX },
      line: { color: B.SECONDARY_HEX, width: 1 },
      rectRadius: 0.1,
    });
    slide.addText(m.value, {
      x: x + 0.15, y: y + 0.15, w: cardW - 0.3, h: 0.5,
      fontSize: 18, fontFace: "Arial", color: B.ACCENT_HEX, bold: true,
    });
    slide.addText(m.label, {
      x: x + 0.15, y: y + 0.6, w: cardW - 0.3, h: 0.35,
      fontSize: 9, fontFace: "Arial", color: B.BORDER_HEX,
    });
  });
}

export function addFinancialTableSlide(
  ctx: SlideContext,
  title: string,
  sourceTag: string,
  years: string[],
  rows: ExportRowMeta[],
) {
  const B = ctx.brand;
  const slide = ctx.pres.addSlide();
  const fontSize = pptxFontSize(years.length);
  const { labelW, dataW, tableW } = pptxColumnWidths(years.length, SLIDE_W, MARGIN_X);

  slide.addText(title, {
    x: MARGIN_X, y: 0.1, w: 8, h: 0.3,
    fontSize: 14, fontFace: "Arial", color: B.PRIMARY_HEX, bold: true,
  });

  slide.addText(sourceTag, {
    x: SLIDE_W - 5.3, y: 0.1, w: 5, h: 0.3,
    fontSize: 9, fontFace: "Arial", color: B.BORDER_HEX, bold: true,
    align: "right",
  });

  const headerCells = [
    {
      text: "",
      options: {
        fill: { color: B.SECONDARY_HEX },
        fontFace: "Arial", fontSize, color: B.WHITE_HEX, bold: true,
        border: [
          { type: "solid", pt: 1.5, color: B.SECONDARY_HEX },
          { type: "solid", pt: 1.5, color: B.SECONDARY_HEX },
          { type: "solid", pt: 1, color: B.SECONDARY_HEX },
          { type: "solid", pt: 1.5, color: B.SECONDARY_HEX },
        ] as [PptxGenJSType.BorderProps, PptxGenJSType.BorderProps, PptxGenJSType.BorderProps, PptxGenJSType.BorderProps],
      },
    },
    ...years.map((y, yi) => ({
      text: y,
      options: {
        fill: { color: B.SECONDARY_HEX },
        fontFace: "Arial", fontSize, color: B.WHITE_HEX, bold: true,
        align: "right" as const,
        border: [
          { type: "solid", pt: 1.5, color: B.SECONDARY_HEX },
          yi === years.length - 1
            ? { type: "solid", pt: 1.5, color: B.SECONDARY_HEX }
            : { type: "solid", pt: 0.5, color: B.BORDER_LIGHT_HEX },
          { type: "solid", pt: 1, color: B.SECONDARY_HEX },
          { type: "solid", pt: 0.5, color: B.BORDER_LIGHT_HEX },
        ] as [PptxGenJSType.BorderProps, PptxGenJSType.BorderProps, PptxGenJSType.BorderProps, PptxGenJSType.BorderProps],
      },
    })),
  ];

  const tableRows: PptxTableRow[] = [headerCells];
  const filteredRows = rows.filter((r) => r.category !== "");
  let dataRowIdx = 0;

  filteredRows.forEach((row, ri) => {
    const { isSectionHeader, isSubtotal, isFormula } = classifyRow(row);
    const label = indentLabel(normalizeCaps(row.category), row.indent);

    let bgColor: string;
    if (isSectionHeader) {
      bgColor = B.BACKGROUND_HEX;
    } else if (isSubtotal) {
      bgColor = B.WHITE_HEX;
    } else {
      bgColor = dataRowIdx % 2 === 1 ? B.SURFACE_HEX : B.WHITE_HEX;
      dataRowIdx++;
    }

    const isLastRow = ri === filteredRows.length - 1;

    const topBorder = isSectionHeader
      ? { type: "solid" as const, pt: 1.2, color: B.BORDER_SECTION_HEX }
      : isSubtotal
        ? { type: "solid" as const, pt: 0.8, color: B.BORDER_LIGHT_HEX }
        : { type: "solid" as const, pt: 0.3, color: B.BORDER_LIGHT_HEX };
    const bottomBorder = isLastRow
      ? { type: "solid" as const, pt: 1.5, color: B.SECONDARY_HEX }
      : { type: "solid" as const, pt: 0.3, color: B.BORDER_LIGHT_HEX };

    const makeBorder = (colIdx: number): [PptxGenJSType.BorderProps, PptxGenJSType.BorderProps, PptxGenJSType.BorderProps, PptxGenJSType.BorderProps] => [
      topBorder,
      colIdx === years.length
        ? { type: "solid" as const, pt: 1.5, color: B.SECONDARY_HEX }
        : { type: "solid" as const, pt: 0.3, color: B.BORDER_LIGHT_HEX },
      bottomBorder,
      colIdx === 0
        ? { type: "solid" as const, pt: 1.5, color: B.SECONDARY_HEX }
        : { type: "solid" as const, pt: 0.3, color: B.BORDER_LIGHT_HEX },
    ];

    const labelCell: PptxTableCell = {
      text: label,
      options: {
        fontFace: "Arial",
        fontSize: isSectionHeader || isSubtotal ? fontSize + 0.5 : fontSize,
        color: isFormula ? B.FORMULA_HEX : B.FOREGROUND_HEX,
        bold: isSectionHeader || isSubtotal,
        italic: isFormula,
        fill: { color: bgColor },
        border: makeBorder(0),
      },
    };

    const valueCells = row.values.map((v, vi) => ({
      text: formatShort(v),
      options: {
        fontFace: "Arial",
        fontSize,
        color: B.FOREGROUND_HEX,
        bold: isSubtotal,
        italic: isFormula,
        align: "right" as const,
        fill: { color: bgColor },
        border: makeBorder(vi + 1),
      },
    }));

    tableRows.push([labelCell, ...valueCells]);
  });

  slide.addTable(tableRows, {
    x: MARGIN_X,
    y: 0.45,
    w: tableW,
    colW: [labelW, ...years.map(() => dataW)],
    rowH: 0.22,
    autoPage: true,
    autoPageRepeatHeader: true,
    newSlideStartY: 0.4,
  });
}

export function addOverviewSlides(ctx: SlideContext, overview: OverviewExportData, projectionYears: number) {
  const B = ctx.brand;
  const fmt = (v: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(v);
  const fmtPct = (v: number) => `${v.toFixed(1)}%`;
  const fmtUSD = (v: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);

  const entityTag = `Consolidated Portfolio \u2014 ${overview.capitalStructure.totalProperties} Properties`;

  const propIRRSlide = ctx.pres.addSlide();
  propIRRSlide.addText("Property IRR Comparison", {
    x: MARGIN_X, y: 0.15, w: 9, h: 0.35,
    fontSize: 16, fontFace: "Arial", color: B.PRIMARY_HEX, bold: true,
  });
  propIRRSlide.addText(`Per-property internal rate of return over ${projectionYears}-year projection`, {
    x: MARGIN_X, y: 0.5, w: 8, h: 0.25,
    fontSize: 9, fontFace: "Arial", color: B.BORDER_HEX,
  });
  propIRRSlide.addText(entityTag, {
    x: SLIDE_W - 5.5, y: 0.5, w: 5, h: 0.25,
    fontSize: 9, fontFace: "Arial", color: B.BORDER_HEX, bold: true, align: "right",
  });
  propIRRSlide.addShape("rect", { x: MARGIN_X, y: 0.78, w: SLIDE_W - 2 * MARGIN_X, h: 0.02, fill: { color: B.SECONDARY_HEX } });

  const pRows: PptxTableRow[] = [
    [
      { text: "#", options: { fill: { color: B.SECONDARY_HEX }, color: B.WHITE_HEX, bold: true, fontFace: "Arial", fontSize: 8 } },
      { text: "Property", options: { fill: { color: B.SECONDARY_HEX }, color: B.WHITE_HEX, bold: true, fontFace: "Arial", fontSize: 8 } },
      { text: "Market", options: { fill: { color: B.SECONDARY_HEX }, color: B.WHITE_HEX, bold: true, fontFace: "Arial", fontSize: 8 } },
      { text: "Rooms", options: { fill: { color: B.SECONDARY_HEX }, color: B.WHITE_HEX, bold: true, fontFace: "Arial", fontSize: 8, align: "right" as const } },
      { text: "Status", options: { fill: { color: B.SECONDARY_HEX }, color: B.WHITE_HEX, bold: true, fontFace: "Arial", fontSize: 8 } },
      { text: "Acquisition", options: { fill: { color: B.SECONDARY_HEX }, color: B.WHITE_HEX, bold: true, fontFace: "Arial", fontSize: 8, align: "right" as const } },
      { text: "ADR", options: { fill: { color: B.SECONDARY_HEX }, color: B.WHITE_HEX, bold: true, fontFace: "Arial", fontSize: 8, align: "right" as const } },
      { text: "IRR", options: { fill: { color: B.SECONDARY_HEX }, color: B.WHITE_HEX, bold: true, fontFace: "Arial", fontSize: 8, align: "right" as const } },
    ],
    ...overview.propertyItems.map((p, i) => {
      const bg = i % 2 === 1 ? B.SURFACE_HEX : B.WHITE_HEX;
      const irrColor = p.irr >= 15 ? B.ACCENT_HEX : p.irr >= 8 ? B.SECONDARY_HEX : B.FOREGROUND_HEX;
      return [
        { text: String(i + 1), options: { fill: { color: bg }, color: B.FOREGROUND_HEX, fontFace: "Arial", fontSize: 8, align: "center" as const } },
        { text: p.name, options: { fill: { color: bg }, color: B.FOREGROUND_HEX, fontFace: "Arial", fontSize: 8, bold: true } },
        { text: p.market, options: { fill: { color: bg }, color: B.BORDER_HEX, fontFace: "Arial", fontSize: 8 } },
        { text: String(p.rooms), options: { fill: { color: bg }, color: B.FOREGROUND_HEX, fontFace: "Arial", fontSize: 8, align: "right" as const } },
        { text: p.status, options: { fill: { color: bg }, color: B.FOREGROUND_HEX, fontFace: "Arial", fontSize: 8 } },
        { text: fmtUSD(p.acquisitionCost), options: { fill: { color: bg }, color: B.FOREGROUND_HEX, fontFace: "Arial", fontSize: 8, align: "right" as const } },
        { text: fmtUSD(p.adr), options: { fill: { color: bg }, color: B.FOREGROUND_HEX, fontFace: "Arial", fontSize: 8, align: "right" as const } },
        { text: fmtPct(p.irr), options: { fill: { color: bg }, color: irrColor, fontFace: "Arial", fontSize: 8, bold: true, align: "right" as const } },
      ];
    }),
  ];
  propIRRSlide.addTable(pRows, {
    x: MARGIN_X, y: 0.9, w: SLIDE_W - 2 * MARGIN_X,
    colW: [0.4, 2.8, 1.6, 0.7, 1.2, 1.8, 0.9, 0.8],
    rowH: 0.28,
  });

  const revSlide = ctx.pres.addSlide();
  revSlide.addText("Revenue & ANOI Projection", {
    x: MARGIN_X, y: 0.15, w: 9, h: 0.35,
    fontSize: 16, fontFace: "Arial", color: B.PRIMARY_HEX, bold: true,
  });
  revSlide.addText(`${projectionYears}-Year consolidated projection — Revenue, NOI, ANOI, and Cash Flow`, {
    x: MARGIN_X, y: 0.5, w: 10, h: 0.25,
    fontSize: 9, fontFace: "Arial", color: B.BORDER_HEX,
  });
  revSlide.addShape("rect", { x: MARGIN_X, y: 0.78, w: SLIDE_W - 2 * MARGIN_X, h: 0.02, fill: { color: B.SECONDARY_HEX } });
  const revRows: PptxTableRow[] = [
    [
      { text: "Year", options: { fill: { color: B.SECONDARY_HEX }, color: B.WHITE_HEX, bold: true, fontFace: "Arial", fontSize: 8 } },
      { text: "Revenue", options: { fill: { color: B.SECONDARY_HEX }, color: B.WHITE_HEX, bold: true, fontFace: "Arial", fontSize: 8, align: "right" as const } },
      { text: "NOI", options: { fill: { color: B.SECONDARY_HEX }, color: B.WHITE_HEX, bold: true, fontFace: "Arial", fontSize: 8, align: "right" as const } },
      { text: "ANOI", options: { fill: { color: B.SECONDARY_HEX }, color: B.WHITE_HEX, bold: true, fontFace: "Arial", fontSize: 8, align: "right" as const } },
      { text: "Cash Flow", options: { fill: { color: B.SECONDARY_HEX }, color: B.WHITE_HEX, bold: true, fontFace: "Arial", fontSize: 8, align: "right" as const } },
    ],
    ...overview.revenueNOIData.map((d, i) => {
      const bg = i % 2 === 1 ? B.SURFACE_HEX : B.WHITE_HEX;
      return [
        { text: String(d.year), options: { fill: { color: bg }, color: B.FOREGROUND_HEX, fontFace: "Arial", fontSize: 8, bold: true } },
        { text: fmt(d.revenue), options: { fill: { color: bg }, color: B.FOREGROUND_HEX, fontFace: "Arial", fontSize: 8, align: "right" as const } },
        { text: fmt(d.noi), options: { fill: { color: bg }, color: B.FOREGROUND_HEX, fontFace: "Arial", fontSize: 8, align: "right" as const } },
        { text: fmt(d.anoi), options: { fill: { color: bg }, color: B.ACCENT_HEX, fontFace: "Arial", fontSize: 8, bold: true, align: "right" as const } },
        { text: fmt(d.cashFlow), options: { fill: { color: bg }, color: B.FOREGROUND_HEX, fontFace: "Arial", fontSize: 8, align: "right" as const } },
      ];
    }),
  ];
  revSlide.addTable(revRows, {
    x: MARGIN_X, y: 0.9, w: SLIDE_W - 2 * MARGIN_X,
    colW: [1.2, 2.8, 2.8, 2.8, 2.8],
    rowH: 0.28,
  });

  const compSlide = ctx.pres.addSlide();
  compSlide.addText("Portfolio Composition", {
    x: MARGIN_X, y: 0.15, w: 9, h: 0.35,
    fontSize: 16, fontFace: "Arial", color: B.PRIMARY_HEX, bold: true,
  });
  compSlide.addText("Geographic and operational distribution of properties", {
    x: MARGIN_X, y: 0.5, w: 8, h: 0.25,
    fontSize: 9, fontFace: "Arial", color: B.BORDER_HEX,
  });
  compSlide.addShape("rect", { x: MARGIN_X, y: 0.78, w: SLIDE_W - 2 * MARGIN_X, h: 0.02, fill: { color: B.SECONDARY_HEX } });

  const cs = overview.capitalStructure;
  const kpis = overview.portfolioKPIs;
  const totalEquity = kpis.totalInitialEquity;
  const totalDebt = cs.totalPurchasePrice - totalEquity;
  const weightedLTV = cs.totalPurchasePrice > 0 ? totalDebt / cs.totalPurchasePrice : 0;
  const capRows: PptxTableRow[] = [
    [{ text: "Capital Structure", options: { fill: { color: B.PRIMARY_HEX }, color: B.WHITE_HEX, bold: true, fontFace: "Arial", fontSize: 8 } }, { text: "Value", options: { fill: { color: B.PRIMARY_HEX }, color: B.WHITE_HEX, bold: true, fontFace: "Arial", fontSize: 8, align: "right" as const } }],
    [{ text: "Total Equity", options: { fontFace: "Arial", fontSize: 8, fill: { color: B.SURFACE_HEX }, color: B.FOREGROUND_HEX } }, { text: fmtUSD(totalEquity), options: { fontFace: "Arial", fontSize: 8, fill: { color: B.SURFACE_HEX }, color: B.ACCENT_HEX, bold: true, align: "right" as const } }],
    [{ text: "Total Debt", options: { fontFace: "Arial", fontSize: 8, fill: { color: B.WHITE_HEX }, color: B.FOREGROUND_HEX } }, { text: fmtUSD(totalDebt), options: { fontFace: "Arial", fontSize: 8, fill: { color: B.WHITE_HEX }, color: B.FOREGROUND_HEX, align: "right" as const } }],
    [{ text: "Weighted LTV", options: { fontFace: "Arial", fontSize: 8, fill: { color: B.SURFACE_HEX }, color: B.FOREGROUND_HEX } }, { text: fmtPct(weightedLTV * 100), options: { fontFace: "Arial", fontSize: 8, fill: { color: B.SURFACE_HEX }, color: B.FOREGROUND_HEX, align: "right" as const } }],
    [{ text: "Total Purchase Price", options: { fontFace: "Arial", fontSize: 8, fill: { color: B.WHITE_HEX }, color: B.FOREGROUND_HEX } }, { text: fmtUSD(cs.totalPurchasePrice), options: { fontFace: "Arial", fontSize: 8, fill: { color: B.WHITE_HEX }, color: B.FOREGROUND_HEX, align: "right" as const } }],
    [{ text: "Avg Purchase Price", options: { fontFace: "Arial", fontSize: 8, fill: { color: B.SURFACE_HEX }, color: B.FOREGROUND_HEX } }, { text: fmtUSD(cs.avgPurchasePrice), options: { fontFace: "Arial", fontSize: 8, fill: { color: B.SURFACE_HEX }, color: B.FOREGROUND_HEX, align: "right" as const } }],
    [{ text: "Avg Exit Cap Rate", options: { fontFace: "Arial", fontSize: 8, fill: { color: B.WHITE_HEX }, color: B.FOREGROUND_HEX } }, { text: fmtPct(cs.avgExitCapRate * 100), options: { fontFace: "Arial", fontSize: 8, fill: { color: B.WHITE_HEX }, color: B.ACCENT_HEX, bold: true, align: "right" as const } }],
    [{ text: "Hold Period", options: { fontFace: "Arial", fontSize: 8, fill: { color: B.SURFACE_HEX }, color: B.FOREGROUND_HEX } }, { text: `${cs.holdPeriod} Years`, options: { fontFace: "Arial", fontSize: 8, fill: { color: B.SURFACE_HEX }, color: B.FOREGROUND_HEX, align: "right" as const } }],
    [{ text: "ANOI Margin", options: { fontFace: "Arial", fontSize: 8, fill: { color: B.WHITE_HEX }, color: B.FOREGROUND_HEX } }, { text: fmtPct(cs.anoiMargin), options: { fontFace: "Arial", fontSize: 8, fill: { color: B.WHITE_HEX }, color: B.ACCENT_HEX, bold: true, align: "right" as const } }],
    [{ text: "Avg Rooms / Property", options: { fontFace: "Arial", fontSize: 8, fill: { color: B.SURFACE_HEX }, color: B.FOREGROUND_HEX } }, { text: cs.avgRoomsPerProperty.toFixed(0), options: { fontFace: "Arial", fontSize: 8, fill: { color: B.SURFACE_HEX }, color: B.FOREGROUND_HEX, align: "right" as const } }],
    [{ text: "Avg Daily Rate (ADR)", options: { fontFace: "Arial", fontSize: 8, fill: { color: B.WHITE_HEX }, color: B.FOREGROUND_HEX } }, { text: fmtUSD(cs.avgADR), options: { fontFace: "Arial", fontSize: 8, fill: { color: B.WHITE_HEX }, color: B.ACCENT_HEX, bold: true, align: "right" as const } }],
  ];
  compSlide.addTable(capRows, { x: MARGIN_X, y: 0.9, w: 5.5, colW: [3.3, 2.2], rowH: 0.28 });

  const mktRows: PptxTableRow[] = [
    [
      { text: "Market", options: { fill: { color: B.SECONDARY_HEX }, color: B.WHITE_HEX, bold: true, fontFace: "Arial", fontSize: 8 } },
      { text: "Count", options: { fill: { color: B.SECONDARY_HEX }, color: B.WHITE_HEX, bold: true, fontFace: "Arial", fontSize: 8, align: "right" as const } },
      { text: "%", options: { fill: { color: B.SECONDARY_HEX }, color: B.WHITE_HEX, bold: true, fontFace: "Arial", fontSize: 8, align: "right" as const } },
    ],
    ...Object.entries(overview.marketCounts).map(([m, c], i) => {
      const bg = i % 2 === 1 ? B.SURFACE_HEX : B.WHITE_HEX;
      return [
        { text: m, options: { fill: { color: bg }, color: B.FOREGROUND_HEX, fontFace: "Arial", fontSize: 8 } },
        { text: String(c), options: { fill: { color: bg }, color: B.FOREGROUND_HEX, fontFace: "Arial", fontSize: 8, align: "right" as const } },
        { text: fmtPct((c / cs.totalProperties) * 100), options: { fill: { color: bg }, color: B.ACCENT_HEX, fontFace: "Arial", fontSize: 8, bold: true, align: "right" as const } },
      ];
    }),
    [
      { text: "Status", options: { fill: { color: B.PRIMARY_HEX }, color: B.WHITE_HEX, bold: true, fontFace: "Arial", fontSize: 8 } },
      { text: "Count", options: { fill: { color: B.PRIMARY_HEX }, color: B.WHITE_HEX, bold: true, fontFace: "Arial", fontSize: 8, align: "right" as const } },
      { text: "%", options: { fill: { color: B.PRIMARY_HEX }, color: B.WHITE_HEX, bold: true, fontFace: "Arial", fontSize: 8, align: "right" as const } },
    ],
    ...Object.entries(overview.statusCounts).map(([s, c], i) => {
      const bg = i % 2 === 1 ? B.SURFACE_HEX : B.WHITE_HEX;
      return [
        { text: s, options: { fill: { color: bg }, color: B.FOREGROUND_HEX, fontFace: "Arial", fontSize: 8 } },
        { text: String(c), options: { fill: { color: bg }, color: B.FOREGROUND_HEX, fontFace: "Arial", fontSize: 8, align: "right" as const } },
        { text: fmtPct((c / cs.totalProperties) * 100), options: { fill: { color: bg }, color: B.ACCENT_HEX, fontFace: "Arial", fontSize: 8, bold: true, align: "right" as const } },
      ];
    }),
  ];
  compSlide.addTable(mktRows, { x: 6.2, y: 0.9, w: 6.83, colW: [4.0, 1.4, 1.43], rowH: 0.28 });

  const wfSlide = ctx.pres.addSlide();
  wfSlide.addText("USALI Profit Waterfall", {
    x: MARGIN_X, y: 0.15, w: 9, h: 0.35,
    fontSize: 16, fontFace: "Arial", color: B.PRIMARY_HEX, bold: true,
  });
  wfSlide.addText(`${projectionYears}-Year Consolidated Revenue-to-ANOI Bridge`, {
    x: MARGIN_X, y: 0.5, w: 10, h: 0.25,
    fontSize: 9, fontFace: "Arial", color: B.BORDER_HEX,
  });
  wfSlide.addShape("rect", { x: MARGIN_X, y: 0.78, w: SLIDE_W - 2 * MARGIN_X, h: 0.02, fill: { color: B.SECONDARY_HEX } });

  const { yearLabels, waterfallRows } = overview;
  const wfFontSize = pptxFontSize(yearLabels.length);
  const { labelW, dataW, tableW } = pptxColumnWidths(yearLabels.length, SLIDE_W, MARGIN_X);
  const wfTableRows: PptxTableRow[] = [
    [
      { text: "", options: { fill: { color: B.SECONDARY_HEX }, fontFace: "Arial", fontSize: wfFontSize, color: B.WHITE_HEX, bold: true } },
      ...yearLabels.map((yr) => ({
        text: String(yr),
        options: { fill: { color: B.SECONDARY_HEX }, fontFace: "Arial", fontSize: wfFontSize, color: B.WHITE_HEX, bold: true, align: "right" as const },
      })),
    ],
    ...waterfallRows.map((row, ri) => {
      const bgColor = row.isSubtotal ? B.BACKGROUND_HEX : ri % 2 === 1 ? B.SURFACE_HEX : B.WHITE_HEX;
      const textColor = row.isDeduction ? B.BORDER_HEX : B.FOREGROUND_HEX;
      return [
        { text: row.label, options: { fill: { color: bgColor }, fontFace: "Arial", fontSize: wfFontSize, color: textColor, bold: row.isSubtotal } },
        ...row.values.map((v) => ({
          text: row.isDeduction ? `(${formatShort(v)})` : formatShort(v),
          options: { fill: { color: bgColor }, fontFace: "Arial", fontSize: wfFontSize, color: row.isSubtotal ? B.ACCENT_HEX : textColor, bold: row.isSubtotal, align: "right" as const },
        })),
      ];
    }),
  ];
  wfSlide.addTable(wfTableRows, {
    x: MARGIN_X, y: 0.9, w: tableW,
    colW: [labelW, ...yearLabels.map(() => dataW)],
    rowH: 0.24,
  });
}
