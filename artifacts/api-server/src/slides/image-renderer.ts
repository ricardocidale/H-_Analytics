/**
 * Track 2 image-PPTX renderer.
 *
 * Slides 1–3: hybrid compositing — pre-rendered template background JPEG +
 *   per-property photo slots + satori text overlay positioned via recipe.
 * Slides 4–6: full satori JSX (slide 4 needs positional sibling cards; 5–6 table-heavy).
 *
 * Packages all 6 slide JPEGs into a PPTX via pptxgenjs, one full-slide image
 * per PPTX slide.  No Puppeteer, no Playwright, no headless Chromium.
 */

import satori from "satori";
import sharp from "sharp";
import PptxGenJs from "pptxgenjs";
import React from "react";
import { getSlideFonts } from "./fonts";
import {
  Slide4, Slide5, Slide6,
  SLIDE_BACKGROUNDS,
  type SlidePayload,
} from "./slide-jsx";
import { renderHybridSlide } from "./hybrid-renderer";
import { logger } from "../logger";

export type { SlidePayload };

const SLIDE_W_PX = 1920;
const SLIDE_H_PX = 1080;
const PPTX_W_IN  = 13.33;
const PPTX_H_IN  = 7.5;

// ── Satori JSX renderer (used for slides 4–6) ────────────────────────────────

async function renderJsxToJpeg(
  element: React.ReactElement,
  fonts: ReturnType<typeof getSlideFonts>,
): Promise<Buffer> {
  const fontDefs = [
    { name: "Garamond", data: fonts.garamondRegular, weight: 400 as const, style: "normal" as const },
    { name: "Garamond", data: fonts.garamondBold,    weight: 700 as const, style: "normal" as const },
    { name: "Poppins",  data: fonts.poppinsRegular,  weight: 400 as const, style: "normal" as const },
    { name: "Poppins",  data: fonts.poppinsLight,    weight: 300 as const, style: "normal" as const },
    { name: "Roboto",   data: fonts.robotoRegular,   weight: 400 as const, style: "normal" as const },
    { name: "Roboto",   data: fonts.robotoBold,      weight: 700 as const, style: "normal" as const },
  ].filter(f => f.data.byteLength > 0);

  const svg = await satori(element, {
    width: SLIDE_W_PX,
    height: SLIDE_H_PX,
    fonts: fontDefs,
  });

  return sharp(Buffer.from(svg)).jpeg({ quality: 92 }).toBuffer();
}

async function generateBlankSlideJpeg(slideNum: number, propertyName: string): Promise<Buffer> {
  const bg = SLIDE_BACKGROUNDS[slideNum] ?? "#9FBCA4";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SLIDE_W_PX}" height="${SLIDE_H_PX}">
    <rect width="${SLIDE_W_PX}" height="${SLIDE_H_PX}" fill="${bg}"/>
    <text x="${SLIDE_W_PX / 2}" y="${SLIDE_H_PX / 2}" text-anchor="middle" font-size="48"
      fill="#1C2B1E" font-family="sans-serif">${propertyName} — Slide ${slideNum}</text>
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function renderImagePptx(payload: SlidePayload): Promise<Buffer> {
  const fonts = getSlideFonts();
  logger.info("[image-renderer] Rendering 6 slides (hybrid 1–3, satori 4–6)");

  const jpegBuffers = await Promise.all([
    // Slides 1–3: hybrid compositing
    renderHybridSlide(1, payload, fonts).catch(err => {
      logger.warn(`[image-renderer] Slide 1 hybrid failed: ${err} — using blank`);
      return generateBlankSlideJpeg(1, payload.property.name);
    }).then(buf => buf ?? generateBlankSlideJpeg(1, payload.property.name)),

    renderHybridSlide(2, payload, fonts).catch(err => {
      logger.warn(`[image-renderer] Slide 2 hybrid failed: ${err} — using blank`);
      return generateBlankSlideJpeg(2, payload.property.name);
    }).then(buf => buf ?? generateBlankSlideJpeg(2, payload.property.name)),

    renderHybridSlide(3, payload, fonts).catch(err => {
      logger.warn(`[image-renderer] Slide 3 hybrid failed: ${err} — using blank`);
      return generateBlankSlideJpeg(3, payload.property.name);
    }).then(buf => buf ?? generateBlankSlideJpeg(3, payload.property.name)),

    // Slides 4–6: full satori JSX
    renderJsxToJpeg(React.createElement(Slide4, { p: payload }), fonts).catch(err => {
      logger.warn(`[image-renderer] Slide 4 satori failed: ${err} — using blank`);
      return generateBlankSlideJpeg(4, payload.property.name);
    }),

    renderJsxToJpeg(React.createElement(Slide5, { p: payload }), fonts).catch(err => {
      logger.warn(`[image-renderer] Slide 5 satori failed: ${err} — using blank`);
      return generateBlankSlideJpeg(5, payload.property.name);
    }),

    renderJsxToJpeg(React.createElement(Slide6, { p: payload }), fonts).catch(err => {
      logger.warn(`[image-renderer] Slide 6 satori failed: ${err} — using blank`);
      return generateBlankSlideJpeg(6, payload.property.name);
    }),
  ]);

  logger.info("[image-renderer] All slides rendered — building PPTX");
  return buildImagePptx(jpegBuffers, payload.property.name);
}

// ── PPTX builder (unchanged) ──────────────────────────────────────────────────

async function buildImagePptx(jpegBuffers: Buffer[], propertyName: string): Promise<Buffer> {
  const pptx = new PptxGenJs();
  pptx.defineLayout({ name: "WIDE169", width: PPTX_W_IN, height: PPTX_H_IN });
  pptx.layout = "WIDE169";

  for (const jpgBuf of jpegBuffers) {
    const slide = pptx.addSlide();
    slide.addImage({
      data: `image/jpeg;base64,${jpgBuf.toString("base64")}`,
      x: 0, y: 0,
      w: PPTX_W_IN,
      h: PPTX_H_IN,
    });
  }

  logger.info(`[image-renderer] PPTX built: ${jpegBuffers.length} image slides for "${propertyName}"`);
  return pptx.write({ outputType: "nodebuffer" }) as unknown as Buffer;
}
