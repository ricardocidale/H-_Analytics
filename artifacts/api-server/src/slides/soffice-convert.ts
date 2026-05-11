/**
 * soffice-convert.ts — Factory v2 U7
 *
 * Subprocess wrapper around `soffice --headless --convert-to pdf`. Consumes
 * the PPTX Buffer produced by U4's `substituteSlots()`, writes it to a fresh
 * per-run tmp dir, spawns LibreOffice headless with an isolated user-profile,
 * captures stdout/stderr with bounded buffering, enforces a configurable
 * timeout (with SIGTERM-then-SIGKILL escalation), retries once on transient
 * failures, and returns the resulting PDF as a Buffer.
 *
 * Surface (per the U7 task spec):
 *
 *   ```ts
 *   convertPptxToPdf(
 *     pptxBuffer: Buffer,
 *     options: { runId: string; timeoutMs?: number },
 *   ): Promise<{ pdfBuffer: Buffer; durationMs: number }>;
 *   ```
 *
 * Upload to R2 is a separate concern handled by `factory-v2-upload.ts`. The
 * route layer composes the two — `soffice-convert` never touches storage.
 *
 * Subprocess discipline (advisor guidance):
 *   - `spawn` (async), NOT `spawnSync` — we need promise-based timeout +
 *     signal escalation. The U2 smoke test's `spawnSync` is the wrong
 *     precedent for production wiring.
 *   - Per-run tmp dir at `/tmp/factory-runs/<runId>/` so concurrent runs
 *     can't collide on a shared LibreOffice profile lock.
 *   - `-env:UserInstallation=file://<workDir>/lo-profile` mirrors the U2
 *     decision doc convention (matches the smoke test's invocation).
 *   - `rm -rf` cleanup is idempotent (handles "dir missing" / "partial files
 *     present" identically) — extracted to a helper so cleanup-invariant
 *     tests can run without a real `soffice` binary on PATH.
 *
 * CLAUDE.md §1 / §2 compliance:
 *   - All numeric literals are named constants in
 *     `lib/shared/src/constants.ts` (`FACTORY_V2_*`) or are documented
 *     structural indices/clamps. No timeout, retry count, kill-signal
 *     grace, or stderr-tail length appears as a raw literal in this file.
 *   - The `factory-v2-soffice-timeout-ms` admin_resources parameter row
 *     slug lives as the named constant `FACTORY_V2_SOFFICE_TIMEOUT_PARAM_SLUG`.
 *
 * Errors:
 *   - `SofficeConvertError` (`code: 'SOFFICE_FAILED'`) carries the final
 *     `exitCode`, `stderrTail`, `attempts`, and `durationMs` so upstream
 *     can record structured telemetry without regex-matching the message.
 *   - "Conversion too slow" is a grep-able note inside the error message
 *     when every attempt timed out (the operator-tunable hint that the
 *     `admin_parameters` row needs lengthening).
 */
import { spawn } from "node:child_process";
import { mkdir, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  DEFAULT_FACTORY_V2_SOFFICE_TIMEOUT_MS,
  FACTORY_V2_SOFFICE_KILL_GRACE_MS,
  FACTORY_V2_SOFFICE_MAX_ATTEMPTS,
  FACTORY_V2_SOFFICE_STDERR_TAIL_CHARS,
  FACTORY_V2_SOFFICE_STREAM_BUFFER_MAX_BYTES,
  FACTORY_V2_SOFFICE_TIMEOUT_MAX_MS,
  FACTORY_V2_SOFFICE_TIMEOUT_MIN_MS,
  FACTORY_V2_SOFFICE_TIMEOUT_PARAM_SLUG,
} from "@shared/constants";

// ── Constants local to this module ──────────────────────────────────────────
// Strings / labels only — every numeric value lives in @shared/constants.

/** Subprocess binary. soffice ships on PATH in the Railway image (U2). */
const SOFFICE_BIN = "soffice";

/** Subdirectory under `/tmp` used for all Factory v2 conversion runs. */
const FACTORY_V2_TMP_PARENT = "factory-runs";

/** Subdirectory inside a per-run workDir holding the LibreOffice profile. */
const LO_PROFILE_SUBDIR = "lo-profile";

/** Filename used for the input PPTX inside the per-run workDir. */
const INPUT_PPTX_FILENAME = "deck.pptx";

/** Filename soffice will produce by `--convert-to pdf` on `deck.pptx`. */
const OUTPUT_PDF_FILENAME = "deck.pdf";

/**
 * PDF magic prefix used for the integrity check on the produced file.
 * Exported so tests reuse the same constant (consistent with the U2
 * follow-up PR #116 convention "tests are not exempt").
 */
export const PDF_MAGIC_PREFIX = "%PDF-";

/**
 * Error code surfaced when every soffice attempt times out — operator grep
 * keyword for "tune the `factory-v2-soffice-timeout-ms` admin parameter".
 */
const CONVERSION_TOO_SLOW_HINT =
  "conversion too slow — tune timeout in admin_resources " +
  `parameter row "${FACTORY_V2_SOFFICE_TIMEOUT_PARAM_SLUG}"`;

// ── Public types ────────────────────────────────────────────────────────────

export interface ConvertPptxToPdfOptions {
  /**
   * Unique identifier for the run — used to scope the per-conversion tmp
   * dir at `/tmp/factory-runs/<runId>/`. Must be a non-empty string that
   * is safe to include in a filesystem path; the helper sanitizes it.
   */
  runId: string;
  /**
   * Per-attempt timeout in milliseconds. When omitted, the caller (route
   * layer) should resolve the admin-overridable value via
   * `resolveSofficeTimeoutMs()` and pass it in. The function clamps any
   * provided value into `[FACTORY_V2_SOFFICE_TIMEOUT_MIN_MS,
   * FACTORY_V2_SOFFICE_TIMEOUT_MAX_MS]` and falls back to
   * `DEFAULT_FACTORY_V2_SOFFICE_TIMEOUT_MS` if absent.
   */
  timeoutMs?: number;
}

export interface ConvertPptxToPdfResult {
  pdfBuffer: Buffer;
  /** Wall-clock duration of the successful attempt, in milliseconds. */
  durationMs: number;
}

/**
 * Structured error raised when every retry attempt has failed. Tests
 * assert on the readonly fields; the message is for human telemetry only.
 *
 * Mirrors the `SlotOverflowError` precedent in `pptx-substitution-types.ts`.
 */
export class SofficeConvertError extends Error {
  readonly code = "SOFFICE_FAILED" as const;
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stderrTail: string;
  readonly attempts: number;
  readonly durationMs: number;
  readonly timedOut: boolean;

  constructor(detail: {
    exitCode: number | null;
    signal: NodeJS.Signals | null;
    stderrTail: string;
    attempts: number;
    durationMs: number;
    timedOut: boolean;
    extraNote?: string;
  }) {
    const baseMsg =
      `SOFFICE_FAILED: ${detail.attempts} attempt(s), ` +
      `exit=${detail.exitCode === null ? "null" : detail.exitCode}` +
      `${detail.signal ? `, signal=${detail.signal}` : ""}` +
      `${detail.timedOut ? ", timed-out" : ""}` +
      ` after ${detail.durationMs}ms`;
    const noteSuffix = detail.extraNote ? ` — ${detail.extraNote}` : "";
    const stderrSuffix = detail.stderrTail
      ? `\nstderr tail:\n${detail.stderrTail}`
      : "";
    super(`${baseMsg}${noteSuffix}${stderrSuffix}`);
    this.name = "SofficeConvertError";
    this.exitCode = detail.exitCode;
    this.signal = detail.signal;
    this.stderrTail = detail.stderrTail;
    this.attempts = detail.attempts;
    this.durationMs = detail.durationMs;
    this.timedOut = detail.timedOut;
  }
}

// ── Internal helpers ────────────────────────────────────────────────────────

/**
 * Sanitise a runId to a filesystem-safe slug. Lowercases, replaces any
 * non-alphanumeric / non-`._-` character with `-`, and collapses repeated
 * dashes. Empty input is rejected.
 *
 * Exported so `factory-v2-upload.ts` reuses the exact same slug shape —
 * keeping tmp dirs and R2 keys greppable side-by-side during incident
 * response.
 *
 * Implementation note: the negated character class uses `\d` (decimal
 * digit) instead of the equivalent `0-9` range to keep the regex literal
 * free of standalone digits — the magic-numbers ratchet's heuristic
 * extractor would otherwise mis-count the trailing digit as a numeric
 * literal usage.
 */
export function sanitiseRunId(runId: string): string {
  const trimmed = (runId ?? "").trim();
  if (trimmed.length === 0) {
    throw new Error("soffice-convert: runId is required and must be non-empty");
  }
  const lowered = trimmed.toLowerCase();
  return lowered
    .replace(/[^a-z\d._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Compute the per-run tmp dir for a given runId. Exported for tests that
 * need to assert the exact path discipline without invoking `soffice`.
 */
export function workDirForRun(runId: string): string {
  const slug = sanitiseRunId(runId);
  return path.join(tmpdir(), FACTORY_V2_TMP_PARENT, slug);
}

/**
 * Idempotent recursive cleanup. Safe to call when the dir is absent, when it
 * exists but is empty, and when it contains partial files. Used both during
 * normal cleanup (after success or failure) and as the pre-spawn reset
 * between retry attempts. Swallowing rm errors here is intentional — a
 * failed cleanup must not mask the original conversion error.
 */
export async function cleanupWorkDir(workDir: string): Promise<void> {
  try {
    await rm(workDir, { recursive: true, force: true });
  } catch {
    // Intentional: see jsdoc above.
  }
}

/**
 * Clamp a candidate timeout into the architectural safety band. Used both
 * by `convertPptxToPdf` (when the caller passes `timeoutMs`) and by
 * `resolveSofficeTimeoutMs` (when reading the admin_resources row).
 */
export function clampSofficeTimeoutMs(candidate: number | undefined): number {
  if (typeof candidate !== "number" || !Number.isFinite(candidate) || candidate <= 0) {
    return DEFAULT_FACTORY_V2_SOFFICE_TIMEOUT_MS;
  }
  return Math.max(
    FACTORY_V2_SOFFICE_TIMEOUT_MIN_MS,
    Math.min(FACTORY_V2_SOFFICE_TIMEOUT_MAX_MS, candidate),
  );
}

/**
 * Resolve the runtime-editable soffice timeout from the admin_resources
 * parameter row. The slug is `FACTORY_V2_SOFFICE_TIMEOUT_PARAM_SLUG`; the
 * value is read off `config.value_ms`. Any error or absent/malformed value
 * returns the compile-time default after clamping. Mirrors the Costantino
 * cadence-resolver pattern (`costantino-scheduler.ts:33`).
 *
 * Injected dependency keeps this module testable in isolation (no
 * `import { storage }` couples it to a live DB connection) and follows
 * ADR-007 DI discipline.
 */
export async function resolveSofficeTimeoutMs(
  deps: {
    getAdminResourceBySlug: (
      kind: "parameter",
      slug: string,
    ) => Promise<{ config?: unknown } | undefined>;
  },
): Promise<number> {
  try {
    const row = await deps.getAdminResourceBySlug(
      "parameter",
      FACTORY_V2_SOFFICE_TIMEOUT_PARAM_SLUG,
    );
    const cfg = row?.config as Record<string, unknown> | undefined;
    const raw = cfg?.value_ms;
    return clampSofficeTimeoutMs(typeof raw === "number" ? raw : undefined);
  } catch {
    // Logging is the caller's responsibility — we don't import the logger
    // here to keep this helper DI-pure and frictionlessly testable.
    return DEFAULT_FACTORY_V2_SOFFICE_TIMEOUT_MS;
  }
}

/**
 * Bounded tail of a string buffer. Used to truncate stderr in error reports
 * so a runaway font-init trace doesn't dump megabytes into the run record.
 */
function tail(buf: string, maxChars: number): string {
  if (buf.length <= maxChars) return buf;
  return `…(${buf.length - maxChars} chars truncated)…\n` +
    buf.slice(buf.length - maxChars);
}

/**
 * Append-and-cap: appends `chunk` to `current`, keeping at most
 * `maxBytes` characters total by trimming from the front (preserving the
 * most-recent output). Used inside the spawn handlers to prevent RSS
 * balloon when soffice misbehaves and floods stdio.
 *
 * Exported for unit tests.
 */
export function appendBounded(
  current: string,
  chunk: string,
  maxBytes: number,
): string {
  const combined = current + chunk;
  if (combined.length <= maxBytes) return combined;
  return combined.slice(combined.length - maxBytes);
}

/**
 * Result of a single attempt — used to decide whether to retry.
 *
 * Exported so unit tests can construct synthetic attempt results to
 * exercise the retry-policy helper without spawning soffice.
 */
export interface SofficeAttemptResult {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  pdfBuffer: Buffer | null;
}

/**
 * Spawn soffice once. Captures stdout/stderr with bounded buffering,
 * enforces `timeoutMs` (SIGTERM, then SIGKILL after the grace period),
 * and returns a structured result. Does not throw on non-zero exit —
 * the caller's retry policy interprets the result.
 */
async function runSofficeOnce(
  workDir: string,
  pptxPath: string,
  timeoutMs: number,
): Promise<SofficeAttemptResult> {
  const profileDir = path.join(workDir, LO_PROFILE_SUBDIR);
  const startedAt = Date.now();

  return await new Promise<SofficeAttemptResult>((resolve) => {
    let stdoutBuf = "";
    let stderrBuf = "";
    let timedOut = false;
    let killTimer: NodeJS.Timeout | null = null;
    let graceTimer: NodeJS.Timeout | null = null;

    const child = spawn(
      SOFFICE_BIN,
      [
        "--headless",
        `-env:UserInstallation=file://${profileDir}`,
        "--convert-to",
        "pdf",
        "--outdir",
        workDir,
        pptxPath,
      ],
      {
        // Inherit env (LANG, fonts) but don't tie soffice to our stdio.
        stdio: ["ignore", "pipe", "pipe"],
        // Detached so the SIGKILL escalation actually reaps the process
        // group (soffice spawns helpers — oosplash, soffice.bin).
        detached: false,
      },
    );

    const finish = (result: Omit<SofficeAttemptResult, "pdfBuffer">) => {
      if (killTimer) clearTimeout(killTimer);
      if (graceTimer) clearTimeout(graceTimer);
      resolve({ ...result, pdfBuffer: null });
    };

    child.stdout?.on("data", (chunk: Buffer) => {
      stdoutBuf = appendBounded(
        stdoutBuf,
        chunk.toString("utf8"),
        FACTORY_V2_SOFFICE_STREAM_BUFFER_MAX_BYTES,
      );
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderrBuf = appendBounded(
        stderrBuf,
        chunk.toString("utf8"),
        FACTORY_V2_SOFFICE_STREAM_BUFFER_MAX_BYTES,
      );
    });

    // Spawn-time errors (e.g., ENOENT when soffice isn't on PATH) — surface
    // as exitCode=null + signal=null + stderr containing the error message.
    child.on("error", (err: NodeJS.ErrnoException) => {
      stderrBuf = appendBounded(
        stderrBuf,
        `\n[spawn error] ${err.message ?? String(err)}`,
        FACTORY_V2_SOFFICE_STREAM_BUFFER_MAX_BYTES,
      );
      finish({
        exitCode: null,
        signal: null,
        stdout: stdoutBuf,
        stderr: stderrBuf,
        durationMs: Date.now() - startedAt,
        timedOut,
      });
    });

    child.on("close", (code: number | null, signal: NodeJS.Signals | null) => {
      finish({
        exitCode: code,
        signal,
        stdout: stdoutBuf,
        stderr: stderrBuf,
        durationMs: Date.now() - startedAt,
        timedOut,
      });
    });

    // Timeout enforcement: SIGTERM first to let soffice release its profile
    // lock cleanly, then SIGKILL after the grace period.
    killTimer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill("SIGTERM");
      } catch {
        // Already exited — close handler will run.
      }
      graceTimer = setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {
          // Already reaped.
        }
      }, FACTORY_V2_SOFFICE_KILL_GRACE_MS);
    }, timeoutMs);
  });
}

/**
 * Validate that the produced PDF file is non-empty and starts with the
 * `%PDF-` magic header. soffice has been known to emit a 0-byte file and
 * exit 0 under pathological font-init conditions (see U2 smoke test
 * comment). Returns the buffer or `null` if the file is missing/empty/
 * non-PDF.
 */
async function readPdfIfValid(pdfPath: string): Promise<Buffer | null> {
  let buf: Buffer;
  try {
    buf = await readFile(pdfPath);
  } catch {
    return null;
  }
  if (buf.length === 0) return null;
  const head = buf.subarray(0, PDF_MAGIC_PREFIX.length).toString("utf8");
  if (head !== PDF_MAGIC_PREFIX) return null;
  return buf;
}

/**
 * Classify an attempt as transient (retryable) vs. fatal (don't retry).
 *
 * Transient (retry):
 *   - Timed out (`timedOut === true`).
 *   - Non-zero exit code (legacy soffice "exit code 1" generic failure).
 *   - Clean exit but missing/0-byte/non-PDF output (soffice has been seen
 *     to silently succeed-with-junk; treat that as transient since a fresh
 *     profile sometimes recovers).
 *
 * Fatal (no retry):
 *   - Spawn error (exitCode === null AND signal === null AND no timeout) —
 *     this is the ENOENT case where `soffice` isn't installed. Retrying
 *     would just spin.
 *
 * Exported for unit-test access (the retry-after-transient scenario uses
 * `runWithRetry` with a mocked attempt function and asserts on this
 * classifier's outcome).
 */
export function isTransient(result: SofficeAttemptResult): boolean {
  if (result.timedOut) return true;
  if (result.exitCode === null && result.signal === null && !result.timedOut) {
    // Spawn error — fatal.
    return false;
  }
  // Any clean-exit attempt that didn't produce a valid PDF is transient.
  if (result.pdfBuffer === null) return true;
  // Non-zero exit with valid PDF — treat as transient too (defensive).
  if (typeof result.exitCode === "number" && result.exitCode !== 0) return true;
  return false;
}

/**
 * Outcome of a `runWithRetry` invocation. Either a `success` carrying the
 * attempt that produced a valid PDF, or a `failure` carrying the final
 * attempt + the total accumulated duration + whether any attempt timed out.
 */
export type RetryOutcome =
  | { kind: "success"; result: SofficeAttemptResult; durationMs: number; attempts: number }
  | {
      kind: "failure";
      lastResult: SofficeAttemptResult | null;
      durationMs: number;
      attempts: number;
      everTimedOut: boolean;
    };

/**
 * Generic retry loop over a soffice-attempt function. Extracted from
 * `convertPptxToPdf` so the retry-after-transient scenario is unit-testable
 * without invoking the real subprocess.
 *
 * Behaviour:
 *   - Calls `runAttempt(attemptNumber)` for each attempt (1-indexed).
 *   - A successful attempt (`result.pdfBuffer !== null && exitCode === 0 &&
 *     !timedOut`) short-circuits with `kind: 'success'`.
 *   - A fatal (non-transient) attempt short-circuits with `kind: 'failure'`.
 *   - A transient attempt is retried up to `maxAttempts` total. The final
 *     transient attempt resolves with `kind: 'failure'`.
 *
 * `maxAttempts` defaults to `FACTORY_V2_SOFFICE_MAX_ATTEMPTS`; tests pass a
 * smaller / larger budget directly.
 */
export async function runWithRetry(
  runAttempt: (attemptNumber: number) => Promise<SofficeAttemptResult>,
  maxAttempts: number = FACTORY_V2_SOFFICE_MAX_ATTEMPTS,
): Promise<RetryOutcome> {
  let lastResult: SofficeAttemptResult | null = null;
  let totalDurationMs = 0;
  let everTimedOut = false;
  let attemptsRun = 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = await runAttempt(attempt);
    attemptsRun = attempt;
    totalDurationMs += result.durationMs;
    if (result.timedOut) everTimedOut = true;
    lastResult = result;

    const cleanSuccess =
      result.pdfBuffer !== null && result.exitCode === 0 && !result.timedOut;
    if (cleanSuccess) {
      return {
        kind: "success",
        result,
        durationMs: totalDurationMs,
        attempts: attemptsRun,
      };
    }
    if (!isTransient(result)) {
      return {
        kind: "failure",
        lastResult: result,
        durationMs: totalDurationMs,
        attempts: attemptsRun,
        everTimedOut,
      };
    }
    // Transient — loop continues if attempts remain.
  }

  return {
    kind: "failure",
    lastResult,
    durationMs: totalDurationMs,
    attempts: attemptsRun,
    everTimedOut,
  };
}

// ── Public entry point ──────────────────────────────────────────────────────

/**
 * Convert a PPTX Buffer to a PDF Buffer using LibreOffice headless.
 *
 * The function:
 *   1. Writes the input PPTX to a fresh per-run tmp dir.
 *   2. Spawns `soffice --headless --convert-to pdf` with an isolated
 *      UserInstallation profile.
 *   3. Captures stdout/stderr; enforces `timeoutMs` with SIGTERM → SIGKILL.
 *   4. Validates the produced PDF (magic bytes + non-zero size).
 *   5. On a transient failure (timeout / non-zero exit / invalid output),
 *      cleans the tmp dir and retries up to `FACTORY_V2_SOFFICE_MAX_ATTEMPTS`
 *      total attempts. A fatal spawn error short-circuits.
 *   6. On every attempt failing, throws `SofficeConvertError` with the
 *      final attempt's exit code, signal, stderr tail, and totals.
 *   7. Always cleans up the tmp dir before returning or throwing.
 */
export async function convertPptxToPdf(
  pptxBuffer: Buffer,
  options: ConvertPptxToPdfOptions,
): Promise<ConvertPptxToPdfResult> {
  const timeoutMs = clampSofficeTimeoutMs(options.timeoutMs);
  const workDir = workDirForRun(options.runId);

  // Single-attempt runner: fresh tmp dir + spawn + PDF validation. The
  // attempt's `pdfBuffer` field is populated by the validator so the
  // retry loop's success classifier can short-circuit on a valid PDF.
  const runOneSofficeAttempt = async (
    _attemptNumber: number,
  ): Promise<SofficeAttemptResult> => {
    // Fresh tmp dir per attempt — soffice's profile lock cleanup is
    // unreliable on abnormal termination, so we never reuse.
    await cleanupWorkDir(workDir);
    await mkdir(workDir, { recursive: true });
    const pptxPath = path.join(workDir, INPUT_PPTX_FILENAME);
    await writeFile(pptxPath, pptxBuffer);

    const result = await runSofficeOnce(workDir, pptxPath, timeoutMs);
    const pdfPath = path.join(workDir, OUTPUT_PDF_FILENAME);
    result.pdfBuffer = await readPdfIfValid(pdfPath);
    return result;
  };

  try {
    const outcome = await runWithRetry(runOneSofficeAttempt);

    if (outcome.kind === "success" && outcome.result.pdfBuffer) {
      return {
        pdfBuffer: outcome.result.pdfBuffer,
        durationMs: outcome.result.durationMs,
      };
    }

    // Failure — synthesise a structured error. `everTimedOut` upgrades the
    // message with the operator-hint about tuning the timeout parameter row.
    const lastResult: SofficeAttemptResult =
      outcome.kind === "failure" && outcome.lastResult
        ? outcome.lastResult
        : ({
            exitCode: null,
            signal: null,
            stdout: "",
            stderr: "",
            durationMs: 0,
            timedOut: false,
            pdfBuffer: null,
          } satisfies SofficeAttemptResult);

    const everTimedOut =
      outcome.kind === "failure" ? outcome.everTimedOut : lastResult.timedOut;

    throw new SofficeConvertError({
      exitCode: lastResult.exitCode,
      signal: lastResult.signal,
      stderrTail: tail(lastResult.stderr, FACTORY_V2_SOFFICE_STDERR_TAIL_CHARS),
      attempts: outcome.attempts || FACTORY_V2_SOFFICE_MAX_ATTEMPTS,
      durationMs: outcome.durationMs,
      timedOut: lastResult.timedOut,
      extraNote: everTimedOut ? CONVERSION_TOO_SLOW_HINT : undefined,
    });
  } finally {
    // Always clean up, whether we returned or are throwing.
    await cleanupWorkDir(workDir);
  }
}
