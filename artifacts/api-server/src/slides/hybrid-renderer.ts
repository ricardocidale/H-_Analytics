/**
 * Hybrid compositing renderer for slides 1–3 and 5–6.
 *
 * For each slide:
 *   1. Load pre-rendered background JPEG (template decorative elements)
 *   2. Composite photo slots (property photos resized to exact recipe positions)
 *      — On slide 6, the Picture 4 / Picture 6 placeholders are *synthesized*
 *        from financial data (5-yr IS table and investor-metrics table) since
 *        those slots originally held rendered table images in the source PPTX.
 *   3. Render slot+static text AND table slots as a single transparent satori overlay
 *   4. Composite overlay onto background → final JPEG
 *
 * Slide 4 is not handled here; it is delegated to the satori JSX renderer.
 */

import path from "path";
import fs from "fs";
import sharp from "sharp";
import satori from "satori";
import React from "react";
import type { SlidePayload } from "./slide-jsx";
import {
  resolveSlotText,
  resolveSlotPhoto,
  resolveSlotTable,
  stableYear,
  fmtCurrency,
  fmtPct,
  type RecipeElement,
} from "./slot-resolver";
import { getSlideFonts } from "./fonts";
import { logger } from "../logger";

// ── Constants ────────────────────────────────────────────────────────────────

const SLIDE_W = 1920;
const SLIDE_H = 1080;

// PPTX at 1920px wide is 13.33" → 144dpi; 1pt = 144/72 = 2px
const PT_TO_PX = 2;

// L+B brand palette (subset used by overlays + synthesized tables)
const C_DARK = "#1C2B1E";
const C_CREAM = "#FFF9F5";
const C_ACCENT = "#257D41";
const C_ZEBRA = "rgba(28,43,30,0.05)";
const C_RULE = "rgba(28,43,30,0.18)";

// ── Recipe loader ────────────────────────────────────────────────────────────

interface SlideRecipeFile {
  slides: Record<string, { elements: RecipeElement[] }>;
}

let _recipe: SlideRecipeFile | null = null;

function loadRecipe(): SlideRecipeFile {
  if (_recipe) return _recipe;
  const p = path.resolve(process.cwd(), "../../scripts/src/slide-slot-recipe.json");
  if (!fs.existsSync(p)) {
    throw new Error(`[hybrid-renderer] slide-slot-recipe.json not found at ${p}`);
  }
  _recipe = JSON.parse(fs.readFileSync(p, "utf-8")) as SlideRecipeFile;
  return _recipe;
}

// ── Background JPEG loader ───────────────────────────────────────────────────

const _bgCache = new Map<number, Buffer>();

function loadBackground(slideNum: number): Buffer | null {
  if (_bgCache.has(slideNum)) return _bgCache.get(slideNum)!;
  const p = path.resolve(
    process.cwd(),
    `../../scripts/src/slide-backgrounds/slide-${slideNum}-bg.jpg`,
  );
  if (!fs.existsSync(p)) return null;
  const buf = fs.readFileSync(p);
  _bgCache.set(slideNum, buf);
  return buf;
}

// ── Font mapping ─────────────────────────────────────────────────────────────

function mapFontFamily(fontName: string | null | undefined): string {
  if (!fontName) return "Poppins";
  const n = fontName.toLowerCase();
  if (n.includes("garamond") || n.includes("georgia") || n.includes("eb garamond")) return "Garamond";
  if (n.includes("roboto")) return "Roboto";
  return "Poppins";
}

function mapFontWeight(fontName: string | null | undefined, bold: boolean | null | undefined): number {
  if (bold) return 700;
  if (!fontName) return 400;
  const n = fontName.toLowerCase();
  if (n.includes("extralight") || n.includes("extra light")) return 300;
  if (n.includes("light")) return 300;
  if (n.includes("bold")) return 700;
  return 400;
}

function mapAlignment(alignment: string | null | undefined): "left" | "center" | "right" | "justify" {
  switch (alignment) {
    case "center":  return "center";
    case "right":   return "right";
    case "justify": return "justify";
    default:        return "left";
  }
}

function buildFontDefs(fonts: ReturnType<typeof getSlideFonts>) {
  return [
    { name: "Garamond", data: fonts.garamondRegular, weight: 400 as const, style: "normal" as const },
    { name: "Garamond", data: fonts.garamondBold,    weight: 700 as const, style: "normal" as const },
    { name: "Poppins",  data: fonts.poppinsRegular,  weight: 400 as const, style: "normal" as const },
    { name: "Poppins",  data: fonts.poppinsLight,    weight: 300 as const, style: "normal" as const },
    { name: "Roboto",   data: fonts.robotoRegular,   weight: 400 as const, style: "normal" as const },
    { name: "Roboto",   data: fonts.robotoBold,      weight: 700 as const, style: "normal" as const },
  ].filter(f => f.data.byteLength > 0);
}

// ── Text + table overlay renderer ────────────────────────────────────────────

interface TextItem {
  el: RecipeElement;
  text: string;
}

interface TableItem {
  el: RecipeElement;
  rows: string[][];
}

function renderTextNode(item: TextItem) {
  const { el, text } = item;
  return React.createElement("div", {
    key: `t-${el.name}-${el.z_order}`,
    style: {
      position: "absolute" as const,
      left:   Math.round(el.left_px),
      top:    Math.round(el.top_px),
      width:  Math.round(el.width_px),
      height: Math.round(el.height_px),
      overflow: "hidden" as const,
      display: "flex" as const,
      fontFamily: mapFontFamily(el.font_name),
      fontSize:   (el.font_size_pt ?? 12) * PT_TO_PX,
      fontWeight: mapFontWeight(el.font_name, el.bold),
      fontStyle:  el.italic ? ("italic" as const) : ("normal" as const),
      color:      el.color_hex ?? C_CREAM,
      textAlign:  mapAlignment(el.alignment),
      lineHeight: 1.2,
      whiteSpace: "pre-wrap" as const,
    },
  }, text);
}

function renderTableNode(item: TableItem) {
  const { el, rows } = item;
  const fontFamily = mapFontFamily(el.font_name);
  // Per-row cells; first row is treated as a header (bold, subtle background).
  const rowNodes = rows.map((row, ri) =>
    React.createElement("div", {
      key: `tr-${ri}`,
      style: {
        display: "flex" as const,
        flexDirection: "row" as const,
        flex: 1,
        background: ri === 0 ? C_ZEBRA : (ri % 2 === 0 ? C_ZEBRA : "transparent"),
        borderBottom: ri < rows.length - 1 ? `1px solid ${C_RULE}` : "none",
      },
    }, ...row.map((cell, ci) =>
      React.createElement("div", {
        key: `td-${ri}-${ci}`,
        style: {
          flex: 1,
          display: "flex" as const,
          alignItems: "center" as const,
          justifyContent: ci === 0 ? "flex-start" : "flex-end",
          padding: "0 12px",
          fontFamily,
          fontSize: ri === 0 ? 11 * PT_TO_PX : 11 * PT_TO_PX,
          fontWeight: ri === 0 ? 600 : 400,
          color: C_DARK,
          whiteSpace: "nowrap" as const,
          overflow: "hidden" as const,
        },
      }, cell),
    )),
  );

  return React.createElement("div", {
    key: `tbl-${el.name}-${el.z_order}`,
    style: {
      position: "absolute" as const,
      left:   Math.round(el.left_px),
      top:    Math.round(el.top_px),
      width:  Math.round(el.width_px),
      height: Math.round(el.height_px),
      display: "flex" as const,
      flexDirection: "column" as const,
      overflow: "hidden" as const,
    },
  }, ...rowNodes);
}

async function renderOverlay(
  textItems: TextItem[],
  tableItems: TableItem[],
  fonts: ReturnType<typeof getSlideFonts>,
): Promise<Buffer> {
  const sortedText = [...textItems].sort((a, b) => a.el.z_order - b.el.z_order);
  const sortedTables = [...tableItems].sort((a, b) => a.el.z_order - b.el.z_order);
  // Tables first (lower visual layer), then text overlays on top.
  const children = [
    ...sortedTables.map(renderTableNode),
    ...sortedText.map(renderTextNode),
  ];

  const root = React.createElement("div", {
    style: { display: "flex" as const, position: "relative" as const, width: SLIDE_W, height: SLIDE_H, overflow: "hidden" as const },
  }, ...children);

  const svg = await satori(root, { width: SLIDE_W, height: SLIDE_H, fonts: buildFontDefs(fonts) });
  return sharp(Buffer.from(svg)).png().toBuffer();
}

// ── Slide 6 synthesized picture-slot tables ──────────────────────────────────

/** Render a satori PNG for the given JSX element, sized to slot dimensions. */
async function renderSlotPng(
  node: React.ReactElement,
  width: number,
  height: number,
  fonts: ReturnType<typeof getSlideFonts>,
): Promise<Buffer> {
  const svg = await satori(node, { width, height, fonts: buildFontDefs(fonts) });
  return sharp(Buffer.from(svg)).png().toBuffer();
}

function buildSlide6IsTableJsx(payload: SlidePayload, width: number, height: number): React.ReactElement {
  const { financials } = payload;
  const YEAR_COUNT = 5;
  const years = financials.yearlyIS.slice(0, YEAR_COUNT);
  const cf = financials.yearlyCF.slice(0, YEAR_COUNT);

  // Pad row to YEAR_COUNT columns with "—" for missing years.
  const pad = (arr: string[]): string[] => {
    const out = arr.slice(0, YEAR_COUNT);
    while (out.length < YEAR_COUNT) out.push("—");
    return out;
  };

  const rows: Array<[string, string[], boolean]> = [
    ["Revenue",            pad(years.map(y => fmtCurrency(y.revenueTotal))),        false],
    ["Operating Expenses", pad(years.map(y => fmtCurrency(y.totalExpenses))),       false],
    ["NOI",                pad(years.map(y => fmtCurrency(y.noi))),                 true],
    ["Debt Service",       pad(cf.map(y => fmtCurrency(y.debtService))),            false],
    ["Net Cash Flow",      pad(cf.map(y => fmtCurrency(y.netCashFlowToInvestors))), false],
    ["Cumulative CF",      pad(cf.map(y => fmtCurrency(y.cumulativeCashFlow))),     false],
  ];

  const headerYears = Array.from({ length: YEAR_COUNT }, (_, i) => `Yr ${i + 1}`);

  return React.createElement("div", {
    style: {
      width, height,
      display: "flex" as const, flexDirection: "column" as const,
      background: "transparent" as const, overflow: "hidden" as const,
      fontFamily: "Poppins" as const,
    },
  },
    // Header row (dark band)
    React.createElement("div", {
      key: "h",
      style: {
        display: "flex" as const, flexDirection: "row" as const,
        background: C_DARK, padding: "10px 0", borderBottom: `1px solid ${C_ACCENT}`,
      },
    },
      React.createElement("span", {
        key: "h-item",
        style: { flex: 1.4, fontSize: 22, color: C_CREAM, paddingLeft: 12, fontWeight: 600 },
      }, "Item"),
      ...headerYears.map((h, i) =>
        React.createElement("span", {
          key: `h-${i}`,
          style: { flex: 1, fontSize: 22, color: C_CREAM, textAlign: "right" as const, paddingRight: 12, fontWeight: 600 },
        }, h),
      ),
    ),
    // Data rows
    ...rows.map(([label, vals, emphasize], ri) =>
      React.createElement("div", {
        key: `r-${ri}`,
        style: {
          display: "flex" as const, flexDirection: "row" as const, flex: 1,
          background: ri % 2 === 0 ? C_ZEBRA : "transparent",
          borderBottom: `1px solid ${C_RULE}`,
          alignItems: "center" as const,
        },
      },
        React.createElement("span", {
          key: "lbl",
          style: {
            flex: 1.4, fontSize: 20, color: C_DARK,
            paddingLeft: 12, fontWeight: emphasize ? 700 : 400,
          },
        }, label),
        ...vals.map((v, vi) =>
          React.createElement("span", {
            key: `v-${vi}`,
            style: {
              flex: 1, fontSize: 20,
              color: emphasize ? C_ACCENT : C_DARK,
              textAlign: "right" as const, paddingRight: 12,
              fontWeight: emphasize ? 700 : 400,
            },
          }, v),
        ),
      ),
    ),
  );
}

function buildSlide6InvestorJsx(payload: SlidePayload, width: number, height: number): React.ReactElement {
  const { property, financials } = payload;
  const stable = stableYear(financials.yearlyIS);
  const stableNoi = stable?.noi ?? 0;
  const exitVal = financials.yearlyCF[financials.yearlyCF.length - 1]?.exitValue ?? 0;
  const totalReturn = financials.yearlyCF.reduce((a, y) => a + (y.netCashFlowToInvestors ?? 0), 0) + exitVal;
  const exitCap = financials.exitCapRate ?? property.exitCapRate ?? 0.07;
  const initialEquity = financials.loanAmount > 0
    ? (property.purchasePrice ?? 0) - financials.loanAmount
    : property.purchasePrice ?? 0;

  const rows: Array<[string, string]> = [
    ["IRR (5yr)",         fmtPct(financials.irr)],
    ["Equity Multiple",   financials.equityMultiple != null ? `${financials.equityMultiple.toFixed(2)}×` : "—"],
    ["Stabilized NOI",    fmtCurrency(stableNoi)],
    ["Exit Cap Rate",     fmtPct(exitCap)],
    ["Exit Value (Yr 5)", fmtCurrency(exitVal)],
    ["Total Return",      fmtCurrency(totalReturn)],
    ["Initial Equity",    fmtCurrency(initialEquity)],
  ];

  return React.createElement("div", {
    style: {
      width, height,
      display: "flex" as const, flexDirection: "column" as const,
      background: "transparent" as const, padding: "24px 28px", overflow: "hidden" as const,
      fontFamily: "Poppins" as const,
    },
  },
    React.createElement("span", {
      key: "eyebrow",
      style: {
        fontSize: 22, color: C_ACCENT, letterSpacing: "0.18em",
        textTransform: "uppercase" as const, marginBottom: 16, fontWeight: 600,
      },
    }, "Key Investor Metrics"),
    ...rows.map(([label, val], ri) =>
      React.createElement("div", {
        key: `r-${ri}`,
        style: {
          display: "flex" as const, flexDirection: "row" as const,
          justifyContent: "space-between" as const,
          padding: "14px 16px",
          background: ri % 2 === 0 ? C_ZEBRA : "transparent",
          borderBottom: `1px solid ${C_RULE}`,
        },
      },
        React.createElement("span", {
          key: "lbl",
          style: { fontSize: 22, color: C_DARK, fontWeight: 400 },
        }, label),
        React.createElement("span", {
          key: "val",
          style: { fontSize: 24, color: C_DARK, fontWeight: ri < 2 ? 700 : 600 },
        }, val),
      ),
    ),
    React.createElement("div", {
      key: "disclaimer",
      style: {
        display: "flex" as const, marginTop: 32, padding: "16px 20px",
        background: "rgba(37,125,65,0.12)", borderLeft: `3px solid ${C_ACCENT}`,
      },
    },
      React.createElement("span", {
        key: "d",
        style: {
          fontFamily: "Garamond" as const, fontSize: 20, color: C_DARK,
          fontStyle: "italic" as const, lineHeight: 1.5,
        },
      }, "5-year pro forma based on H+ Analytics projection engine. Projections are estimates; actual results may vary."),
    ),
  );
}

async function synthesizeSlide6PictureOverlays(
  payload: SlidePayload,
  elements: RecipeElement[],
  fonts: ReturnType<typeof getSlideFonts>,
): Promise<sharp.OverlayOptions[]> {
  const out: sharp.OverlayOptions[] = [];

  const isSlot = elements.find(e => e.name === "Picture 4");
  if (isSlot) {
    const w = Math.round(isSlot.width_px);
    const h = Math.round(isSlot.height_px);
    try {
      const png = await renderSlotPng(buildSlide6IsTableJsx(payload, w, h), w, h, fonts);
      out.push({ input: png, left: Math.round(isSlot.left_px), top: Math.round(isSlot.top_px) });
    } catch (err) {
      logger.warn(`[hybrid-renderer] slide 6 IS-table synthesize failed: ${err}`);
    }
  }

  const invSlot = elements.find(e => e.name === "Picture 6");
  if (invSlot) {
    const w = Math.round(invSlot.width_px);
    const h = Math.round(invSlot.height_px);
    try {
      const png = await renderSlotPng(buildSlide6InvestorJsx(payload, w, h), w, h, fonts);
      out.push({ input: png, left: Math.round(invSlot.left_px), top: Math.round(invSlot.top_px) });
    } catch (err) {
      logger.warn(`[hybrid-renderer] slide 6 investor-metrics synthesize failed: ${err}`);
    }
  }

  return out;
}

// ── Main export ──────────────────────────────────────────────────────────────

/**
 * Renders slide N as a JPEG buffer using hybrid background+recipe compositing.
 * Returns null if prerequisites (recipe JSON or background JPEG) are missing.
 */
export async function renderHybridSlide(
  slideNum: number,
  payload: SlidePayload,
  fonts: ReturnType<typeof getSlideFonts>,
): Promise<Buffer | null> {
  const bg = loadBackground(slideNum);
  if (!bg) {
    logger.warn(`[hybrid-renderer] No background JPEG for slide ${slideNum}`);
    return null;
  }

  let recipe: SlideRecipeFile;
  try {
    recipe = loadRecipe();
  } catch (err) {
    logger.warn(`[hybrid-renderer] ${err}`);
    return null;
  }

  const elements: RecipeElement[] = recipe.slides[String(slideNum)]?.elements ?? [];

  // ── Collect photo composites ─────────────────────────────────────────────
  const photoOverlays: sharp.OverlayOptions[] = [];
  const pictureSlots = elements.filter(el => el.is_slot && el.slot_kind === "picture");

  await Promise.all(pictureSlots.map(async (el) => {
    const buf = resolveSlotPhoto(slideNum, el.name, payload.photos);
    if (!buf) return;
    try {
      const resized = await sharp(buf)
        .resize(Math.round(el.width_px), Math.round(el.height_px), { fit: "cover" })
        .toBuffer();
      photoOverlays.push({
        input: resized,
        left:  Math.round(el.left_px),
        top:   Math.round(el.top_px),
      });
    } catch (err) {
      logger.warn(`[hybrid-renderer] slide ${slideNum} photo resize for ${el.name} failed: ${err}`);
    }
  }));

  // Slide 6: synthesize Picture 4 / Picture 6 from financial data (no real photos in those slots)
  if (slideNum === 6) {
    const synth = await synthesizeSlide6PictureOverlays(payload, elements, fonts);
    photoOverlays.push(...synth);
  }

  // ── Collect text + table items ──────────────────────────────────────────
  const textItems: TextItem[] = [];
  const tableItems: TableItem[] = [];
  for (const el of elements) {
    if (el.slot_kind === "table") {
      const cells = resolveSlotTable(slideNum, el, payload);
      if (cells && cells.length > 0) tableItems.push({ el, rows: cells });
      continue;
    }
    if (el.kind !== "text") continue;

    let text: string;
    if (el.is_slot) {
      text = resolveSlotText(slideNum, el, payload) ?? el.template_text ?? "";
    } else {
      text = el.template_text ?? "";
    }
    if (!text) continue;
    textItems.push({ el, text });
  }

  // ── Composite: background → photos → text+table overlay ─────────────────
  const overlayBuf = (textItems.length > 0 || tableItems.length > 0)
    ? await renderOverlay(textItems, tableItems, fonts)
    : null;

  const allOverlays: sharp.OverlayOptions[] = [
    ...photoOverlays,
    ...(overlayBuf ? [{ input: overlayBuf, left: 0, top: 0 }] : []),
  ];

  const base = sharp(bg);
  const composited = allOverlays.length > 0 ? base.composite(allOverlays) : base;
  return composited.jpeg({ quality: 92 }).toBuffer();
}
