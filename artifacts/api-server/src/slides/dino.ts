/**
 * Dino — pixel-diff agent (Unit 7).
 *
 * Compares a freshly rendered slide screenshot against the canonical PNG
 * stored in R2. Uses sharp with ensureAlpha() to normalise both images to
 * RGBA before the per-pixel comparison so the channel count is always 4.
 *
 * Graceful degradation:
 *   - canonical PNG unavailable → pixelDiffPct = 0, exceedsThreshold = false
 *   - render fails              → pixelDiffPct = 0, exceedsThreshold = false
 */
import sharp from "sharp";
import { getStorageProviderAsync } from "../providers/storage";
import { logger } from "../logger";
import { renderSlideScreenshot } from "./dino-render";
import {
  DINO_RGBA_CHANNELS,
  DINO_PIXEL_DIFF_THRESHOLD_PCT,
  DINO_CHANNEL_DIFF_TOLERANCE,
} from "./deck-render-constants";
import { getParameterValue } from "../ai/parameter-resolver";
import type { SlideNumber } from "./swarms/types";

export interface DinoOutput {
  pixelDiffPct: number;
  exceedsThreshold: boolean;
  threshold: number;
}

export async function runDino(
  slideNumber: SlideNumber,
  canonicalPngKey: string,
): Promise<DinoOutput> {
  // Resolve admin-tunable threshold (falls back to compile-time constant on DB miss)
  const pixelDiffThresholdPct = await getParameterValue(
    "slide-pixel-diff-threshold-pct",
    DINO_PIXEL_DIFF_THRESHOLD_PCT,
  );

  const passthrough: DinoOutput = {
    pixelDiffPct: 0,
    exceedsThreshold: false,
    threshold: pixelDiffThresholdPct,
  };

  // Fetch canonical PNG from R2
  let canonicalBuf: Buffer;
  try {
    const provider = await getStorageProviderAsync();
    const { buffer } = await provider.downloadBuffer(canonicalPngKey);
    canonicalBuf = buffer;
  } catch (err: unknown) {
    logger.warn(
      `[dino] slide ${slideNumber} — canonical PNG unavailable (${String(err)}); skipping diff`,
      "slide-factory",
    );
    return passthrough;
  }

  // Render live screenshot via Playwright
  let liveBuf: Buffer;
  try {
    liveBuf = await renderSlideScreenshot(slideNumber);
  } catch (err: unknown) {
    logger.warn(
      `[dino] slide ${slideNumber} — render failed (${String(err)}); skipping diff`,
      "slide-factory",
    );
    return passthrough;
  }

  // Decode both images to raw RGBA
  let decodeResult: [
    Awaited<ReturnType<ReturnType<typeof sharp>["toBuffer"]>>,
    Awaited<ReturnType<ReturnType<typeof sharp>["toBuffer"]>>,
  ];
  try {
    decodeResult = await Promise.all([
      sharp(canonicalBuf).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
      sharp(liveBuf).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
    ]);
  } catch (err: unknown) {
    logger.warn(
      `[dino] slide ${slideNumber} — image decode failed (${String(err)}); skipping diff`,
      "slide-factory",
    );
    return passthrough;
  }
  const [canonical, live] = decodeResult;

  const { width: cw, height: ch } = canonical.info;
  const { width: lw, height: lh } = live.info;

  if (cw !== lw || ch !== lh) {
    logger.warn(
      `[dino] slide ${slideNumber} — dimension mismatch canonical=${cw}x${ch} live=${lw}x${lh}; treating as 100% diff`,
      "slide-factory",
    );
    return {
      pixelDiffPct: 100,
      exceedsThreshold: true,
      threshold: pixelDiffThresholdPct,
    };
  }

  const totalPixels = cw * ch;
  let differentPixels = 0;

  const cData = canonical.data;
  const lData = live.data;
  const byteLen = totalPixels * DINO_RGBA_CHANNELS;

  for (let i = 0; i < byteLen; i += DINO_RGBA_CHANNELS) {
    const dr = Math.abs(cData[i] - lData[i]);
    const dg = Math.abs(cData[i + 1] - lData[i + 1]);
    const db = Math.abs(cData[i + 2] - lData[i + 2]);
    if (dr > DINO_CHANNEL_DIFF_TOLERANCE || dg > DINO_CHANNEL_DIFF_TOLERANCE || db > DINO_CHANNEL_DIFF_TOLERANCE) {
      differentPixels += 1;
    }
  }

  const pixelDiffPct = (differentPixels / totalPixels) * 100;
  return {
    pixelDiffPct,
    exceedsThreshold: pixelDiffPct > pixelDiffThresholdPct,
    threshold: pixelDiffThresholdPct,
  };
}
