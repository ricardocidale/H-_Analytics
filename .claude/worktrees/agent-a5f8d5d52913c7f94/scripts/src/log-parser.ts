/**
 * Pure parsing helpers for record-storage-drift-sweep.ts.
 *
 * Extracted into this module so unit tests can import and exercise the
 * regex-based logic without triggering the DB / pool imports that live in the
 * main script.
 */

// ---------------------------------------------------------------------------
// Counter helpers
// ---------------------------------------------------------------------------

/**
 * Extract a named integer counter, returning the value from the LAST
 * occurrence in the log. Matches lines like:
 *   "  rewrote: 5" / "rewrote=5" / "Rewrote 5 objects"
 * Returns 0 if the label is not found anywhere in the log.
 */
export function parseLastCounter(text: string, label: string): number {
  const pattern = new RegExp(`\\b${label}[:\\s=]+([0-9]+)`, "gi");
  let lastValue = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    lastValue = parseInt(match[1], 10);
  }
  return lastValue;
}

/**
 * Parse the last "Mutations performed" block for the four action counters.
 * Using parseLastCounter ensures we get the post-remediation figures.
 */
export function parseMutationCounters(text: string): {
  rewroteCount: number;
  copiedCount: number;
  skippedCount: number;
  failedCount: number;
} {
  return {
    rewroteCount: parseLastCounter(text, "rewrote"),
    copiedCount: parseLastCounter(text, "copied"),
    skippedCount: parseLastCounter(text, "skipped"),
    failedCount: parseLastCounter(text, "failed"),
  };
}

// ---------------------------------------------------------------------------
// Residual count helper
// ---------------------------------------------------------------------------

/**
 * Parse the LAST bucket-count block for residual unresolved references.
 * Sums MISSING-R2, MISSING-media, MISSING-photo, and LEGACY-host.
 *
 * The reconciler's final [RE-VERIFY] pass is the authoritative residual
 * count, so we isolate the text from the last bucket-header marker onward
 * before summing.
 */
export function parseResidualCount(text: string): number {
  const bucketHeaders = ["\\[RE-VERIFY\\]", "Bucket counts:", "Unresolved references:"];
  let lastHeaderIdx = -1;
  for (const header of bucketHeaders) {
    const pattern = new RegExp(header, "gi");
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      if (match.index > lastHeaderIdx) lastHeaderIdx = match.index;
    }
  }

  const searchText = lastHeaderIdx >= 0 ? text.slice(lastHeaderIdx) : text;

  const buckets = ["MISSING-R2", "MISSING-media", "MISSING-photo", "LEGACY-host"];
  let total = 0;
  for (const bucket of buckets) {
    const escapedBucket = bucket.replace(/-/g, "[-]");
    total += parseLastCounter(searchText, escapedBucket);
  }
  return total;
}

// ---------------------------------------------------------------------------
// Status derivation
// ---------------------------------------------------------------------------

export type StorageDriftSweepStatus = "ok" | "partial" | "error";

/**
 * Derive the health status from schema-documented rules:
 *   ok      — exit 0 AND residual == 0
 *   partial — (exit 0 AND residual > 0) OR
 *             (exit non-zero AND residual > 0 AND mutations > 0)
 *   error   — exit non-zero AND no mutations performed
 */
export function deriveStatus(opts: {
  exitCode: number;
  residualCount: number;
  rewroteCount: number;
  copiedCount: number;
}): StorageDriftSweepStatus {
  const { exitCode, residualCount, rewroteCount, copiedCount } = opts;
  const mutationsPerformed = rewroteCount + copiedCount;

  if (exitCode === 0 && residualCount === 0) {
    return "ok";
  }
  if (exitCode !== 0 && mutationsPerformed === 0) {
    return "error";
  }
  return "partial";
}

// ---------------------------------------------------------------------------
// Notes builder
// ---------------------------------------------------------------------------

/**
 * Build a compact per-bucket summary string for the admin panel.
 * Returns null when there are no residuals.
 */
export function buildNotes(text: string, residualCount: number): string | null {
  if (residualCount === 0) return null;

  const buckets: Record<string, number> = {
    "missing-r2": parseLastCounter(text, "MISSING-R2"),
    "missing-media": parseLastCounter(text, "MISSING-media"),
    "missing-photo": parseLastCounter(text, "MISSING-photo"),
    "legacy-host": parseLastCounter(text, "LEGACY-host"),
  };

  const parts = Object.entries(buckets)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${k}:${v}`);

  return parts.length > 0 ? parts.join(" ") : null;
}
