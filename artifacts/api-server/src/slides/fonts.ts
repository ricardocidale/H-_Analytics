/**
 * Font loader for satori slide renderer.
 *
 * Downloads EB Garamond (serif headers) and Poppins ExtraLight (body) from
 * Google Fonts CDN on first use and caches the ArrayBuffers in module scope.
 * Falls back to placeholder buffers so generation never hard-fails on network.
 */

import { logger } from "../logger";

const FONT_URLS = {
  garamondRegular:
    "https://fonts.gstatic.com/s/ebgaramond/v27/SlGDmQSNjdsmc35JDF1K5GRwSDo_ZA.woff",
  garamondBold:
    "https://fonts.gstatic.com/s/ebgaramond/v27/SlGUmQSNjdsmc35JDF1K5GRweDo_ZQ.woff",
  poppinsLight:
    "https://fonts.gstatic.com/s/poppins/v21/pxiByp8kv8JHgFVrLDz8Z11lFc-K.woff",
  poppinsRegular:
    "https://fonts.gstatic.com/s/poppins/v21/pxiEyp8kv8JHgFVrJJfecg.woff",
};

interface FontCache {
  garamondRegular: ArrayBuffer;
  garamondBold: ArrayBuffer;
  poppinsLight: ArrayBuffer;
  poppinsRegular: ArrayBuffer;
}

let cache: FontCache | null = null;
let loadPromise: Promise<FontCache> | null = null;

async function fetchFont(url: string, name: string): Promise<ArrayBuffer> {
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.arrayBuffer();
  } catch (err) {
    logger.warn(`[slide-fonts] Failed to fetch ${name}: ${err}. Using empty buffer.`);
    return new ArrayBuffer(0);
  }
}

async function loadFonts(): Promise<FontCache> {
  const [garamondRegular, garamondBold, poppinsLight, poppinsRegular] =
    await Promise.all([
      fetchFont(FONT_URLS.garamondRegular, "EB Garamond Regular"),
      fetchFont(FONT_URLS.garamondBold, "EB Garamond Bold"),
      fetchFont(FONT_URLS.poppinsLight, "Poppins Light"),
      fetchFont(FONT_URLS.poppinsRegular, "Poppins Regular"),
    ]);
  logger.info("[slide-fonts] Fonts loaded for satori renderer");
  return { garamondRegular, garamondBold, poppinsLight, poppinsRegular };
}

export async function getSlideFonts(): Promise<FontCache> {
  if (cache) return cache;
  if (loadPromise) return loadPromise;
  loadPromise = loadFonts().then((c) => {
    cache = c;
    return c;
  });
  return loadPromise;
}
