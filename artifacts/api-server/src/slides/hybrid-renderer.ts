/**
 * Hybrid compositing renderer for slides 1–3.
 *
 * For each slide:
 *   1. Load pre-rendered background JPEG (template decorative elements)
 *   2. Composite photo slots (property photos resized to exact recipe positions)
 *   3. Render all text elements (slots + static) as a single transparent satori overlay
 *   4. Composite overlay onto background → final JPEG
 *
 * Slides 4–6 are not handled here; delegated to the satori JSX renderer.
 */

import path from "path";
import fs from "fs";
import sharp from "sharp";
import satori from "satori";
import React from "react";
import type { SlidePayload } from "./slide-jsx";
import { resolveSlotText, resolveSlotPhoto, type RecipeElement } from "./slot-resolver";
import { getSlideFonts } from "./fonts";
import { logger } from "../logger";

// ── Constants ────────────────────────────────────────────────────────────────

const SLIDE_W = 1920;
const SLIDE_H = 1080;

// PPTX at 1920px wide is 13.33" → 144dpi; 1pt = 144/72 = 2px
const PT_TO_PX = 2;

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

// ── Text overlay renderer ────────────────────────────────────────────────────

interface TextItem {
  el: RecipeElement;
  text: string;
}

async function renderTextOverlay(
  items: TextItem[],
  fonts: ReturnType<typeof getSlideFonts>,
): Promise<Buffer> {
  const sorted = [...items].sort((a, b) => a.el.z_order - b.el.z_order);

  const fontDefs = [
    { name: "Garamond", data: fonts.garamondRegular, weight: 400 as const, style: "normal" as const },
    { name: "Garamond", data: fonts.garamondBold,    weight: 700 as const, style: "normal" as const },
    { name: "Poppins",  data: fonts.poppinsRegular,  weight: 400 as const, style: "normal" as const },
    { name: "Poppins",  data: fonts.poppinsLight,    weight: 300 as const, style: "normal" as const },
    { name: "Roboto",   data: fonts.robotoRegular,   weight: 400 as const, style: "normal" as const },
    { name: "Roboto",   data: fonts.robotoBold,      weight: 700 as const, style: "normal" as const },
  ].filter(f => f.data.byteLength > 0);

  const children = sorted.map(({ el, text }) =>
    React.createElement("div", {
      key: `${el.name}-${el.z_order}`,
      style: {
        position: "absolute" as const,
        left:   Math.round(el.left_px),
        top:    Math.round(el.top_px),
        width:  Math.round(el.width_px),
        height: Math.round(el.height_px),
        overflow: "hidden" as const,
        fontFamily: mapFontFamily(el.font_name),
        fontSize:   (el.font_size_pt ?? 12) * PT_TO_PX,
        fontWeight: mapFontWeight(el.font_name, el.bold),
        fontStyle:  el.italic ? ("italic" as const) : ("normal" as const),
        color:      el.color_hex ?? "#FFF9F5",
        textAlign:  mapAlignment(el.alignment),
        lineHeight: 1.2,
        whiteSpace: "pre-wrap" as const,
      },
    }, text),
  );

  const root = React.createElement("div", {
    style: { display: "flex" as const, position: "relative" as const, width: SLIDE_W, height: SLIDE_H, overflow: "hidden" as const },
  }, ...children);

  const svg = await satori(root, { width: SLIDE_W, height: SLIDE_H, fonts: fontDefs });
  return sharp(Buffer.from(svg)).png().toBuffer();
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

  // ── Collect text items ───────────────────────────────────────────────────
  const textItems: TextItem[] = [];
  for (const el of elements) {
    if (el.kind !== "text") continue;
    // Skip table-kind shapes masquerading as text
    if (el.slot_kind === "table") continue;

    let text: string;
    if (el.is_slot) {
      text = resolveSlotText(slideNum, el, payload) ?? el.template_text ?? "";
    } else {
      text = el.template_text ?? "";
    }
    if (!text) continue;
    textItems.push({ el, text });
  }

  // ── Composite: background → photos → text overlay ───────────────────────
  const textOverlayBuf = textItems.length > 0
    ? await renderTextOverlay(textItems, fonts)
    : null;

  const allOverlays: sharp.OverlayOptions[] = [
    ...photoOverlays,
    ...(textOverlayBuf ? [{ input: textOverlayBuf, left: 0, top: 0 }] : []),
  ];

  const base = sharp(bg);
  const composited = allOverlays.length > 0 ? base.composite(allOverlays) : base;
  return composited.jpeg({ quality: 92 }).toBuffer();
}
