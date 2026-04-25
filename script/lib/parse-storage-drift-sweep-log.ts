/**
 * Task #528 — Parse the `r2-cutover-reconcile.ts` stdout into the headline
 * counts the admin Observability panel needs.
 *
 * The reconciler's output is line-oriented. We pull two kinds of signal:
 *
 *   1. Per-action mutation totals from the [REWRITE] / [COPY] passes:
 *        "  N rewritten, M skipped (require manual remediation)"
 *        "  N copied, M failed"
 *      Plus per-row "  FAILED ..." lines for rewrite failures (the
 *      copy-pass failures are already in the totals line).
 *
 *   2. Final residual bucket counts from the LAST occurrence of the
 *      bucket-count block (which is `[RE-VERIFY]` if any mutation ran,
 *      else the initial scan):
 *        "      OK                : N"
 *        "      MISSING in R2     : N"
 *        "      MISSING media row : N"
 *        "      MISSING photo row : N"
 *        "      LEGACY host (404 after cutover): N"
 *
 * Residual = sum of every bucket EXCEPT OK in that final block.
 *
 * Pure-function module, no I/O — keeps it trivially unit-testable in
 * `tests/server/storage-drift-sweep-parser.test.ts`.
 */

export interface StorageDriftSweepCounts {
  rewroteCount: number;
  copiedCount: number;
  skippedCount: number;
  failedCount: number;
  residualCount: number;
  /** Per-bucket breakdown from the final [RE-VERIFY] (or initial scan if no mutations). */
  finalBuckets: {
    ok: number;
    missingR2: number;
    missingMedia: number;
    missingPhoto: number;
    legacyHost: number;
  };
}

const REWRITTEN_TOTAL_RE = /^\s+(\d+)\s+rewritten,\s+(\d+)\s+skipped/;
const COPIED_TOTAL_RE = /^\s+(\d+)\s+copied,\s+(\d+)\s+failed/;
const REWRITE_FAIL_RE = /^\s{2}FAILED\s/;

const BUCKET_OK_RE = /^\s+OK\s*:\s*(\d+)/;
const BUCKET_MISSING_R2_RE = /^\s+MISSING in R2\s*:\s*(\d+)/;
const BUCKET_MISSING_MEDIA_RE = /^\s+MISSING media row\s*:\s*(\d+)/;
const BUCKET_MISSING_PHOTO_RE = /^\s+MISSING photo row\s*:\s*(\d+)/;
const BUCKET_LEGACY_RE = /^\s+LEGACY host[^:]*:\s*(\d+)/;

export function parseStorageDriftSweepLog(stdout: string): StorageDriftSweepCounts {
  let rewroteCount = 0;
  let copiedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  // Track the most-recent value seen for each bucket. The reconciler emits
  // 1-3 bucket blocks per run (initial scan, optional [RE-CLASSIFY], optional
  // [RE-VERIFY]); the LAST value wins so the residual reflects the post-
  // remediation state, which is what the operator needs to triage on.
  const finalBuckets = {
    ok: 0,
    missingR2: 0,
    missingMedia: 0,
    missingPhoto: 0,
    legacyHost: 0,
  };

  for (const rawLine of stdout.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+$/, "");
    if (!line) continue;

    // Action totals — these fire once per remediation pass. Sum across
    // passes defensively, even though a single invocation only does one
    // [REWRITE] and one [COPY] today.
    let m = REWRITTEN_TOTAL_RE.exec(line);
    if (m) {
      rewroteCount += Number(m[1]);
      skippedCount += Number(m[2]);
      continue;
    }
    m = COPIED_TOTAL_RE.exec(line);
    if (m) {
      copiedCount += Number(m[1]);
      failedCount += Number(m[2]);
      continue;
    }
    // Per-row rewrite failure — copy failures are already in the total
    // above, but rewrite failures are only emitted as `  FAILED <ref>` lines.
    if (REWRITE_FAIL_RE.test(line)) {
      failedCount += 1;
      continue;
    }

    // Bucket counts — last write wins.
    m = BUCKET_OK_RE.exec(line);
    if (m) {
      finalBuckets.ok = Number(m[1]);
      continue;
    }
    m = BUCKET_MISSING_R2_RE.exec(line);
    if (m) {
      finalBuckets.missingR2 = Number(m[1]);
      continue;
    }
    m = BUCKET_MISSING_MEDIA_RE.exec(line);
    if (m) {
      finalBuckets.missingMedia = Number(m[1]);
      continue;
    }
    m = BUCKET_MISSING_PHOTO_RE.exec(line);
    if (m) {
      finalBuckets.missingPhoto = Number(m[1]);
      continue;
    }
    m = BUCKET_LEGACY_RE.exec(line);
    if (m) {
      finalBuckets.legacyHost = Number(m[1]);
      continue;
    }
  }

  const residualCount =
    finalBuckets.missingR2 +
    finalBuckets.missingMedia +
    finalBuckets.missingPhoto +
    finalBuckets.legacyHost;

  return {
    rewroteCount,
    copiedCount,
    skippedCount,
    failedCount,
    residualCount,
    finalBuckets,
  };
}

/**
 * Derive the health verdict from exit code + parsed counts. Centralised so
 * the recording script and any future tests agree on the rule.
 *
 *   • ok      — exit 0 AND residual == 0
 *   • partial — sweep ran but didn't reach a clean state, AND it
 *               *succeeded* at remediating something (rewroteCount or
 *               copiedCount > 0). This is the normal "swept some routine
 *               drift, residual needs manual triage" outcome.
 *   • error   — exit non-zero AND no successful mutations (rewroteCount
 *               and copiedCount both zero). The sweep didn't move the
 *               needle — either the reconciler itself failed before doing
 *               useful work, or every attempted remediation failed
 *               (FAILED rewrites, copy errors, all-skipped non-rewritable
 *               shapes). Treat as a hard failure to investigate; "skipped"
 *               and "failed" do NOT count as successful mutations.
 */
export function deriveStorageDriftSweepStatus(
  exitCode: number,
  counts: StorageDriftSweepCounts,
): "ok" | "partial" | "error" {
  if (exitCode === 0 && counts.residualCount === 0) return "ok";
  const successfulMutations = counts.rewroteCount + counts.copiedCount > 0;
  if (exitCode !== 0 && !successfulMutations) return "error";
  return "partial";
}

/**
 * Build the short notes string surfaced in the admin panel. Format mirrors
 * the GitHub job summary's bucket block but condensed to one line.
 */
export function summariseStorageDriftSweepNotes(counts: StorageDriftSweepCounts): string {
  const b = counts.finalBuckets;
  return `ok:${b.ok} missing-r2:${b.missingR2} missing-media:${b.missingMedia} missing-photo:${b.missingPhoto} legacy-host:${b.legacyHost}`;
}
