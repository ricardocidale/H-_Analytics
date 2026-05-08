import { describe, it, expect } from "vitest";
import { deriveSpecialistPhase, RECENT_RUN_THRESHOLD_MS } from "../routes/admin/specialists/catalog";

const NOW = 1_000_000;
const FRESH = NOW - 5_000;            // 5s ago — within 30s window
const STALE = NOW - RECENT_RUN_THRESHOLD_MS; // exactly at boundary → should be null
const OLDER = NOW - 60_000;           // 60s ago — outside window

describe("deriveSpecialistPhase", () => {
  it("returns 'thinking' when runningCount > 0 (ignores recentRun)", () => {
    expect(deriveSpecialistPhase(2, null, NOW)).toBe("thinking");
    expect(deriveSpecialistPhase(1, { completedAt: new Date(FRESH), status: "completed" }, NOW)).toBe("thinking");
  });

  it("returns null when not running and no recent run", () => {
    expect(deriveSpecialistPhase(0, null, NOW)).toBeNull();
    expect(deriveSpecialistPhase(0, undefined, NOW)).toBeNull();
  });

  it("returns null when completedAt is null (in-progress run with no completion)", () => {
    expect(deriveSpecialistPhase(0, { completedAt: null, status: "completed" }, NOW)).toBeNull();
  });

  it("returns 'complete' for a completed run within the recency window", () => {
    expect(deriveSpecialistPhase(0, { completedAt: new Date(FRESH), status: "completed" }, NOW)).toBe("complete");
  });

  it("returns 'error' for a failed run within the recency window", () => {
    expect(deriveSpecialistPhase(0, { completedAt: new Date(FRESH), status: "failed" }, NOW)).toBe("error");
  });

  it("returns null for any other status within the recency window", () => {
    expect(deriveSpecialistPhase(0, { completedAt: new Date(FRESH), status: "running" }, NOW)).toBeNull();
    expect(deriveSpecialistPhase(0, { completedAt: new Date(FRESH), status: "unknown" }, NOW)).toBeNull();
  });

  it("returns null when ageMs === RECENT_RUN_THRESHOLD_MS (boundary: >= not >)", () => {
    expect(deriveSpecialistPhase(0, { completedAt: new Date(STALE), status: "completed" }, NOW)).toBeNull();
  });

  it("returns null for a completed run outside the recency window", () => {
    expect(deriveSpecialistPhase(0, { completedAt: new Date(OLDER), status: "completed" }, NOW)).toBeNull();
  });

  it("accepts completedAt as an ISO string in addition to Date", () => {
    const completedAt = new Date(FRESH).toISOString();
    expect(deriveSpecialistPhase(0, { completedAt, status: "completed" }, NOW)).toBe("complete");
  });
});
