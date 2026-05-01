import { describe, it, expect } from "vitest";
import {
  parseLastCounter,
  parseMutationCounters,
  parseResidualCount,
  deriveStatus,
  buildNotes,
} from "./log-parser.js";

// ---------------------------------------------------------------------------
// parseLastCounter
// ---------------------------------------------------------------------------

describe("parseLastCounter", () => {
  it("matches colon-separated format (  rewrote: 5)", () => {
    expect(parseLastCounter("  rewrote: 5", "rewrote")).toBe(5);
  });

  it("matches equals-separated format (rewrote=12)", () => {
    expect(parseLastCounter("rewrote=12", "rewrote")).toBe(12);
  });

  it("matches space-separated format (Rewrote 3 objects)", () => {
    expect(parseLastCounter("Rewrote 3 objects", "rewrote")).toBe(3);
  });

  it("returns 0 when label is absent", () => {
    expect(parseLastCounter("no matching label here", "rewrote")).toBe(0);
  });

  it("returns the LAST value when the label appears multiple times", () => {
    const text = "rewrote: 2\nrewrote: 7\nrewrote: 4";
    expect(parseLastCounter(text, "rewrote")).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// parseMutationCounters — all four mutation labels
// ---------------------------------------------------------------------------

describe("parseMutationCounters", () => {
  const sampleLog = `
Mutations performed:
  rewrote: 10
  copied: 3
  skipped: 50
  failed: 1
`.trim();

  it("parses rewrote count", () => {
    expect(parseMutationCounters(sampleLog).rewroteCount).toBe(10);
  });

  it("parses copied count", () => {
    expect(parseMutationCounters(sampleLog).copiedCount).toBe(3);
  });

  it("parses skipped count", () => {
    expect(parseMutationCounters(sampleLog).skippedCount).toBe(50);
  });

  it("parses failed count", () => {
    expect(parseMutationCounters(sampleLog).failedCount).toBe(1);
  });

  it("returns all zeros on empty log", () => {
    const result = parseMutationCounters("");
    expect(result).toEqual({
      rewroteCount: 0,
      copiedCount: 0,
      skippedCount: 0,
      failedCount: 0,
    });
  });

  it("picks the LAST block when the reconciler emits multiple passes", () => {
    const multiPassLog = `
rewrote: 2
copied: 1
skipped: 10
failed: 0
[RE-VERIFY]
rewrote: 0
copied: 0
skipped: 55
failed: 0
`.trim();
    const result = parseMutationCounters(multiPassLog);
    expect(result.rewroteCount).toBe(0);
    expect(result.copiedCount).toBe(0);
    expect(result.skippedCount).toBe(55);
    expect(result.failedCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// parseResidualCount
// ---------------------------------------------------------------------------

describe("parseResidualCount", () => {
  it("sums all four bucket types", () => {
    const log = `
Bucket counts:
  MISSING-R2: 4
  MISSING-media: 2
  MISSING-photo: 1
  LEGACY-host: 3
`.trim();
    expect(parseResidualCount(log)).toBe(10);
  });

  it("returns 0 when no bucket labels are present", () => {
    expect(parseResidualCount("everything looks fine")).toBe(0);
  });

  it("reads only from the LAST [RE-VERIFY] block", () => {
    const log = `
[RE-VERIFY]
MISSING-R2: 5
MISSING-media: 3
[RE-VERIFY]
MISSING-R2: 1
MISSING-media: 0
MISSING-photo: 0
LEGACY-host: 0
`.trim();
    expect(parseResidualCount(log)).toBe(1);
  });

  it("reads only from the LAST 'Bucket counts:' block", () => {
    const log = `
Bucket counts:
  MISSING-R2: 10
Bucket counts:
  MISSING-R2: 2
  MISSING-media: 0
  MISSING-photo: 0
  LEGACY-host: 0
`.trim();
    expect(parseResidualCount(log)).toBe(2);
  });

  it("reads only from the LAST 'Unresolved references:' block", () => {
    const log = `
Unresolved references:
  MISSING-R2: 8
Unresolved references:
  MISSING-R2: 0
  LEGACY-host: 1
`.trim();
    expect(parseResidualCount(log)).toBe(1);
  });

  it("handles a log with only some bucket types present", () => {
    const log = `
[RE-VERIFY]
MISSING-R2: 0
LEGACY-host: 6
`.trim();
    expect(parseResidualCount(log)).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// deriveStatus — all three outcomes and edge cases
// ---------------------------------------------------------------------------

describe("deriveStatus", () => {
  it('returns "ok" when exit 0 and no residuals', () => {
    expect(
      deriveStatus({ exitCode: 0, residualCount: 0, rewroteCount: 5, copiedCount: 0 }),
    ).toBe("ok");
  });

  it('returns "ok" when exit 0, no residuals, and no mutations', () => {
    expect(
      deriveStatus({ exitCode: 0, residualCount: 0, rewroteCount: 0, copiedCount: 0 }),
    ).toBe("ok");
  });

  it('returns "partial" when exit 0 but there are residuals (edge case)', () => {
    expect(
      deriveStatus({ exitCode: 0, residualCount: 3, rewroteCount: 0, copiedCount: 0 }),
    ).toBe("partial");
  });

  it('returns "partial" when exit non-zero but mutations were performed', () => {
    expect(
      deriveStatus({ exitCode: 1, residualCount: 2, rewroteCount: 3, copiedCount: 0 }),
    ).toBe("partial");
  });

  it('returns "partial" when exit non-zero with only copied mutations', () => {
    expect(
      deriveStatus({ exitCode: 1, residualCount: 1, rewroteCount: 0, copiedCount: 2 }),
    ).toBe("partial");
  });

  it('returns "error" when exit non-zero and no mutations were performed', () => {
    expect(
      deriveStatus({ exitCode: 1, residualCount: 0, rewroteCount: 0, copiedCount: 0 }),
    ).toBe("error");
  });

  it('returns "error" when exit non-zero with residuals but no mutations', () => {
    expect(
      deriveStatus({ exitCode: 2, residualCount: 5, rewroteCount: 0, copiedCount: 0 }),
    ).toBe("error");
  });
});

// ---------------------------------------------------------------------------
// buildNotes — notes builder
// ---------------------------------------------------------------------------

describe("buildNotes", () => {
  it("returns null when residualCount is 0", () => {
    const log = "MISSING-R2: 3\nMISSING-media: 2";
    expect(buildNotes(log, 0)).toBeNull();
  });

  it("returns a compact summary for a single non-zero bucket", () => {
    const log = `
[RE-VERIFY]
MISSING-R2: 7
MISSING-media: 0
MISSING-photo: 0
LEGACY-host: 0
`.trim();
    expect(buildNotes(log, 7)).toBe("missing-r2:7");
  });

  it("returns a space-separated summary for multiple non-zero buckets", () => {
    const log = `
[RE-VERIFY]
MISSING-R2: 4
MISSING-media: 2
MISSING-photo: 1
LEGACY-host: 3
`.trim();
    expect(buildNotes(log, 10)).toBe("missing-r2:4 missing-media:2 missing-photo:1 legacy-host:3");
  });

  it("omits zero-valued buckets from the notes string", () => {
    const log = `
[RE-VERIFY]
MISSING-R2: 0
MISSING-media: 5
MISSING-photo: 0
LEGACY-host: 0
`.trim();
    expect(buildNotes(log, 5)).toBe("missing-media:5");
  });

  it("returns null when residualCount > 0 but all parsed bucket values are 0 (defensive)", () => {
    expect(buildNotes("no bucket labels here", 1)).toBeNull();
  });
});
