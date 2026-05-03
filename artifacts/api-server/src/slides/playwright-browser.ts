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

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { chromium, type Browser } from "playwright";
import { logger } from "../logger";

let browserPromise: Promise<Browser> | null = null;
let teardownRegistered = false;
let resolvedExecutablePath: string | null | undefined;

/**
 * Resolve a Chromium executable path.
 *
 * In production (Railway / node:20-bookworm-slim), Playwright's bundled
 * Chromium has all required shared libraries (`npx playwright install
 * --with-deps chromium`), so we let Playwright auto-pick — return null.
 *
 * In dev on Replit Nix, the bundled Chromium fails to load `libglib-2.0.so.0`
 * because Nix shells don't expose system libs the same way Debian does. Fall
 * back to a system `chromium` binary on PATH if one exists.
 *
 * Override either with `CHROMIUM_EXECUTABLE_PATH=…`.
 */
function resolveExecutablePath(): string | null {
  if (resolvedExecutablePath !== undefined) return resolvedExecutablePath;
  const override = process.env.CHROMIUM_EXECUTABLE_PATH;
  if (override && existsSync(override)) {
    logger.info(`[playwright] Using Chromium override: ${override}`, "playwright");
    resolvedExecutablePath = override;
    return override;
  }
  try {
    const which = execSync("command -v chromium || command -v chromium-browser || true", {
      encoding: "utf8",
    }).trim();
    if (which && existsSync(which)) {
      logger.info(`[playwright] Using system Chromium: ${which}`, "playwright");
      resolvedExecutablePath = which;
      return which;
    }
  } catch {
    // ignore — fall through to bundled
  }
  resolvedExecutablePath = null;
  return null;
}

async function launchBrowser(): Promise<Browser> {
  const executablePath = resolveExecutablePath();
  logger.info(
    `[playwright] Launching Chromium${executablePath ? ` (system: ${executablePath})` : " (bundled)"}…`,
    "playwright",
  );
  const browser = await chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
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
