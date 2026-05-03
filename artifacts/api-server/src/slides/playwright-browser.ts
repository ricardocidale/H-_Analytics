/**
 * Singleton Playwright Chromium browser shared across all PDF render requests.
 *
 * Lazily launched on first use. Re-launched if the browser process has died
 * (chromium occasionally crashes). Cleanly torn down on SIGTERM/SIGINT so we
 * don't leak processes on Railway redeploys.
 *
 * Usage:
 *   const browser = await getBrowser();
 *   const page = await browser.newPage();
 *   try { ... } finally { await page.close(); }
 */

import { chromium, type Browser } from "playwright";
import { logger } from "../logger";

let browserPromise: Promise<Browser> | null = null;
let teardownRegistered = false;

async function launchBrowser(): Promise<Browser> {
  logger.info("[playwright] Launching Chromium…", "playwright");
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--font-render-hinting=none",
    ],
  });
  browser.on("disconnected", () => {
    logger.warn("[playwright] Chromium disconnected — clearing singleton", "playwright");
    browserPromise = null;
  });
  return browser;
}

export async function getBrowser(): Promise<Browser> {
  registerTeardown();
  if (!browserPromise) {
    browserPromise = launchBrowser().catch((err) => {
      browserPromise = null;
      throw err;
    });
  }
  const browser = await browserPromise;
  if (!browser.isConnected()) {
    browserPromise = null;
    return getBrowser();
  }
  return browser;
}

function registerTeardown(): void {
  if (teardownRegistered) return;
  teardownRegistered = true;

  const shutdown = async (signal: string) => {
    if (!browserPromise) return;
    logger.info(`[playwright] ${signal} received — closing Chromium`, "playwright");
    try {
      const b = await browserPromise;
      await b.close();
    } catch (err) {
      logger.warn(`[playwright] Browser close failed: ${err}`, "playwright");
    } finally {
      browserPromise = null;
    }
  };

  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  process.once("SIGINT", () => void shutdown("SIGINT"));
}
