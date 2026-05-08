/**
 * Franco — deterministic slide-factory deck render minion.
 *
 * Single responsibility: take a `complete` slide-factory run, render the 6-slide
 * PDF via Playwright, upload it to R2 at `factory-runs/<runId>/deck.pdf`, and
 * write `deckR2Key` back onto the run row. No LLM, no judgment — exactly what
 * CLAUDE.md §10 calls a "minion".
 *
 * Public signature:
 *   runFranco(runId, opts?) → { deckR2Key }
 *
 * Throws on render or upload failure. The optional `opts.caller` is for log
 * namespacing only — `[franco][marco]` vs `[franco][rebecca]`. Behavior is
 * identical regardless of caller.
 *
 * Pattern mirrors `routes/lb-deck-pdf.ts:66-100` exactly: same Playwright
 * context+page lifecycle, same `__deckReady` polling, same `printBackground`
 * + `preferCSSPageSize` PDF options, same disconnect-retry wrapper. The only
 * deltas are (a) the token-sign + URL function (factory-token instead of
 * lb-token) and (b) the upload key + DB write site.
 *
 * Per CLAUDE.md §1 — every numeric literal in this file comes from
 * `deck-render-constants.ts` (timeouts, viewport, port, content-type).
 */

import { logger } from "../../logger";
import { getStorageProviderAsync } from "../../providers/storage";
import { getBrowser } from "../playwright-browser";
import { renderLimiter } from "../render-limiter";
import { signFactoryDeckToken } from "../factory-token";
import { updateSlideFactoryRun } from "../../storage/slide-factory-runs";
import {
  PDF_RENDER_TIMEOUT_MS,
  DECK_READY_POLL_TIMEOUT_MS,
  DECK_VIEWPORT_WIDTH,
  DECK_VIEWPORT_HEIGHT,
  PDF_CONTENT_TYPE,
  SLIDE_INTERNAL_PROXY_PORT,
} from "../deck-render-constants";

export interface RunFrancoOpts {
  /**
   * Caller identity for log namespacing only. Behavior is identical regardless.
   * - "marco":   automatic post-`transition_status: complete` render (U3 hook)
   * - "rebecca": admin-triggered manual retry via Rebecca chat tool (U3 hook)
   */
  caller?: "marco" | "rebecca";
}

export interface RunFrancoResult {
  deckR2Key: string;
}

function factoryDeckUrl(token: string): string {
  return `http://localhost:${SLIDE_INTERNAL_PROXY_PORT}/internal/lb-deck?token=${encodeURIComponent(token)}`;
}

function isDisconnectError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /Target.*closed|Browser.*closed|Connection closed|browserContext\.newContext/i.test(msg);
}

/** One Playwright render attempt — mirrors `renderLbDeckPdfOnce`. */
async function renderFactoryDeckPdfOnce(runId: number): Promise<Buffer> {
  const { token } = signFactoryDeckToken(runId);
  const url = factoryDeckUrl(token);

  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport: { width: DECK_VIEWPORT_WIDTH, height: DECK_VIEWPORT_HEIGHT },
    deviceScaleFactor: 1,
  });
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(PDF_RENDER_TIMEOUT_MS);
    await page.goto(url, { waitUntil: "load", timeout: PDF_RENDER_TIMEOUT_MS });
    await page.waitForFunction(
      "window.__deckReady === true || typeof window.__deckError === 'string'",
      undefined,
      { timeout: DECK_READY_POLL_TIMEOUT_MS },
    );
    const deckError = (await page.evaluate("window.__deckError || null")) as string | null;
    if (deckError) throw new Error(`Factory deck route reported error: ${deckError}`);
    return await page.pdf({ printBackground: true, preferCSSPageSize: true });
  } finally {
    await context.close().catch(() => {});
  }
}

/**
 * Render with one disconnect-retry — mirrors `renderLbDeckPdf`.
 * Any non-disconnect failure (timeout, deck-route-reported error, render
 * error) propagates without retry.
 */
async function renderFactoryDeckPdf(runId: number, callerTag: string): Promise<Buffer> {
  try {
    return await renderFactoryDeckPdfOnce(runId);
  } catch (err) {
    if (!isDisconnectError(err)) throw err;
    logger.warn(
      `[franco]${callerTag} run ${runId}: Browser disconnect; retrying once`,
      "slide-factory",
    );
    return await renderFactoryDeckPdfOnce(runId);
  }
}

/**
 * Run the Franco deck-render minion for a slide-factory run.
 *
 * 1. Sign factory-deck token bound to `runId`
 * 2. Acquire `renderLimiter` (shared Playwright concurrency cap)
 * 3. Render PDF via Playwright (one disconnect-retry)
 * 4. Upload to R2 at `factory-runs/<runId>/deck.pdf`
 * 5. Write `deckR2Key` onto the run row
 *
 * Throws on any failure. Callers (Marco's `produce_deck` tool and Rebecca's
 * `produce_slide_factory_deck` tool, both U3) catch and convert to structured
 * `{ error }` for their respective surfaces.
 */
export async function runFranco(
  runId: number,
  opts?: RunFrancoOpts,
): Promise<RunFrancoResult> {
  const callerTag = `[${opts?.caller ?? "unknown"}]`;
  const key = `factory-runs/${runId}/deck.pdf`;

  logger.info(`[franco]${callerTag} run ${runId}: render started`, "slide-factory");

  const pdf = await renderLimiter(async () => renderFactoryDeckPdf(runId, callerTag));

  logger.info(
    `[franco]${callerTag} run ${runId}: rendered ${pdf.length}B; uploading to ${key}`,
    "slide-factory",
  );

  const sp = await getStorageProviderAsync();
  await sp.uploadBuffer(key, pdf, PDF_CONTENT_TYPE);

  await updateSlideFactoryRun(runId, { deckR2Key: key });

  logger.info(
    `[franco]${callerTag} run ${runId}: deckR2Key written (${key})`,
    "slide-factory",
  );

  return { deckR2Key: key };
}
