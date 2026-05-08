/**
 * Dino — Unit 7 pixel-diff tests.
 *
 * Four scenarios:
 *   1. Identical images  → pixelDiffPct ≈ 0, exceedsThreshold = false
 *   2. Fully-different   → pixelDiffPct = 100, exceedsThreshold = true
 *   3. Canonical unavail → passthrough (0%, not exceeds)
 *   4. Render fails      → passthrough (0%, not exceeds)
 *
 * Uses real sharp for image comparison. Small 4×4 PNG buffers are
 * generated in beforeAll so the sharp codepath is exercised, not mocked.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import type { Mock } from "vitest";
import sharp from "sharp";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("../providers/storage", () => ({
  getStorageProviderAsync: vi.fn(),
}));

vi.mock("../slides/dino-render", () => ({
  renderSlideScreenshot: vi.fn(),
}));

vi.mock("../logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { getStorageProviderAsync } from "../providers/storage";
import { renderSlideScreenshot } from "../slides/dino-render";
import { runDino } from "../slides/dino";
import { DINO_PIXEL_DIFF_THRESHOLD_PCT } from "../slides/deck-render-constants";

// ── Image fixtures ────────────────────────────────────────────────────────────

/** 4×4 solid white RGBA PNG */
let WHITE_PNG: Buffer;
/** 4×4 solid red RGBA PNG — every pixel differs from white by 255 on R channel */
let RED_PNG: Buffer;

beforeAll(async () => {
  WHITE_PNG = await sharp({
    create: { width: 4, height: 4, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 255 } },
  }).png().toBuffer();

  RED_PNG = await sharp({
    create: { width: 4, height: 4, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 255 } },
  }).png().toBuffer();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeStorageProvider(buf: Buffer | null) {
  return {
    downloadBuffer: buf
      ? vi.fn().mockResolvedValue({ buffer: buf })
      : vi.fn().mockRejectedValue(new Error("Not found")),
  };
}

// ─────────────────────────────────────────────────────────────────────────────

describe("runDino", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("identical images — pixelDiffPct is 0 and exceedsThreshold is false", async () => {
    (getStorageProviderAsync as Mock).mockResolvedValue(makeStorageProvider(WHITE_PNG));
    (renderSlideScreenshot as Mock).mockResolvedValue(WHITE_PNG);

    const out = await runDino(1, "canonical/lb-6-slide/slides/slide-1.png");

    expect(out.pixelDiffPct).toBe(0);
    expect(out.exceedsThreshold).toBe(false);
    expect(out.threshold).toBe(DINO_PIXEL_DIFF_THRESHOLD_PCT);
  });

  it("fully-different images — pixelDiffPct is 100 and exceedsThreshold is true", async () => {
    (getStorageProviderAsync as Mock).mockResolvedValue(makeStorageProvider(WHITE_PNG));
    (renderSlideScreenshot as Mock).mockResolvedValue(RED_PNG);

    const out = await runDino(2, "canonical/lb-6-slide/slides/slide-2.png");

    // White (255,255,255) vs Red (255,0,0): G and B channels both differ by 255
    // which exceeds DINO_CHANNEL_DIFF_TOLERANCE. All 16 pixels are different.
    expect(out.pixelDiffPct).toBe(100);
    expect(out.exceedsThreshold).toBe(true);
  });

  it("canonical PNG unavailable — returns passthrough { pixelDiffPct: 0, exceedsThreshold: false }", async () => {
    (getStorageProviderAsync as Mock).mockResolvedValue(makeStorageProvider(null));

    const out = await runDino(3, "canonical/lb-6-slide/slides/slide-3.png");

    expect(out.pixelDiffPct).toBe(0);
    expect(out.exceedsThreshold).toBe(false);
    // renderSlideScreenshot should never be called if canonical fetch fails
    expect(renderSlideScreenshot).not.toHaveBeenCalled();
  });

  it("render fails — returns passthrough { pixelDiffPct: 0, exceedsThreshold: false }", async () => {
    (getStorageProviderAsync as Mock).mockResolvedValue(makeStorageProvider(WHITE_PNG));
    (renderSlideScreenshot as Mock).mockRejectedValue(new Error("Playwright timeout"));

    const out = await runDino(4, "canonical/lb-6-slide/slides/slide-4.png");

    expect(out.pixelDiffPct).toBe(0);
    expect(out.exceedsThreshold).toBe(false);
  });
});
