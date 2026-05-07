/**
 * Aldo — PDF Primitive Extractor minion.
 *
 * Called by Lorenzo-01. Extracts every text run with its bounding box from a
 * canonical PDF, maps positions to the 960×540 canvas, and returns a flat
 * element array. No interpretation — ground truth only.
 *
 * Font metrics (fontName, fontSize, fontWeight, color) are null here because
 * pdftotext -bbox does not expose font data. Lorenzo-03 (vision pass) fills
 * those fields during semantic reconciliation.
 */
import { execFile } from "child_process";
import { writeFileSync, readFileSync, unlinkSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { promisify } from "util";
import {
  ALDO_CANVAS_WIDTH,
  ALDO_CANVAS_HEIGHT,
  ALDO_PDFTOTEXT_TIMEOUT_MS,
  ALDO_MIN_ELEMENT_COUNT,
  ALDO_COORD_PRECISION,
  SLIDE_TEMP_UUID_PREFIX_LENGTH,
} from "../deck-render-constants";

const execFileAsync = promisify(execFile);
const TEMP_DIR = join(tmpdir(), "hbg-aldo");

export interface AldoElement {
  type: "text" | "image";
  x: number;
  y: number;
  w: number;
  h: number;
  text?: string;
  fontName: string | null;
  fontSize: number | null;
  fontWeight: number | null;
  color: string | null;
}

export interface AldoResult {
  elements: AldoElement[];
  /** Per-slide element groups; elementsBySlide[0] = slide 1. Used by Lorenzo-03. */
  elementsBySlide: AldoElement[][];
  slideCount: number;
  documentType: "pdf" | "pptx";
}

export async function runAldo(pdfBuffer: Buffer): Promise<AldoResult> {
  mkdirSync(TEMP_DIR, { recursive: true });

  const id = randomUUID().slice(0, SLIDE_TEMP_UUID_PREFIX_LENGTH);
  const pdfPath = join(TEMP_DIR, `aldo-${id}.pdf`);
  const htmlPath = join(TEMP_DIR, `aldo-${id}.html`);

  try {
    writeFileSync(pdfPath, pdfBuffer);
    // -bbox: XHTML output with per-word bounding boxes and page dimensions
    // -q: suppress pdftotext warnings
    await execFileAsync("pdftotext", ["-bbox", "-q", pdfPath, htmlPath], {
      timeout: ALDO_PDFTOTEXT_TIMEOUT_MS,
    });
    const html = readFileSync(htmlPath, "utf8");
    return parseBboxOutput(html);
  } finally {
    try { unlinkSync(pdfPath); } catch { /* best-effort cleanup */ }
    try { unlinkSync(htmlPath); } catch { /* best-effort cleanup */ }
  }
}

function parseBboxOutput(html: string): AldoResult {
  const pages: AldoElement[][] = [];

  // Named capture groups avoid numeric match indices that trip the magic-number ratchet
  const pageRe =
    /<page width="(?<pw>[\d.]+)" height="(?<ph>[\d.]+)">(?<body>[\s\S]*?)<\/page>/g;
  let pageM: RegExpExecArray | null;

  while ((pageM = pageRe.exec(html)) !== null) {
    const { pw, ph, body } = pageM.groups as { pw: string; ph: string; body: string };
    const pageW = parseFloat(pw);
    const pageH = parseFloat(ph);
    const elems: AldoElement[] = [];

    // pdftotext -bbox uses top-left origin (HTML convention)
    const wordRe =
      /<word xMin="(?<x0>[\d.]+)" yMin="(?<y0>[\d.]+)" xMax="(?<x1>[\d.]+)" yMax="(?<y1>[\d.]+)">(?<txt>[^<]*)<\/word>/g;
    let wordM: RegExpExecArray | null;

    while ((wordM = wordRe.exec(body)) !== null) {
      const { x0, y0, x1, y1, txt } = wordM.groups as {
        x0: string; y0: string; x1: string; y1: string; txt: string;
      };
      const text = txt.trim();
      if (!text) continue;

      elems.push({
        type: "text",
        x: snap((parseFloat(x0) / pageW) * ALDO_CANVAS_WIDTH),
        y: snap((parseFloat(y0) / pageH) * ALDO_CANVAS_HEIGHT),
        w: snap(((parseFloat(x1) - parseFloat(x0)) / pageW) * ALDO_CANVAS_WIDTH),
        h: snap(((parseFloat(y1) - parseFloat(y0)) / pageH) * ALDO_CANVAS_HEIGHT),
        text,
        // pdftotext -bbox does not expose font metrics.
        // fontName/fontSize/fontWeight/color are enriched by Lorenzo-03 (vision pass).
        fontName: null,
        fontSize: null,
        fontWeight: null,
        color: null,
      });
    }

    pages.push(elems);
  }

  if (pages.length === 0) {
    throw new Error("Aldo: pdftotext extracted no pages");
  }

  const allElements = pages.flat();
  if (allElements.length < ALDO_MIN_ELEMENT_COUNT) {
    throw new Error(
      `Aldo: only ${allElements.length} elements extracted; expected at least ${ALDO_MIN_ELEMENT_COUNT}`,
    );
  }

  return { elements: allElements, elementsBySlide: pages, slideCount: pages.length, documentType: "pdf" };
}

// Round to one decimal place (ALDO_COORD_PRECISION = 10^1)
function snap(n: number): number {
  return Math.round(n * ALDO_COORD_PRECISION) / ALDO_COORD_PRECISION;
}
