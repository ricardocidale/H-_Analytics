/**
 * Franco — U2 minion tests.
 *
 * Covers the deterministic-deck-render-and-upload contract:
 *   1. Happy path:                render OK + upload OK + DB write OK
 *   2. Disconnect retry:          first attempt throws "Target closed"; succeeds on retry
 *   3. Render fails after retry:  both attempts throw → runFranco throws
 *   4. uploadBuffer fails:        render OK; R2 throws → runFranco throws (no DB write)
 *   5. updateSlideFactoryRun fails: render + upload OK; DB throws → runFranco throws
 *   6. Caller annotation:         logs include `[franco][rebecca]` when caller="rebecca"
 *
 * Mocks Playwright (getBrowser → fake browser → fake context → fake page),
 * the storage provider, the slide-factory-runs storage helper, and the logger.
 * The real `renderLimiter` is left in place — it's a `pLimit` wrapper around the
 * inner work, mocking it adds noise without coverage.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("../../slides/playwright-browser", () => ({
  getBrowser: vi.fn(),
}));

vi.mock("../../providers/storage", () => ({
  getStorageProviderAsync: vi.fn(),
}));

vi.mock("../../storage/slide-factory-runs", () => ({
  updateSlideFactoryRun: vi.fn(),
}));

vi.mock("../../logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// TOKEN_ENCRYPTION_KEY is read at signing time inside Franco. Set it before
// the module-under-test is imported to avoid a "key required" throw.
process.env.TOKEN_ENCRYPTION_KEY = "franco-test-secret-key";

import { getBrowser } from "../../slides/playwright-browser";
import { getStorageProviderAsync } from "../../providers/storage";
import { updateSlideFactoryRun } from "../../storage/slide-factory-runs";
import { logger } from "../../logger";
import { runFranco } from "../../slides/minions/franco";
import { PDF_CONTENT_TYPE } from "../../slides/deck-render-constants";

// ── Fixtures ─────────────────────────────────────────────────────────────────

const TEST_RUN_ID = 5;
const EXPECTED_KEY = "factory-runs/5/deck.pdf";
const SYNTHETIC_PDF = Buffer.from("%PDF-1.4 synthetic", "utf8");

interface FakePageOptions {
  /** If set, page.evaluate(__deckError ...) returns this string → renderer throws. */
  deckError?: string;
  /** Optional override for the PDF buffer page.pdf() returns. */
  pdfBuffer?: Buffer;
}

function makeFakePage(opts: FakePageOptions = {}) {
  return {
    setDefaultTimeout: vi.fn(),
    goto: vi.fn().mockResolvedValue(undefined),
    waitForFunction: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn().mockResolvedValue(opts.deckError ?? null),
    pdf: vi.fn().mockResolvedValue(opts.pdfBuffer ?? SYNTHETIC_PDF),
  };
}

function makeFakeContext(page: ReturnType<typeof makeFakePage>) {
  return {
    newPage: vi.fn().mockResolvedValue(page),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

function makeFakeBrowser(context: ReturnType<typeof makeFakeContext>) {
  return {
    newContext: vi.fn().mockResolvedValue(context),
  };
}

function wireBrowser(browser: ReturnType<typeof makeFakeBrowser>) {
  (getBrowser as unknown as Mock).mockResolvedValue(browser);
}

function makeStorageMock() {
  return {
    uploadBuffer: vi.fn().mockResolvedValue(undefined),
  };
}

// ─────────────────────────────────────────────────────────────────────────────

describe("runFranco", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("happy path — uploads to factory-runs/<runId>/deck.pdf and writes deckR2Key", async () => {
    const page = makeFakePage();
    const ctx = makeFakeContext(page);
    const browser = makeFakeBrowser(ctx);
    wireBrowser(browser);

    const sp = makeStorageMock();
    (getStorageProviderAsync as unknown as Mock).mockResolvedValue(sp);
    (updateSlideFactoryRun as unknown as Mock).mockResolvedValue({});

    const result = await runFranco(TEST_RUN_ID, { caller: "marco" });

    expect(result).toEqual({ deckR2Key: EXPECTED_KEY });

    // Playwright session shape
    expect(browser.newContext).toHaveBeenCalledTimes(1);
    expect(ctx.newPage).toHaveBeenCalledTimes(1);
    expect(page.pdf).toHaveBeenCalledWith({
      printBackground: true,
      preferCSSPageSize: true,
    });
    expect(ctx.close).toHaveBeenCalledTimes(1);

    // R2 upload
    expect(sp.uploadBuffer).toHaveBeenCalledTimes(1);
    expect(sp.uploadBuffer).toHaveBeenCalledWith(
      EXPECTED_KEY,
      SYNTHETIC_PDF,
      PDF_CONTENT_TYPE,
    );

    // DB write
    expect(updateSlideFactoryRun).toHaveBeenCalledWith(TEST_RUN_ID, {
      deckR2Key: EXPECTED_KEY,
    });
  });

  it("disconnect retry — first attempt throws 'Target closed', second succeeds", async () => {
    const page = makeFakePage();
    const ctx = makeFakeContext(page);
    const browser = makeFakeBrowser(ctx);

    // First newContext call throws disconnect; second resolves.
    browser.newContext = vi
      .fn()
      .mockRejectedValueOnce(new Error("Target closed during browserContext.newContext"))
      .mockResolvedValueOnce(ctx);
    wireBrowser(browser);

    const sp = makeStorageMock();
    (getStorageProviderAsync as unknown as Mock).mockResolvedValue(sp);
    (updateSlideFactoryRun as unknown as Mock).mockResolvedValue({});

    const result = await runFranco(TEST_RUN_ID);

    expect(result).toEqual({ deckR2Key: EXPECTED_KEY });
    expect(browser.newContext).toHaveBeenCalledTimes(2);
    // Retry path emits a warn log
    expect(logger.warn).toHaveBeenCalled();
    const warnCall = (logger.warn as Mock).mock.calls.find(
      (c: unknown[]) => typeof c[0] === "string" && (c[0] as string).includes("disconnect"),
    );
    expect(warnCall).toBeTruthy();
  });

  it("render fails after retry — both attempts throw → runFranco throws", async () => {
    const page = makeFakePage();
    const ctx = makeFakeContext(page);
    const browser = makeFakeBrowser(ctx);

    browser.newContext = vi
      .fn()
      .mockRejectedValueOnce(new Error("Target closed"))
      .mockRejectedValueOnce(new Error("Target closed again"));
    wireBrowser(browser);

    const sp = makeStorageMock();
    (getStorageProviderAsync as unknown as Mock).mockResolvedValue(sp);

    await expect(runFranco(TEST_RUN_ID, { caller: "marco" })).rejects.toThrow();

    // No upload, no DB write — the throw aborted before either.
    expect(sp.uploadBuffer).not.toHaveBeenCalled();
    expect(updateSlideFactoryRun).not.toHaveBeenCalled();
  });

  it("non-disconnect render error does NOT retry and propagates", async () => {
    const page = makeFakePage({ deckError: "image fetch 500" });
    const ctx = makeFakeContext(page);
    const browser = makeFakeBrowser(ctx);
    wireBrowser(browser);

    const sp = makeStorageMock();
    (getStorageProviderAsync as unknown as Mock).mockResolvedValue(sp);

    await expect(runFranco(TEST_RUN_ID)).rejects.toThrow(/image fetch 500/);

    // Only one render attempt — non-disconnect errors are not retried
    expect(browser.newContext).toHaveBeenCalledTimes(1);
    expect(sp.uploadBuffer).not.toHaveBeenCalled();
    expect(updateSlideFactoryRun).not.toHaveBeenCalled();
  });

  it("uploadBuffer fails — runFranco throws and skips deckR2Key write", async () => {
    const page = makeFakePage();
    const ctx = makeFakeContext(page);
    const browser = makeFakeBrowser(ctx);
    wireBrowser(browser);

    const sp = {
      uploadBuffer: vi.fn().mockRejectedValue(new Error("R2 upload failed")),
    };
    (getStorageProviderAsync as unknown as Mock).mockResolvedValue(sp);

    await expect(runFranco(TEST_RUN_ID)).rejects.toThrow(/R2 upload failed/);

    expect(sp.uploadBuffer).toHaveBeenCalledTimes(1);
    expect(updateSlideFactoryRun).not.toHaveBeenCalled();
  });

  it("updateSlideFactoryRun fails — runFranco throws (R2 already has the object)", async () => {
    const page = makeFakePage();
    const ctx = makeFakeContext(page);
    const browser = makeFakeBrowser(ctx);
    wireBrowser(browser);

    const sp = makeStorageMock();
    (getStorageProviderAsync as unknown as Mock).mockResolvedValue(sp);
    (updateSlideFactoryRun as unknown as Mock).mockRejectedValue(
      new Error("DB write failed"),
    );

    await expect(runFranco(TEST_RUN_ID)).rejects.toThrow(/DB write failed/);

    // Upload happened before the DB write failed — that's the documented
    // contract; Rebecca-triggered retry is idempotent on the same R2 key.
    expect(sp.uploadBuffer).toHaveBeenCalledWith(
      EXPECTED_KEY,
      SYNTHETIC_PDF,
      PDF_CONTENT_TYPE,
    );
    expect(updateSlideFactoryRun).toHaveBeenCalled();
  });

  it("caller annotation — logs include [franco][rebecca] when caller='rebecca'", async () => {
    const page = makeFakePage();
    const ctx = makeFakeContext(page);
    const browser = makeFakeBrowser(ctx);
    wireBrowser(browser);

    const sp = makeStorageMock();
    (getStorageProviderAsync as unknown as Mock).mockResolvedValue(sp);
    (updateSlideFactoryRun as unknown as Mock).mockResolvedValue({});

    await runFranco(TEST_RUN_ID, { caller: "rebecca" });

    // Every info log line must include both the [franco] namespace AND the
    // [rebecca] caller annotation. Pick one and assert it.
    const infoCalls = (logger.info as Mock).mock.calls;
    expect(infoCalls.length).toBeGreaterThan(0);
    const hasAnnotated = infoCalls.some(
      (c: unknown[]) =>
        typeof c[0] === "string" &&
        (c[0] as string).includes("[franco][rebecca]"),
    );
    expect(hasAnnotated).toBe(true);
  });

  it("caller defaults — when caller is omitted, log annotation is [unknown]", async () => {
    const page = makeFakePage();
    const ctx = makeFakeContext(page);
    const browser = makeFakeBrowser(ctx);
    wireBrowser(browser);

    const sp = makeStorageMock();
    (getStorageProviderAsync as unknown as Mock).mockResolvedValue(sp);
    (updateSlideFactoryRun as unknown as Mock).mockResolvedValue({});

    await runFranco(TEST_RUN_ID);

    const infoCalls = (logger.info as Mock).mock.calls;
    const hasUnknownAnnotated = infoCalls.some(
      (c: unknown[]) =>
        typeof c[0] === "string" &&
        (c[0] as string).includes("[franco][unknown]"),
    );
    expect(hasUnknownAnnotated).toBe(true);
  });
});
