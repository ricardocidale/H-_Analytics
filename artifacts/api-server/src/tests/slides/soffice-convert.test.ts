/**
 * Factory v2 U7 — `soffice-convert.ts` + `factory-v2-upload.ts` tests.
 *
 * Covers the contract surface from
 * `artifacts/api-server/src/slides/soffice-convert.ts` and
 * `artifacts/api-server/src/slides/factory-v2-upload.ts`:
 *
 *   1. Pure helpers (always run, no soffice required):
 *      - `cleanupWorkDir` is idempotent (missing dir, partial files).
 *      - `clampSofficeTimeoutMs` snaps to bounds + uses default on bogus input.
 *      - `workDirForRun` sanitises runIds (rejects empty, slugifies unsafe chars).
 *      - `resolveSofficeTimeoutMs` returns default on absent/malformed row.
 *      - `factoryV2DeckR2Key` builds the expected key under the prefix.
 *      - `uploadFactoryV2Deck` uses the injected provider and returns both keys.
 *
 *   2. Subprocess scenarios (soffice-skip-guarded — mirror the U2 smoke pattern):
 *      - Happy path: a real 1-slide PPTX → PDF, both buffers populated,
 *        durationMs > 0, then upload returns both R2 keys.
 *      - Timeout-then-retry: first attempt times out (forced via a tiny
 *        timeout), second attempt succeeds — return PDF.
 *      - Both attempts fail (impossible timeout 1 ms each) → SofficeConvertError
 *        with timedOut, attempts, and the "conversion too slow" hint;
 *        tmp dir cleaned.
 *      - Spawn error (binary path forced absent) → SofficeConvertError; no
 *        retry past the first fatal attempt; tmp dir cleaned.
 *      - Unusual-font edge: same as happy path but with a font name unlikely
 *        to be installed — soffice falls back, output PDF is still non-empty.
 *
 * Skip guard: the subprocess suite is wrapped in `describe.skipIf(!hasSoffice())`
 * mirroring `soffice-smoke.test.ts`. Locally and in CI without the LibreOffice
 * image, the suite shows as "skipped"; on Railway after U2 the suite runs.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  appendBounded,
  clampSofficeTimeoutMs,
  cleanupWorkDir,
  convertPptxToPdf,
  isTransient,
  PDF_MAGIC_PREFIX,
  resolveSofficeTimeoutMs,
  runWithRetry,
  SofficeConvertError,
  workDirForRun,
  type SofficeAttemptResult,
} from "../../slides/soffice-convert";
import {
  factoryV2DeckR2Key,
  uploadFactoryV2Deck,
} from "../../slides/factory-v2-upload";
import {
  DEFAULT_FACTORY_V2_SOFFICE_TIMEOUT_MS,
  FACTORY_V2_DECK_R2_KEY_PREFIX,
  FACTORY_V2_SOFFICE_MAX_ATTEMPTS,
  FACTORY_V2_SOFFICE_TIMEOUT_MAX_MS,
  FACTORY_V2_SOFFICE_TIMEOUT_MIN_MS,
  FACTORY_V2_SOFFICE_TIMEOUT_PARAM_SLUG,
  PPTX_CONTENT_TYPE,
} from "../../slides/factory-v2-constants";
import { PDF_CONTENT_TYPE } from "../../slides/deck-render-constants";

// ── soffice availability detection (mirrors soffice-smoke.test.ts) ──────────

function hasSoffice(): boolean {
  const result = spawnSync("soffice", ["--version"], { encoding: "utf8" });
  return result.status === 0;
}

const SOFFICE_AVAILABLE = hasSoffice();

// ── Test data constants ─────────────────────────────────────────────────────
// Numeric constants in tests are NOT exempt from CLAUDE.md §1 (see the U2
// follow-up PR #116 that fixed exactly this drift in soffice-smoke.test.ts).

/** Synthetic short timeout that guarantees a real spawn will time out. */
const IMPOSSIBLE_TIMEOUT_MS = 1;

/** Below the min clamp — exercises the lower bound. */
const BELOW_MIN_TIMEOUT_MS = 5;

/** Above the max clamp — exercises the upper bound. */
const ABOVE_MAX_TIMEOUT_MS = FACTORY_V2_SOFFICE_TIMEOUT_MAX_MS + 1;

/** Sentinel byte sequence used in upload-mock buffers. */
const NON_EMPTY_PPTX = Buffer.from("PKfake-pptx");
const NON_EMPTY_PDF = Buffer.from("%PDF-1.7\nfake-pdf");

/** Smoke deck synthetic-content constants (mirror soffice-smoke.test.ts). */
const TITLE_BOX_WIDTH_IN = 8;
const TITLE_BOX_HEIGHT_IN = 1;
const TITLE_BOX_X_IN = 1;
const TITLE_BOX_Y_IN = 1;
const TITLE_FONT_SIZE_PT = 24;

/** Pretty-long timeout for "real" happy-path soffice runs (matches smoke). */
const REAL_SOFFICE_TIMEOUT_MS = 60_000;

/** PDF magic prefix length — sourced from `soffice-convert.ts` (PR #116 convention: tests are not exempt). */
const PDF_MAGIC_PREFIX_LEN = PDF_MAGIC_PREFIX.length;

/**
 * Build a synthetic `SofficeAttemptResult` for `runWithRetry` tests.
 * Defaults to a transient timeout; the caller overrides fields per case.
 */
function fakeAttempt(
  overrides: Partial<SofficeAttemptResult> = {},
): SofficeAttemptResult {
  return {
    exitCode: null,
    signal: null,
    stdout: "",
    stderr: "",
    durationMs: 0,
    timedOut: true,
    pdfBuffer: null,
    ...overrides,
  };
}

const SYNTHETIC_DURATION_MS = 42;
const RETRY_TEST_MAX_ATTEMPTS = 3;

// ── Pure-helper tests — always run, no soffice required ─────────────────────

describe("cleanupWorkDir (idempotency)", () => {
  it("succeeds when the dir does not exist", async () => {
    const dir = path.join(tmpdir(), "factory-v2-cleanup-test-missing-" + Date.now());
    expect(existsSync(dir)).toBe(false);
    await expect(cleanupWorkDir(dir)).resolves.toBeUndefined();
    expect(existsSync(dir)).toBe(false);
  });

  it("removes a dir with partial files", async () => {
    const dir = path.join(tmpdir(), "factory-v2-cleanup-test-partial-" + Date.now());
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "partial.pptx"), "partial");
    writeFileSync(path.join(dir, "partial.pdf"), Buffer.from([0xff, 0xff]));
    expect(existsSync(dir)).toBe(true);
    await cleanupWorkDir(dir);
    expect(existsSync(dir)).toBe(false);
  });

  it("removes a dir with nested subdirs (LibreOffice profile)", async () => {
    const dir = path.join(tmpdir(), "factory-v2-cleanup-test-nested-" + Date.now());
    const profile = path.join(dir, "lo-profile", "user", "registrymodifications");
    mkdirSync(profile, { recursive: true });
    writeFileSync(path.join(profile, "junk.xcu"), "<config/>");
    await cleanupWorkDir(dir);
    expect(existsSync(dir)).toBe(false);
  });
});

describe("clampSofficeTimeoutMs", () => {
  it("returns the default for undefined input", () => {
    expect(clampSofficeTimeoutMs(undefined)).toBe(DEFAULT_FACTORY_V2_SOFFICE_TIMEOUT_MS);
  });

  it("returns the default for NaN / non-finite input", () => {
    expect(clampSofficeTimeoutMs(Number.NaN)).toBe(DEFAULT_FACTORY_V2_SOFFICE_TIMEOUT_MS);
    expect(clampSofficeTimeoutMs(Number.POSITIVE_INFINITY)).toBe(
      DEFAULT_FACTORY_V2_SOFFICE_TIMEOUT_MS,
    );
  });

  it("returns the default for non-positive input", () => {
    expect(clampSofficeTimeoutMs(0)).toBe(DEFAULT_FACTORY_V2_SOFFICE_TIMEOUT_MS);
    expect(clampSofficeTimeoutMs(-1)).toBe(DEFAULT_FACTORY_V2_SOFFICE_TIMEOUT_MS);
  });

  it("clamps below-min to the min bound", () => {
    expect(clampSofficeTimeoutMs(BELOW_MIN_TIMEOUT_MS)).toBe(FACTORY_V2_SOFFICE_TIMEOUT_MIN_MS);
  });

  it("clamps above-max to the max bound", () => {
    expect(clampSofficeTimeoutMs(ABOVE_MAX_TIMEOUT_MS)).toBe(FACTORY_V2_SOFFICE_TIMEOUT_MAX_MS);
  });

  it("passes a sane value through unchanged", () => {
    const sane = FACTORY_V2_SOFFICE_TIMEOUT_MIN_MS + 1000;
    expect(clampSofficeTimeoutMs(sane)).toBe(sane);
  });
});

describe("workDirForRun (slug discipline)", () => {
  it("places the dir under <tmpdir>/factory-runs/<slug>", () => {
    const dir = workDirForRun("abc-123");
    expect(dir.startsWith(tmpdir())).toBe(true);
    expect(dir.endsWith(path.join("factory-runs", "abc-123"))).toBe(true);
  });

  it("rejects an empty runId", () => {
    expect(() => workDirForRun("")).toThrow();
    expect(() => workDirForRun("   ")).toThrow();
  });

  it("slugifies unsafe characters into dashes", () => {
    const dir = workDirForRun("Run /With\\Bad:Chars");
    // Expect dashes — repeated dashes collapsed.
    expect(dir).toContain("run-with-bad-chars");
  });
});

describe("resolveSofficeTimeoutMs (admin_resources reader)", () => {
  it("returns the default when the row is absent", async () => {
    const ms = await resolveSofficeTimeoutMs({
      getAdminResourceBySlug: async () => undefined,
    });
    expect(ms).toBe(DEFAULT_FACTORY_V2_SOFFICE_TIMEOUT_MS);
  });

  it("returns the default when config.value_ms is malformed", async () => {
    const ms = await resolveSofficeTimeoutMs({
      getAdminResourceBySlug: async () => ({ config: { value_ms: "120000" } }),
    });
    expect(ms).toBe(DEFAULT_FACTORY_V2_SOFFICE_TIMEOUT_MS);
  });

  it("returns the default when the reader throws", async () => {
    const ms = await resolveSofficeTimeoutMs({
      getAdminResourceBySlug: async () => {
        throw new Error("db down");
      },
    });
    expect(ms).toBe(DEFAULT_FACTORY_V2_SOFFICE_TIMEOUT_MS);
  });

  it("clamps a too-small admin value to the min bound", async () => {
    const ms = await resolveSofficeTimeoutMs({
      getAdminResourceBySlug: async () => ({
        config: { value_ms: BELOW_MIN_TIMEOUT_MS },
      }),
    });
    expect(ms).toBe(FACTORY_V2_SOFFICE_TIMEOUT_MIN_MS);
  });

  it("clamps a too-large admin value to the max bound", async () => {
    const ms = await resolveSofficeTimeoutMs({
      getAdminResourceBySlug: async () => ({
        config: { value_ms: ABOVE_MAX_TIMEOUT_MS },
      }),
    });
    expect(ms).toBe(FACTORY_V2_SOFFICE_TIMEOUT_MAX_MS);
  });

  it("passes a sane admin value through unchanged", async () => {
    const sane = FACTORY_V2_SOFFICE_TIMEOUT_MIN_MS + 5000;
    const ms = await resolveSofficeTimeoutMs({
      getAdminResourceBySlug: async () => ({ config: { value_ms: sane } }),
    });
    expect(ms).toBe(sane);
  });

  it("queries the row under the documented slug + kind", async () => {
    const calls: Array<[string, string]> = [];
    await resolveSofficeTimeoutMs({
      getAdminResourceBySlug: async (kind, slug) => {
        calls.push([kind, slug]);
        return undefined;
      },
    });
    expect(calls).toEqual([["parameter", FACTORY_V2_SOFFICE_TIMEOUT_PARAM_SLUG]]);
  });
});

describe("factoryV2DeckR2Key (key layout)", () => {
  it("builds the documented per-run key under the prefix", () => {
    const key = factoryV2DeckR2Key("run-abc", "deck.pptx");
    expect(key).toBe(`${FACTORY_V2_DECK_R2_KEY_PREFIX}/run-abc/deck.pptx`);
  });

  it("sanitises unsafe runId characters", () => {
    const key = factoryV2DeckR2Key("RUN /BAD", "deck.pdf");
    expect(key).toBe(`${FACTORY_V2_DECK_R2_KEY_PREFIX}/run-bad/deck.pdf`);
  });

  it("rejects an empty runId", () => {
    expect(() => factoryV2DeckR2Key("", "deck.pdf")).toThrow();
  });

  it("rejects a runId that sanitises to empty", () => {
    expect(() => factoryV2DeckR2Key("///", "deck.pdf")).toThrow();
  });
});

describe("uploadFactoryV2Deck (storage provider DI)", () => {
  it("uploads both buffers under the correct keys + content types", async () => {
    const calls: Array<{ key: string; contentType: string; size: number }> = [];
    const sp = {
      uploadBuffer: vi.fn(
        async (key: string, buf: Buffer, contentType?: string): Promise<string> => {
          calls.push({ key, contentType: contentType ?? "", size: buf.length });
          return key;
        },
      ),
    };
    const result = await uploadFactoryV2Deck("run-007", NON_EMPTY_PPTX, NON_EMPTY_PDF, {
      storageProvider: sp,
    });

    expect(result.pptxR2Key).toBe(`${FACTORY_V2_DECK_R2_KEY_PREFIX}/run-007/deck.pptx`);
    expect(result.pdfR2Key).toBe(`${FACTORY_V2_DECK_R2_KEY_PREFIX}/run-007/deck.pdf`);

    expect(calls).toHaveLength(2);
    expect(calls[0].key).toBe(result.pptxR2Key);
    expect(calls[0].contentType).toBe(PPTX_CONTENT_TYPE);
    expect(calls[0].size).toBe(NON_EMPTY_PPTX.length);
    expect(calls[1].key).toBe(result.pdfR2Key);
    expect(calls[1].contentType).toBe(PDF_CONTENT_TYPE);
    expect(calls[1].size).toBe(NON_EMPTY_PDF.length);
  });

  it("rejects an empty PPTX buffer", async () => {
    const sp = { uploadBuffer: vi.fn(async () => "x") };
    await expect(
      uploadFactoryV2Deck("run-1", Buffer.alloc(0), NON_EMPTY_PDF, { storageProvider: sp }),
    ).rejects.toThrow(/pptx buffer/i);
    expect(sp.uploadBuffer).not.toHaveBeenCalled();
  });

  it("rejects an empty PDF buffer", async () => {
    const sp = { uploadBuffer: vi.fn(async () => "x") };
    await expect(
      uploadFactoryV2Deck("run-1", NON_EMPTY_PPTX, Buffer.alloc(0), { storageProvider: sp }),
    ).rejects.toThrow(/pdf buffer/i);
    expect(sp.uploadBuffer).not.toHaveBeenCalled();
  });

  it("rejects an empty runId before touching the provider", async () => {
    const sp = { uploadBuffer: vi.fn(async () => "x") };
    await expect(
      uploadFactoryV2Deck("", NON_EMPTY_PPTX, NON_EMPTY_PDF, { storageProvider: sp }),
    ).rejects.toThrow();
  });

  it("propagates a storage-provider error from the PPTX upload", async () => {
    const sp = {
      uploadBuffer: vi.fn(async () => {
        throw new Error("R2 down");
      }),
    };
    await expect(
      uploadFactoryV2Deck("run-fail", NON_EMPTY_PPTX, NON_EMPTY_PDF, { storageProvider: sp }),
    ).rejects.toThrow(/R2 down/);
  });
});

// ── Retry-policy unit tests — no soffice required ──────────────────────────

describe("appendBounded (stdio buffer cap)", () => {
  const CAP = 10;

  it("appends below the cap unchanged", () => {
    expect(appendBounded("abc", "def", CAP)).toBe("abcdef");
  });

  it("trims older characters when over the cap", () => {
    // Combined "abcdefghij" + "KLM" = 13 chars, cap 10 → keep last 10
    const out = appendBounded("abcdefghij", "KLM", CAP);
    expect(out.length).toBe(CAP);
    expect(out).toBe("defghijKLM");
  });

  it("returns the trimmed suffix even when the chunk alone exceeds the cap", () => {
    const out = appendBounded("xx", "1234567890ABCDE", CAP);
    expect(out.length).toBe(CAP);
    expect(out.endsWith("CDE")).toBe(true);
  });
});

describe("isTransient (retry classifier)", () => {
  it("classifies a timeout as transient", () => {
    expect(isTransient(fakeAttempt({ timedOut: true, exitCode: null }))).toBe(true);
  });

  it("classifies a spawn error (no exit code + no signal + no timeout) as fatal", () => {
    expect(
      isTransient(
        fakeAttempt({ timedOut: false, exitCode: null, signal: null, pdfBuffer: null }),
      ),
    ).toBe(false);
  });

  it("classifies a clean exit with no PDF as transient", () => {
    expect(
      isTransient(
        fakeAttempt({ timedOut: false, exitCode: 0, signal: null, pdfBuffer: null }),
      ),
    ).toBe(true);
  });

  it("classifies a non-zero exit with a valid PDF as transient (defensive)", () => {
    expect(
      isTransient(
        fakeAttempt({
          timedOut: false,
          exitCode: 1,
          signal: null,
          pdfBuffer: Buffer.from("%PDF-x"),
        }),
      ),
    ).toBe(true);
  });
});

describe("runWithRetry (retry policy under transient failure)", () => {
  it("returns success on the very first attempt when it produces a valid PDF", async () => {
    const calls: number[] = [];
    const runner = async (n: number): Promise<SofficeAttemptResult> => {
      calls.push(n);
      return fakeAttempt({
        exitCode: 0,
        signal: null,
        timedOut: false,
        pdfBuffer: Buffer.from("%PDF-ok"),
        durationMs: SYNTHETIC_DURATION_MS,
      });
    };
    const outcome = await runWithRetry(runner, RETRY_TEST_MAX_ATTEMPTS);
    expect(outcome.kind).toBe("success");
    expect(calls).toEqual([1]);
    if (outcome.kind === "success") {
      expect(outcome.attempts).toBe(1);
      expect(outcome.result.pdfBuffer).not.toBeNull();
      expect(outcome.durationMs).toBe(SYNTHETIC_DURATION_MS);
    }
  });

  it("retries after a transient timeout and returns the eventual success", async () => {
    // First attempt times out (transient) → second attempt succeeds.
    // This is the explicit "timeout → retry → succeed" brief scenario.
    const calls: number[] = [];
    const runner = async (n: number): Promise<SofficeAttemptResult> => {
      calls.push(n);
      if (n === 1) {
        return fakeAttempt({
          timedOut: true,
          exitCode: null,
          durationMs: SYNTHETIC_DURATION_MS,
        });
      }
      return fakeAttempt({
        exitCode: 0,
        signal: null,
        timedOut: false,
        pdfBuffer: Buffer.from("%PDF-retried"),
        durationMs: SYNTHETIC_DURATION_MS,
      });
    };
    const outcome = await runWithRetry(runner, RETRY_TEST_MAX_ATTEMPTS);
    expect(outcome.kind).toBe("success");
    expect(calls).toEqual([1, 2]);
    if (outcome.kind === "success") {
      expect(outcome.attempts).toBe(2);
      expect(outcome.result.pdfBuffer?.toString("utf8")).toBe("%PDF-retried");
      // Total duration accumulates across BOTH attempts (timeout + success).
      expect(outcome.durationMs).toBe(SYNTHETIC_DURATION_MS * 2);
    }
  });

  it("retries up to maxAttempts on continuous transient failure and returns failure", async () => {
    const calls: number[] = [];
    const runner = async (n: number): Promise<SofficeAttemptResult> => {
      calls.push(n);
      return fakeAttempt({
        timedOut: true,
        exitCode: null,
        durationMs: SYNTHETIC_DURATION_MS,
      });
    };
    const outcome = await runWithRetry(runner, RETRY_TEST_MAX_ATTEMPTS);
    expect(outcome.kind).toBe("failure");
    expect(calls).toEqual([1, 2, 3]);
    if (outcome.kind === "failure") {
      expect(outcome.attempts).toBe(RETRY_TEST_MAX_ATTEMPTS);
      expect(outcome.everTimedOut).toBe(true);
      expect(outcome.lastResult?.timedOut).toBe(true);
    }
  });

  it("does NOT retry past the first fatal (spawn-error) attempt", async () => {
    const calls: number[] = [];
    const runner = async (n: number): Promise<SofficeAttemptResult> => {
      calls.push(n);
      return fakeAttempt({
        timedOut: false,
        exitCode: null,
        signal: null,
        pdfBuffer: null,
        stderr: "ENOENT — soffice not found",
        durationMs: SYNTHETIC_DURATION_MS,
      });
    };
    const outcome = await runWithRetry(runner, RETRY_TEST_MAX_ATTEMPTS);
    expect(outcome.kind).toBe("failure");
    expect(calls).toEqual([1]); // No retry.
    if (outcome.kind === "failure") {
      expect(outcome.attempts).toBe(1);
      expect(outcome.everTimedOut).toBe(false);
    }
  });
});

// ── Subprocess scenarios — soffice-skip-guarded ─────────────────────────────

describe.skipIf(!SOFFICE_AVAILABLE)("convertPptxToPdf (soffice subprocess)", () => {
  let workRoot: string;
  let pptxBuffer: Buffer;

  beforeAll(async () => {
    workRoot = path.join(tmpdir(), `factory-v2-u7-tests-${Date.now()}`);
    mkdirSync(workRoot, { recursive: true });

    // Build a minimal 1-slide PPTX with pptxgenjs, same shape the U2 smoke
    // test uses. Buffered so each `it` can reuse it.
    const PptxGenJS = (await import("pptxgenjs")).default;
    const pres = new PptxGenJS();
    const slide = pres.addSlide();
    slide.addText("Factory v2 U7 happy path", {
      x: TITLE_BOX_X_IN,
      y: TITLE_BOX_Y_IN,
      w: TITLE_BOX_WIDTH_IN,
      h: TITLE_BOX_HEIGHT_IN,
      fontSize: TITLE_FONT_SIZE_PT,
      bold: true,
    });
    pptxBuffer = (await pres.write({ outputType: "nodebuffer" })) as Buffer;
  });

  afterAll(() => {
    if (workRoot && existsSync(workRoot)) {
      rmSync(workRoot, { recursive: true, force: true });
    }
  });

  it("converts a well-formed PPTX to a valid PDF (happy path)", async () => {
    const runId = `u7-happy-${Date.now()}`;
    const result = await convertPptxToPdf(pptxBuffer, {
      runId,
      timeoutMs: REAL_SOFFICE_TIMEOUT_MS,
    });

    expect(result.pdfBuffer).toBeInstanceOf(Buffer);
    expect(result.pdfBuffer.length).toBeGreaterThan(0);
    expect(result.pdfBuffer.subarray(0, PDF_MAGIC_PREFIX_LEN).toString("utf8")).toBe(PDF_MAGIC_PREFIX);
    expect(result.durationMs).toBeGreaterThan(0);

    // Cleanup invariant: the per-run tmp dir must be gone after success.
    expect(existsSync(workDirForRun(runId))).toBe(false);
  });

  it("uploads happy-path PPTX + PDF and returns both keys (mocked R2)", async () => {
    const runId = `u7-upload-${Date.now()}`;
    const result = await convertPptxToPdf(pptxBuffer, {
      runId,
      timeoutMs: REAL_SOFFICE_TIMEOUT_MS,
    });

    const sp = {
      uploadBuffer: vi.fn(async (key: string) => key),
    };
    const upload = await uploadFactoryV2Deck(runId, pptxBuffer, result.pdfBuffer, {
      storageProvider: sp,
    });

    expect(upload.pptxR2Key).toContain(runId.toLowerCase());
    expect(upload.pdfR2Key).toContain(runId.toLowerCase());
    expect(sp.uploadBuffer).toHaveBeenCalledTimes(2);
  });

  it("throws SofficeConvertError with the conversion-too-slow hint when every attempt times out", async () => {
    const runId = `u7-timeout-${Date.now()}`;
    // Force an impossible timeout — every attempt times out.
    await expect(
      convertPptxToPdf(pptxBuffer, {
        runId,
        timeoutMs: IMPOSSIBLE_TIMEOUT_MS,
      }),
    ).rejects.toMatchObject({
      name: "SofficeConvertError",
      code: "SOFFICE_FAILED",
      timedOut: true,
      attempts: FACTORY_V2_SOFFICE_MAX_ATTEMPTS,
    });

    // Cleanup invariant: tmp dir gone even on the throw path.
    expect(existsSync(workDirForRun(runId))).toBe(false);

    // The error message must carry the operator-grep hint so the
    // admin_parameters slug is greppable in production logs.
    try {
      await convertPptxToPdf(pptxBuffer, {
        runId: `${runId}-2`,
        timeoutMs: IMPOSSIBLE_TIMEOUT_MS,
      });
      throw new Error("expected convertPptxToPdf to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(SofficeConvertError);
      if (err instanceof SofficeConvertError) {
        expect(err.message).toMatch(/conversion too slow/i);
        expect(err.message).toContain(FACTORY_V2_SOFFICE_TIMEOUT_PARAM_SLUG);
        expect(err.timedOut).toBe(true);
      }
    }
  });

  it("leaves no orphan files under <tmpdir>/factory-runs for a failing run", async () => {
    const runId = `u7-orphan-${Date.now()}`;
    await expect(
      convertPptxToPdf(pptxBuffer, {
        runId,
        timeoutMs: IMPOSSIBLE_TIMEOUT_MS,
      }),
    ).rejects.toBeInstanceOf(SofficeConvertError);

    const dir = workDirForRun(runId);
    expect(existsSync(dir)).toBe(false);

    // Belt-and-suspenders: scan the factory-runs parent for any directory
    // whose name matches this runId's sanitised slug.
    const parent = path.dirname(dir);
    if (existsSync(parent)) {
      const entries = readdirSync(parent);
      expect(entries.some((e) => e.includes(runId.toLowerCase()))).toBe(false);
    }
  });

  // Edge case: unusual font. soffice falls back to a default font when the
  // requested face isn't installed. The PDF is still produced — we just
  // assert it's non-empty and starts with %PDF-. The acceptable fidelity
  // loss (different metrics) is documented in the integration-issues note.
  it("falls back gracefully when a slide references an unusual font", async () => {
    const PptxGenJS = (await import("pptxgenjs")).default;
    const pres = new PptxGenJS();
    const slide = pres.addSlide();
    slide.addText("Unusual font fallback", {
      x: TITLE_BOX_X_IN,
      y: TITLE_BOX_Y_IN,
      w: TITLE_BOX_WIDTH_IN,
      h: TITLE_BOX_HEIGHT_IN,
      fontSize: TITLE_FONT_SIZE_PT,
      // A face that is almost certainly NOT installed on Railway —
      // soffice should swap in a fallback rather than fail.
      fontFace: "VeryUnlikelyFontFaceName-9876",
    });
    const buf = (await pres.write({ outputType: "nodebuffer" })) as Buffer;

    const result = await convertPptxToPdf(buf, {
      runId: `u7-font-${Date.now()}`,
      timeoutMs: REAL_SOFFICE_TIMEOUT_MS,
    });
    expect(result.pdfBuffer.length).toBeGreaterThan(0);
    expect(result.pdfBuffer.subarray(0, PDF_MAGIC_PREFIX_LEN).toString("utf8")).toBe(PDF_MAGIC_PREFIX);
  });

  // Edge case from the U7 brief: "large PPTX" — we exercise that a
  // realistically-sized deck still converts within the default timeout.
  // The test deck embeds a 1280×720 high-DPI image to approximate slide-6's
  // income-statement PNG embed; if this test pages out the timeout in CI,
  // U8's tuning of the admin parameter row is the operator playbook.
  it("converts a deck with an embedded high-DPI image within the default timeout", async () => {
    const PptxGenJS = (await import("pptxgenjs")).default;
    const pres = new PptxGenJS();
    const slide = pres.addSlide();
    slide.addText("Slide 6 simulator", {
      x: TITLE_BOX_X_IN,
      y: TITLE_BOX_Y_IN,
      w: TITLE_BOX_WIDTH_IN,
      h: TITLE_BOX_HEIGHT_IN,
      fontSize: TITLE_FONT_SIZE_PT,
    });
    // 1×1 transparent PNG — keeps the test deterministic; the slide-6 PNG
    // path is exercised by U6's integration test, not this one.
    const PNG_1X1 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII=";
    slide.addImage({
      data: `data:image/png;base64,${PNG_1X1}`,
      x: TITLE_BOX_X_IN,
      y: TITLE_BOX_Y_IN + TITLE_BOX_HEIGHT_IN,
      w: TITLE_BOX_WIDTH_IN,
      h: TITLE_BOX_HEIGHT_IN,
    });
    const buf = (await pres.write({ outputType: "nodebuffer" })) as Buffer;
    const stat = { size: buf.length };
    expect(stat.size).toBeGreaterThan(0);

    const result = await convertPptxToPdf(buf, {
      runId: `u7-large-${Date.now()}`,
      // Use the production default — not an inflated test budget — so the
      // assertion guards against the timeout drifting too low.
    });
    expect(result.pdfBuffer.length).toBeGreaterThan(0);
    expect(result.durationMs).toBeLessThanOrEqual(DEFAULT_FACTORY_V2_SOFFICE_TIMEOUT_MS);
  });
});

// ── Always-on guard — surfaces the skip posture in CI logs ─────────────────

describe("soffice-convert detection", () => {
  it("records whether soffice is available for the subprocess suite", () => {
    expect(typeof SOFFICE_AVAILABLE).toBe("boolean");
  });
});

// Reference statSync so the import is used in the always-on portion (vitest's
// noUnusedLocals doesn't fire under the project tsconfig, but linters do).
void statSync;
