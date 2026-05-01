/**
 * Task #528 — Unit test for the reconciler-stdout parser used by
 * `script/record-storage-drift-sweep.ts`.
 *
 * Locks the parser against the exact line shapes `script/r2-cutover-reconcile.ts`
 * emits today. If the reconciler ever changes its output format, this test
 * fails first — much better than the admin panel silently going to zeros.
 */
import { describe, it, expect } from "vitest";
import {
  parseStorageDriftSweepLog,
  deriveStorageDriftSweepStatus,
  summariseStorageDriftSweepNotes,
} from "../../script/lib/parse-storage-drift-sweep-log";

const CLEAN_LOG = `
[1/4] Loading legacy mappings...
[2/4] Scanning all text/varchar/jsonb columns for URL refs...
      OK                : 250
      MISSING in R2     : 0
      MISSING media row : 0
      MISSING photo row : 0
      LEGACY host (404 after cutover): 0

[4/4] Done.

ALL CLEAR — every DB-referenced object resolves post-cutover.
`;

const REMEDIATED_LOG = `
[1/4] Loading legacy mappings...
[2/4] Scanning all text/varchar/jsonb columns for URL refs...
      OK                : 240
      MISSING in R2     : 3
      MISSING media row : 0
      MISSING photo row : 0
      LEGACY host (404 after cutover): 4

[REWRITE] Rewriting legacy-host URLs to relative /objects/<key> form...
  rewrote properties.image_url#43
  rewrote properties.image_url#44
  rewrote properties.image_url#45
  SKIPPED (non-rewritable shape) properties.image_url#46: https://gcs.foo/x.jpg
  3 rewritten, 1 skipped (require manual remediation)

[RE-CLASSIFY] Re-scanning post-rewrite so COPY sees the fresh missing-r2 bucket...
      OK                : 240
      MISSING in R2     : 6
      MISSING media row : 0
      MISSING photo row : 0
      LEGACY host (404 after cutover): 1

[COPY] Copying missing keys from legacy Replit bucket to R2...
  copy: properties.image_url#42  /objects/abc.jpg
  5 copied, 1 failed
    FAIL properties.image_url#99 /objects/x.jpg: AccessDenied

[RE-VERIFY] Re-scanning DB + R2 after mutations...
      OK                : 245
      MISSING in R2     : 1
      MISSING media row : 0
      MISSING photo row : 0
      LEGACY host (404 after cutover): 1

[4/4] Done.

2 unresolved reference(s) remain after remediation.
`;

const REWRITE_FAILED_LOG = `
[2/4] Scanning all text/varchar/jsonb columns for URL refs...
      OK                : 100
      MISSING in R2     : 0
      MISSING media row : 0
      MISSING photo row : 0
      LEGACY host (404 after cutover): 2

[REWRITE] Rewriting legacy-host URLs to relative /objects/<key> form...
  FAILED properties.image_url#1: db update failed
  FAILED properties.image_url#2: db update failed
  0 rewritten, 0 skipped (require manual remediation)

[RE-VERIFY] Re-scanning DB + R2 after mutations...
      OK                : 100
      MISSING in R2     : 0
      MISSING media row : 0
      MISSING photo row : 0
      LEGACY host (404 after cutover): 2

[4/4] Done.
`;

describe("parseStorageDriftSweepLog", () => {
  it("parses an all-clear initial scan", () => {
    const c = parseStorageDriftSweepLog(CLEAN_LOG);
    expect(c.rewroteCount).toBe(0);
    expect(c.copiedCount).toBe(0);
    expect(c.skippedCount).toBe(0);
    expect(c.failedCount).toBe(0);
    expect(c.residualCount).toBe(0);
    expect(c.finalBuckets.ok).toBe(250);
  });

  it("parses a multi-pass remediation log and uses the LAST bucket block for residual", () => {
    const c = parseStorageDriftSweepLog(REMEDIATED_LOG);
    expect(c.rewroteCount).toBe(3);
    expect(c.skippedCount).toBe(1);
    expect(c.copiedCount).toBe(5);
    expect(c.failedCount).toBe(1); // from "5 copied, 1 failed"
    // Residual comes from the [RE-VERIFY] pass: 1 + 0 + 0 + 1 = 2.
    expect(c.residualCount).toBe(2);
    expect(c.finalBuckets.missingR2).toBe(1);
    expect(c.finalBuckets.legacyHost).toBe(1);
  });

  it("counts per-row rewrite FAILED lines as failures", () => {
    const c = parseStorageDriftSweepLog(REWRITE_FAILED_LOG);
    expect(c.rewroteCount).toBe(0);
    expect(c.failedCount).toBe(2); // two `  FAILED ` lines from the [REWRITE] pass
    expect(c.residualCount).toBe(2);
  });

  it("returns zeros for an empty log without throwing", () => {
    const c = parseStorageDriftSweepLog("");
    expect(c.rewroteCount).toBe(0);
    expect(c.residualCount).toBe(0);
  });
});

describe("deriveStorageDriftSweepStatus", () => {
  it("ok when exit 0 and no residual", () => {
    const c = parseStorageDriftSweepLog(CLEAN_LOG);
    expect(deriveStorageDriftSweepStatus(0, c)).toBe("ok");
  });

  it("partial when sweep performed mutations and residual remains", () => {
    const c = parseStorageDriftSweepLog(REMEDIATED_LOG);
    expect(deriveStorageDriftSweepStatus(1, c)).toBe("partial");
  });

  it("error when exit non-zero and no mutations performed", () => {
    const c = parseStorageDriftSweepLog("");
    expect(deriveStorageDriftSweepStatus(1, c)).toBe("error");
  });

  it("error when exit non-zero and every attempted rewrite failed (no successful mutations)", () => {
    // All-FAILED rewrite log: failedCount > 0 but rewroteCount + copiedCount == 0.
    // The sweep didn't move the needle, so this is a hard failure to investigate
    // — not a "partial" success.
    const c = parseStorageDriftSweepLog(REWRITE_FAILED_LOG);
    expect(c.rewroteCount).toBe(0);
    expect(c.copiedCount).toBe(0);
    expect(c.failedCount).toBe(2);
    expect(deriveStorageDriftSweepStatus(1, c)).toBe("error");
  });

  it("error when exit non-zero and every legacy URL was skipped as non-rewritable", () => {
    // Skipped lines indicate manual triage required — they do NOT count as
    // successful mutations, so a sweep that only produced skips is still an
    // error from the in-app dashboard's POV.
    const skippedOnlyLog = `
[REWRITE] Rewriting legacy-host URLs to relative /objects/<key> form...
  SKIPPED (non-rewritable shape) properties.image_url#1: https://gcs.foo/x.jpg
  SKIPPED (non-rewritable shape) properties.image_url#2: https://gcs.foo/y.jpg
  0 rewritten, 2 skipped (require manual remediation)
[RE-VERIFY] Re-scanning DB + R2 after mutations...
      OK                : 0
      MISSING in R2     : 0
      MISSING media row : 0
      MISSING photo row : 0
      LEGACY host (404 after cutover): 2
`;
    const c = parseStorageDriftSweepLog(skippedOnlyLog);
    expect(c.skippedCount).toBe(2);
    expect(c.rewroteCount + c.copiedCount).toBe(0);
    expect(deriveStorageDriftSweepStatus(1, c)).toBe("error");
  });
});

describe("summariseStorageDriftSweepNotes", () => {
  it("formats the bucket counts as a single line", () => {
    const c = parseStorageDriftSweepLog(REMEDIATED_LOG);
    expect(summariseStorageDriftSweepNotes(c)).toBe(
      "ok:245 missing-r2:1 missing-media:0 missing-photo:0 legacy-host:1",
    );
  });
});
