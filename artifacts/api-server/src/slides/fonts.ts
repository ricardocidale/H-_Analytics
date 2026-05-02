/**
 * Font loader for satori slide renderer.
 * Reads local WOFF files bundled at src/slides/fonts/.
 * Falls back to empty buffers so generation never hard-fails on a missing file.
 */

import path from "path";
import fs from "fs";
import { logger } from "../logger";

const FONTS_DIR = path.resolve(process.cwd(), "src/slides/fonts");

interface FontCache {
  garamondRegular: ArrayBuffer;
  garamondBold: ArrayBuffer;
  poppinsLight: ArrayBuffer;
  poppinsRegular: ArrayBuffer;
  robotoRegular: ArrayBuffer;
  robotoBold: ArrayBuffer;
}

let cache: FontCache | null = null;

function readFont(filename: string): ArrayBuffer {
  const p = path.join(FONTS_DIR, filename);
  try {
    const buf = fs.readFileSync(p);
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  } catch {
    logger.warn(`[slide-fonts] Cannot read ${filename} — using empty buffer`);
    return new ArrayBuffer(0);
  }
}

export function getSlideFonts(): FontCache {
  if (cache) return cache;
  cache = {
    garamondRegular: readFont("EBGaramond-Regular.woff"),
    garamondBold:    readFont("EBGaramond-Bold.woff"),
    poppinsLight:    readFont("Poppins-Light.woff"),
    poppinsRegular:  readFont("Poppins-Regular.woff"),
    robotoRegular:   readFont("Roboto-Regular.woff"),
    robotoBold:      readFont("Roboto-Bold.woff"),
  };
  logger.info("[slide-fonts] Fonts loaded from local WOFF files");
  return cache;
}
