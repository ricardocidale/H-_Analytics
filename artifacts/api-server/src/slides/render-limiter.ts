/**
 * render-limiter.ts
 *
 * Shared Playwright render limiter — caps concurrent headless Chromium
 * PDF renders across all entry points (per-property deck and LB deck).
 * Additional requests queue in FIFO order.
 *
 * Concurrency is controlled by the PDF_RENDER_CONCURRENCY env var (default 2).
 * Overridable in production for resource tuning.
 */
import pLimit from "p-limit";

const PDF_RENDER_CONCURRENCY = Math.max(
  1,
  Number(process.env.PDF_RENDER_CONCURRENCY) || 2,
);

export const renderLimiter = pLimit(PDF_RENDER_CONCURRENCY);
