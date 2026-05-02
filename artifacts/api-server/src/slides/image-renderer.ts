/**
 * Track 2 image-PPTX renderer.
 *
 * Renders all 6 slides as full-slide PNGs using satori (JSX → SVG) + sharp
 * (SVG → PNG), then packages them into a PPTX with pptxgenjs where each
 * slide contains exactly one image element sized to the full slide.
 *
 * No Puppeteer, no Playwright, no headless Chromium.
 */

import satori from "satori";
import sharp from "sharp";
import PptxGenJs from "pptxgenjs";
import React from "react";
import { getSlideFonts } from "./fonts";
import {
  Slide1, Slide2, Slide3, Slide4, Slide5, Slide6,
  type SlidePayload,
} from "./slide-jsx";
import { logger } from "../logger";

export type { SlidePayload };

// Slide canvas dimensions
const SLIDE_W_PX = 1920;
const SLIDE_H_PX = 1080;
// PPTX slide dimensions in inches (13.33 × 7.50 is the standard 16:9 template)
const PPTX_W_IN = 13.33;
const PPTX_H_IN = 7.5;

async function renderSlideToJpeg(
  element: React.ReactElement,
  fonts: Awaited<ReturnType<typeof getSlideFonts>>,
): Promise<Buffer> {
  const fontDefs = [
    { name: "Garamond", data: fonts.garamondRegular, weight: 400 as const, style: "normal" as const },
    { name: "Garamond", data: fonts.garamondBold, weight: 700 as const, style: "normal" as const },
    { name: "Poppins", data: fonts.poppinsRegular, weight: 400 as const, style: "normal" as const },
    { name: "Poppins", data: fonts.poppinsLight, weight: 300 as const, style: "normal" as const },
    { name: "Roboto", data: fonts.robotoRegular, weight: 400 as const, style: "normal" as const },
    { name: "Roboto", data: fonts.robotoBold, weight: 700 as const, style: "normal" as const },
  ].filter(f => f.data.byteLength > 0);

  const svg = await satori(element, {
    width: SLIDE_W_PX,
    height: SLIDE_H_PX,
    fonts: fontDefs,
  });

  return sharp(Buffer.from(svg))
    .jpeg({ quality: 92 })
    .toBuffer();
}

export async function renderImagePptx(payload: SlidePayload): Promise<Buffer> {
  const fonts = await getSlideFonts();
  logger.info("[image-renderer] Rendering 6 slides to JPEG via satori + sharp");

  const slideComponents = [
    React.createElement(Slide1, { p: payload }),
    React.createElement(Slide2, { p: payload }),
    React.createElement(Slide3, { p: payload }),
    React.createElement(Slide4, { p: payload }),
    React.createElement(Slide5, { p: payload }),
    React.createElement(Slide6, { p: payload }),
  ];

  const jpegBuffers = await Promise.all(
    slideComponents.map((el, i) =>
      renderSlideToJpeg(el, fonts).catch((err) => {
        logger.warn(`[image-renderer] Slide ${i + 1} render failed: ${err} — using blank`);
        return generateBlankSlideJpeg(i + 1, payload.property.name);
      }),
    ),
  );

  logger.info("[image-renderer] All slides rendered — building PPTX");
  return buildImagePptx(jpegBuffers, payload.property.name);
}

async function generateBlankSlideJpeg(slideNum: number, propertyName: string): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SLIDE_W_PX}" height="${SLIDE_H_PX}">
    <rect width="${SLIDE_W_PX}" height="${SLIDE_H_PX}" fill="#1C2B1E"/>
    <text x="${SLIDE_W_PX / 2}" y="${SLIDE_H_PX / 2}" text-anchor="middle" font-size="48"
      fill="#9FBCA4" font-family="sans-serif">${propertyName} — Slide ${slideNum}</text>
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
}

async function buildImagePptx(jpegBuffers: Buffer[], propertyName: string): Promise<Buffer> {
  const pptx = new PptxGenJs();
  pptx.defineLayout({ name: "WIDE169", width: PPTX_W_IN, height: PPTX_H_IN });
  pptx.layout = "WIDE169";

  for (const jpgBuf of jpegBuffers) {
    const slide = pptx.addSlide();
    const base64 = jpgBuf.toString("base64");
    slide.addImage({
      data: `image/jpeg;base64,${base64}`,
      x: 0,
      y: 0,
      w: PPTX_W_IN,
      h: PPTX_H_IN,
    });
  }

  logger.info(`[image-renderer] PPTX built: ${jpegBuffers.length} image slides for "${propertyName}"`);
  return pptx.write({ outputType: "nodebuffer" }) as unknown as Buffer;
}
