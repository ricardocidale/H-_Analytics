/**
 * dino-render.ts — Playwright single-slide screenshot helper (Unit 7).
 *
 * Renders one slide from the LB deck by navigating to the internal deck URL
 * with `?slide=N` and screenshotting the `[data-slide="N"]` element.
 *
 * LbInternalDeck.tsx conditionally renders only the requested slide when
 * ?slide=N is set, so __deckReady fires as soon as that one slide's images
 * load — no full 6-slide wait.
 */
import { getBrowser } from "./playwright-browser";
import { signLbDeckToken } from "./lb-token";
import {
  DINO_VIEWPORT_WIDTH,
  DINO_VIEWPORT_HEIGHT,
  DINO_POLL_INTERVAL_MS,
  DECK_READY_POLL_TIMEOUT_MS,
  SLIDE_INTERNAL_PROXY_PORT,
} from "./deck-render-constants";

/** Render one slide as a PNG buffer using Playwright. */
export async function renderSlideScreenshot(slideNumber: number): Promise<Buffer> {
  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport: { width: DINO_VIEWPORT_WIDTH, height: DINO_VIEWPORT_HEIGHT },
  });

  try {
    const page = await context.newPage();
    const { token } = signLbDeckToken();
    const url = `http://localhost:${SLIDE_INTERNAL_PROXY_PORT}/internal/lb-deck?token=${encodeURIComponent(token)}&slide=${slideNumber}`;

    await page.goto(url, { waitUntil: "networkidle" });

    // Poll __deckReady — LbInternalDeck sets this once the filtered slide loads
    const deadline = Date.now() + DECK_READY_POLL_TIMEOUT_MS;
    let readyConfirmed = false;
    while (Date.now() < deadline) {
      const ready = await page.evaluate(() => (globalThis as Record<string, unknown>).__deckReady);
      if (ready) { readyConfirmed = true; break; }
      await page.waitForTimeout(DINO_POLL_INTERVAL_MS);
    }
    if (!readyConfirmed) {
      throw new Error(`Dino render timeout: __deckReady not set after ${DECK_READY_POLL_TIMEOUT_MS / 1000}s for slide ${slideNumber}`);
    }

    const slideEl = page.locator(`[data-slide="${slideNumber}"]`);
    const screenshot = await slideEl.screenshot({ type: "png" });
    return screenshot;
  } finally {
    await context.close();
  }
}
