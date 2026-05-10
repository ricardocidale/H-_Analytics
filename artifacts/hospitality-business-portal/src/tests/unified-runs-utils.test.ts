/**
 * Task #1346 — Unit tests for Runs page helper functions
 *
 * Layer 1: Pure helpers from unified-runs-utils.ts
 *   formatRelativeTime, formatAbsoluteTime, formatDuration,
 *   normalizeStatus, statusVariant, statusLabel, isActiveRun, withinDateRange
 *
 * Layer 2: useUnifiedRuns aggregation logic
 *   The useMemo body inside useUnifiedRuns is a pure data-mapping function
 *   given (irisStatus, slideRuns, schedulerRuns). We replicate it here as
 *   a standalone helper (same pattern as analyst-refresh-autocommit.test.ts)
 *   so the core mapping contract can be verified without React rendering.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  formatRelativeTime,
  formatAbsoluteTime,
  formatDuration,
  normalizeStatus,
  statusVariant,
  statusLabel,
  isActiveRun,
  withinDateRange,
  MS_PER_MINUTE,
  MS_PER_HOUR,
  MS_PER_DAY,
  ANALYST_SCHEDULER_KEYS,
  IRIS_SCHEDULER_KEYS,
} from "@/pages/intelligence/unified-runs-utils";
import { aggregateUnifiedRuns } from "@/pages/intelligence/unified-runs-hooks";
import { AGENTS, ORCHESTRATORS } from "@/lib/agent-taxonomy";
import type {
  UnifiedRunStatus,
  IrisStatus,
  SlideFactoryRun,
  SchedulerRunRow,
  SlideAgentResultFE,
} from "@/pages/intelligence/unified-runs-types";

// normalizeStatus and isActiveRun are imported above and exercised via the
// pure-helper tests (Layer 1). They are also called internally by
// aggregateUnifiedRuns, which the Layer 2 tests exercise end-to-end.

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Build an ISO string that is `offsetMs` milliseconds before `Date.now()`. */
function isoAgo(offsetMs: number): string {
  return new Date(Date.now() - offsetMs).toISOString();
}

// Fixed epoch used across time-sensitive tests so `Date.now()` is stable.
const FIXED_NOW = new Date("2025-06-01T12:00:00.000Z").getTime();

// ── Layer 1: formatRelativeTime ──────────────────────────────────────────────

describe("formatRelativeTime()", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns '—' for null input", () => {
    expect(formatRelativeTime(null)).toBe("—");
  });

  it("returns 'just now' for a future timestamp", () => {
    const future = new Date(FIXED_NOW + 5_000).toISOString();
    expect(formatRelativeTime(future)).toBe("just now");
  });

  it("returns '< 1 min ago' for a 30-second-old timestamp", () => {
    const ts = new Date(FIXED_NOW - 30_000).toISOString();
    expect(formatRelativeTime(ts)).toBe("< 1 min ago");
  });

  it("returns '< 1 min ago' at the boundary (59 999 ms)", () => {
    const ts = new Date(FIXED_NOW - (MS_PER_MINUTE - 1)).toISOString();
    expect(formatRelativeTime(ts)).toBe("< 1 min ago");
  });

  it("returns '1 min ago' at exactly 1 minute", () => {
    const ts = new Date(FIXED_NOW - MS_PER_MINUTE).toISOString();
    expect(formatRelativeTime(ts)).toBe("1 min ago");
  });

  it("returns '45 min ago' for a 45-minute-old timestamp", () => {
    const ts = new Date(FIXED_NOW - 45 * MS_PER_MINUTE).toISOString();
    expect(formatRelativeTime(ts)).toBe("45 min ago");
  });

  it("returns '1h ago' at exactly 1 hour", () => {
    const ts = new Date(FIXED_NOW - MS_PER_HOUR).toISOString();
    expect(formatRelativeTime(ts)).toBe("1h ago");
  });

  it("returns '5h ago' for a 5-hour-old timestamp", () => {
    const ts = new Date(FIXED_NOW - 5 * MS_PER_HOUR).toISOString();
    expect(formatRelativeTime(ts)).toBe("5h ago");
  });

  it("returns '1d ago' at exactly 1 day", () => {
    const ts = new Date(FIXED_NOW - MS_PER_DAY).toISOString();
    expect(formatRelativeTime(ts)).toBe("1d ago");
  });

  it("returns '7d ago' for a 7-day-old timestamp", () => {
    const ts = new Date(FIXED_NOW - 7 * MS_PER_DAY).toISOString();
    expect(formatRelativeTime(ts)).toBe("7d ago");
  });

  it("returns '30d ago' for a 30-day-old timestamp", () => {
    const ts = new Date(FIXED_NOW - 30 * MS_PER_DAY).toISOString();
    expect(formatRelativeTime(ts)).toBe("30d ago");
  });
});

// ── Layer 1: formatAbsoluteTime ──────────────────────────────────────────────

describe("formatAbsoluteTime()", () => {
  it("returns '—' for null input", () => {
    expect(formatAbsoluteTime(null)).toBe("—");
  });

  it("returns a non-empty string for a valid ISO timestamp", () => {
    const result = formatAbsoluteTime("2025-06-01T12:00:00.000Z");
    expect(result).not.toBe("—");
    expect(result.length).toBeGreaterThan(0);
  });

  it("includes both date and time portions (space-separated)", () => {
    const result = formatAbsoluteTime("2025-06-01T12:00:00.000Z");
    expect(result).toContain(" ");
  });
});

// ── Layer 1: formatDuration ──────────────────────────────────────────────────

describe("formatDuration()", () => {
  it("returns '—' for null input", () => {
    expect(formatDuration(null)).toBe("—");
  });

  it("returns milliseconds for values under 1 second", () => {
    expect(formatDuration(0)).toBe("0ms");
    expect(formatDuration(500)).toBe("500ms");
    expect(formatDuration(999)).toBe("999ms");
  });

  it("returns seconds (1 decimal) for values between 1 s and 60 s", () => {
    expect(formatDuration(1_000)).toBe("1.0s");
    expect(formatDuration(1_500)).toBe("1.5s");
    expect(formatDuration(30_000)).toBe("30.0s");
    expect(formatDuration(59_999)).toBe("60.0s");
  });

  it("returns 'm Ns' for values of 1 minute or more", () => {
    expect(formatDuration(60_000)).toBe("1m 0s");
    expect(formatDuration(90_000)).toBe("1m 30s");
    expect(formatDuration(125_000)).toBe("2m 5s");
    expect(formatDuration(3_600_000)).toBe("60m 0s");
  });

  it("handles the exact boundary between seconds and minutes", () => {
    // 59 999ms → seconds; 60 000ms → minutes
    expect(formatDuration(59_999)).toMatch(/s$/);
    expect(formatDuration(60_000)).toContain("m");
  });
});

// ── Layer 1: normalizeStatus ─────────────────────────────────────────────────

describe("normalizeStatus()", () => {
  const knownStatuses: Array<[string, UnifiedRunStatus]> = [
    ["running", "running"],
    ["completed", "completed"],
    ["complete", "complete"],
    ["error", "error"],
    ["new", "new"],
    ["brief_ready", "brief_ready"],
    ["ingesting", "ingesting"],
    ["ingested", "ingested"],
    ["drafting", "drafting"],
    ["draft_review", "draft_review"],
    ["building", "building"],
    ["ok", "completed"],
    ["warn", "completed"],
  ];

  it.each(knownStatuses)(
    "maps '%s' to '%s'",
    (raw, expected) => {
      expect(normalizeStatus(raw)).toBe(expected);
    },
  );

  it("maps unknown strings to 'pending'", () => {
    expect(normalizeStatus("unknown_value")).toBe("pending");
    expect(normalizeStatus("")).toBe("pending");
    expect(normalizeStatus("RUNNING")).toBe("pending"); // case-sensitive
  });

  it("'ok' and 'warn' both normalize to 'completed' (scheduler row aliases)", () => {
    expect(normalizeStatus("ok")).toBe("completed");
    expect(normalizeStatus("warn")).toBe("completed");
  });
});

// ── Layer 1: statusVariant ───────────────────────────────────────────────────

describe("statusVariant()", () => {
  it("returns 'default' for 'completed'", () => {
    expect(statusVariant("completed")).toBe("default");
  });

  it("returns 'default' for 'complete'", () => {
    expect(statusVariant("complete")).toBe("default");
  });

  it("returns 'destructive' for 'error'", () => {
    expect(statusVariant("error")).toBe("destructive");
  });

  it("returns 'outline' for all in-progress statuses", () => {
    const inProgress: UnifiedRunStatus[] = ["running", "building", "drafting", "ingesting"];
    for (const s of inProgress) {
      expect(statusVariant(s)).toBe("outline");
    }
  });

  it("returns 'secondary' for everything else (pending, new, brief_ready, ingested, draft_review)", () => {
    const secondary: UnifiedRunStatus[] = [
      "pending", "new", "brief_ready", "ingested", "draft_review",
    ];
    for (const s of secondary) {
      expect(statusVariant(s)).toBe("secondary");
    }
  });
});

// ── Layer 1: statusLabel ─────────────────────────────────────────────────────

describe("statusLabel()", () => {
  const expectedLabels: Array<[UnifiedRunStatus, string]> = [
    ["running", "Running"],
    ["completed", "Completed"],
    ["complete", "Complete"],
    ["error", "Error"],
    ["pending", "Pending"],
    ["new", "New"],
    ["brief_ready", "Brief Ready"],
    ["ingesting", "Ingesting"],
    ["ingested", "Ingested"],
    ["drafting", "Drafting"],
    ["draft_review", "Draft Review"],
    ["building", "Building"],
  ];

  it.each(expectedLabels)(
    "returns '%s' for status '%s'",
    (status, label) => {
      expect(statusLabel(status)).toBe(label);
    },
  );

  it("covers every member of UnifiedRunStatus (no missing entries)", () => {
    const allStatuses: UnifiedRunStatus[] = [
      "running", "completed", "complete", "error", "pending",
      "new", "brief_ready", "ingesting", "ingested",
      "drafting", "draft_review", "building",
    ];
    for (const s of allStatuses) {
      const label = statusLabel(s);
      expect(label).toBeTruthy();
      expect(typeof label).toBe("string");
    }
  });
});

// ── Layer 1: isActiveRun ─────────────────────────────────────────────────────

describe("isActiveRun()", () => {
  it("returns true for 'running'", () => expect(isActiveRun("running")).toBe(true));
  it("returns true for 'building'", () => expect(isActiveRun("building")).toBe(true));
  it("returns true for 'drafting'", () => expect(isActiveRun("drafting")).toBe(true));
  it("returns true for 'ingesting'", () => expect(isActiveRun("ingesting")).toBe(true));

  it("returns false for terminal statuses", () => {
    const terminal: UnifiedRunStatus[] = [
      "completed", "complete", "error", "pending",
    ];
    for (const s of terminal) {
      expect(isActiveRun(s)).toBe(false);
    }
  });

  it("returns false for staging/queued statuses", () => {
    const staging: UnifiedRunStatus[] = [
      "new", "brief_ready", "ingested", "draft_review",
    ];
    for (const s of staging) {
      expect(isActiveRun(s)).toBe(false);
    }
  });
});

// ── Layer 1: withinDateRange ─────────────────────────────────────────────────

describe("withinDateRange()", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("range = 'all'", () => {
    it("always returns true regardless of timestamp", () => {
      expect(withinDateRange(isoAgo(365 * MS_PER_DAY), "all")).toBe(true);
      expect(withinDateRange(null, "all")).toBe(true);
    });
  });

  describe("null timestamp", () => {
    it("returns true for null (treated as always within range)", () => {
      expect(withinDateRange(null, "7d")).toBe(true);
      expect(withinDateRange(null, "30d")).toBe(true);
    });
  });

  describe("range = '7d'", () => {
    it("returns true for a timestamp 1 day ago", () => {
      expect(withinDateRange(isoAgo(MS_PER_DAY), "7d")).toBe(true);
    });

    it("returns true for a timestamp exactly 7 days ago", () => {
      expect(withinDateRange(isoAgo(7 * MS_PER_DAY), "7d")).toBe(true);
    });

    it("returns false for a timestamp 8 days ago", () => {
      expect(withinDateRange(isoAgo(8 * MS_PER_DAY), "7d")).toBe(false);
    });

    it("returns false for a timestamp 30 days ago", () => {
      expect(withinDateRange(isoAgo(30 * MS_PER_DAY), "7d")).toBe(false);
    });
  });

  describe("range = '30d'", () => {
    it("returns true for a timestamp 1 day ago", () => {
      expect(withinDateRange(isoAgo(MS_PER_DAY), "30d")).toBe(true);
    });

    it("returns true for a timestamp exactly 30 days ago", () => {
      expect(withinDateRange(isoAgo(30 * MS_PER_DAY), "30d")).toBe(true);
    });

    it("returns false for a timestamp 31 days ago", () => {
      expect(withinDateRange(isoAgo(31 * MS_PER_DAY), "30d")).toBe(false);
    });

    it("returns true for a timestamp 8 days ago (within 30d but outside 7d)", () => {
      expect(withinDateRange(isoAgo(8 * MS_PER_DAY), "30d")).toBe(true);
    });
  });
});

// ── Layer 2: aggregateUnifiedRuns (production aggregation from unified-runs-hooks.ts) ──
//
// aggregateUnifiedRuns() is the exported pure function extracted from the
// useMemo body of useUnifiedRuns. Testing it directly ensures that regressions
// in the real production implementation are caught — not a copy of it.

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeIrisStatus(overrides: Partial<IrisStatus["lastRun"]> = {}): IrisStatus {
  return {
    gapsCount: 0,
    lastRun: {
      id: 1,
      trigger: "manual",
      status: "completed",
      modelUsed: "gpt-4o",
      chunksIndexed: 42,
      errorsEncountered: 0,
      durationMs: 3_000,
      runAt: "2025-06-01T10:00:00.000Z",
      healthSummary: null,
      ...overrides,
    },
  };
}

function makeSlideRun(overrides: Partial<SlideFactoryRun> = {}): SlideFactoryRun {
  return {
    id: 10,
    status: "complete",
    briefFilename: "brief.pdf",
    agentResults: null,
    startedAt: "2025-06-01T09:00:00.000Z",
    completedAt: "2025-06-01T09:05:00.000Z",
    createdAt: "2025-06-01T08:59:00.000Z",
    updatedAt: "2025-06-01T09:05:00.000Z",
    ...overrides,
  };
}

function makeSchedulerRow(overrides: Partial<SchedulerRunRow> = {}): SchedulerRunRow {
  return {
    schedulerKey: "research-workflows",
    schedulerLabel: "Research Workflows",
    lastRunAt: "2025-06-01T08:00:00.000Z",
    status: "ok",
    durationMs: 5_000,
    notes: null,
    recentRuns: [],
    ...overrides,
  };
}

// ── Iris mapping tests ────────────────────────────────────────────────────────

describe("aggregateUnifiedRuns() — iris run mapping", () => {
  it("produces no runs when irisStatus.lastRun is null", () => {
    const runs = aggregateUnifiedRuns({ lastRun: null, gapsCount: 0 }, [], []);
    expect(runs).toHaveLength(0);
  });

  it("produces no runs when irisStatus is undefined", () => {
    const runs = aggregateUnifiedRuns(undefined, [], []);
    expect(runs).toHaveLength(0);
  });

  it("maps a completed iris run to a UnifiedRun with type='iris'", () => {
    const runs = aggregateUnifiedRuns(makeIrisStatus(), [], []);
    expect(runs).toHaveLength(1);
    const r = runs[0];
    expect(r.type).toBe("iris");
    expect(r.id).toBe("iris-1");
  });

  it("uses AGENTS.iris.humanName and role", () => {
    const runs = aggregateUnifiedRuns(makeIrisStatus(), [], []);
    expect(runs[0].agentName).toBe(AGENTS.iris.humanName);
    expect(runs[0].agentRole).toBe(AGENTS.iris.role);
  });

  it("normalizes the status via normalizeStatus()", () => {
    const runs = aggregateUnifiedRuns(makeIrisStatus({ status: "running" }), [], []);
    expect(runs[0].status).toBe("running");
  });

  it("sets completedAt to runAt when status is completed", () => {
    const runAt = "2025-06-01T10:00:00.000Z";
    const runs = aggregateUnifiedRuns(makeIrisStatus({ status: "completed", runAt }), [], []);
    expect(runs[0].completedAt).toBe(runAt);
  });

  it("sets completedAt to null when status is not completed", () => {
    const runs = aggregateUnifiedRuns(makeIrisStatus({ status: "running" }), [], []);
    expect(runs[0].completedAt).toBeNull();
  });

  it("populates meta with chunksIndexed, errorsEncountered, trigger, modelUsed", () => {
    const runs = aggregateUnifiedRuns(
      makeIrisStatus({ chunksIndexed: 99, errorsEncountered: 2, trigger: "scheduled", modelUsed: "gpt-4o" }),
      [],
      [],
    );
    expect(runs[0].meta?.chunksIndexed).toBe(99);
    expect(runs[0].meta?.errorsEncountered).toBe(2);
    expect(runs[0].meta?.trigger).toBe("scheduled");
    expect(runs[0].meta?.modelUsed).toBe("gpt-4o");
  });
});

// ── Slide Factory mapping tests ───────────────────────────────────────────────

describe("aggregateUnifiedRuns() — slide factory run mapping", () => {
  it("produces no slide runs for an empty array", () => {
    const runs = aggregateUnifiedRuns(undefined, [], []);
    expect(runs).toHaveLength(0);
  });

  it("maps a complete slide run to type='slide'", () => {
    const runs = aggregateUnifiedRuns(undefined, [makeSlideRun()], []);
    expect(runs[0].type).toBe("slide");
  });

  it("uses ORCHESTRATORS.marco.humanName and role", () => {
    const runs = aggregateUnifiedRuns(undefined, [makeSlideRun()], []);
    expect(runs[0].agentName).toBe(ORCHESTRATORS.marco.humanName);
    expect(runs[0].agentRole).toBe(ORCHESTRATORS.marco.role);
  });

  it("sets id to 'slide-<run.id>'", () => {
    const runs = aggregateUnifiedRuns(undefined, [makeSlideRun({ id: 42 })], []);
    expect(runs[0].id).toBe("slide-42");
  });

  it("sets slideFactoryRunId to the raw numeric id", () => {
    const runs = aggregateUnifiedRuns(undefined, [makeSlideRun({ id: 7 })], []);
    expect(runs[0].slideFactoryRunId).toBe(7);
  });

  it("calculates durationMs from startedAt and completedAt", () => {
    const run = makeSlideRun({
      startedAt: "2025-06-01T09:00:00.000Z",
      completedAt: "2025-06-01T09:05:00.000Z",
    });
    const runs = aggregateUnifiedRuns(undefined, [run], []);
    expect(runs[0].durationMs).toBe(5 * 60_000); // 5 minutes in ms
  });

  it("sets durationMs to null when completedAt is null", () => {
    const run = makeSlideRun({ completedAt: null });
    const runs = aggregateUnifiedRuns(undefined, [run], []);
    expect(runs[0].durationMs).toBeNull();
  });

  it("uses createdAt as startedAt fallback when startedAt is null", () => {
    const run = makeSlideRun({ startedAt: null, createdAt: "2025-06-01T08:59:00.000Z" });
    const runs = aggregateUnifiedRuns(undefined, [run], []);
    expect(runs[0].startedAt).toBe("2025-06-01T08:59:00.000Z");
  });

  it("populates meta.brief from briefFilename", () => {
    const run = makeSlideRun({ briefFilename: "deck-brief.pdf" });
    const runs = aggregateUnifiedRuns(undefined, [run], []);
    expect(runs[0].meta?.brief).toBe("deck-brief.pdf");
  });

  it("sets meta to undefined when briefFilename is null", () => {
    const run = makeSlideRun({ briefFilename: null });
    const runs = aggregateUnifiedRuns(undefined, [run], []);
    expect(runs[0].meta).toBeUndefined();
  });

  it("maps agentResults with 'rejected' status to failedSlides sorted by slide num", () => {
    const agentResults: Record<string, SlideAgentResultFE> = {
      slide3: { status: "rejected", pixelDiffPct: null, mayaVerdict: null, mayaNotes: null, approvedAt: null, errorMessage: "render failed" },
      slide1: { status: "rejected", pixelDiffPct: null, mayaVerdict: null, mayaNotes: null, approvedAt: null, errorMessage: "timeout" },
      slide2: { status: "approved", pixelDiffPct: 0.1, mayaVerdict: "ok", mayaNotes: null, approvedAt: "2025-06-01T09:02:00.000Z", errorMessage: null },
    };
    const run = makeSlideRun({ agentResults });
    const runs = aggregateUnifiedRuns(undefined, [run], []);
    const failed = runs[0].failedSlides!;
    expect(failed).toHaveLength(2);
    expect(failed[0].num).toBe(1);
    expect(failed[0].reason).toBe("timeout");
    expect(failed[1].num).toBe(3);
    expect(failed[1].reason).toBe("render failed");
  });

  it("sets failedSlides to undefined when no slides are rejected", () => {
    const agentResults: Record<string, SlideAgentResultFE> = {
      slide1: { status: "approved", pixelDiffPct: null, mayaVerdict: "ok", mayaNotes: null, approvedAt: null, errorMessage: null },
    };
    const run = makeSlideRun({ agentResults });
    const runs = aggregateUnifiedRuns(undefined, [run], []);
    expect(runs[0].failedSlides).toBeUndefined();
  });

  it("handles null agentResults without throwing", () => {
    const run = makeSlideRun({ agentResults: null });
    expect(() => aggregateUnifiedRuns(undefined, [run], [])).not.toThrow();
  });

  it("maps multiple slide runs preserving order (sorted later)", () => {
    const runA = makeSlideRun({ id: 1, startedAt: "2025-05-01T10:00:00.000Z", completedAt: "2025-05-01T10:05:00.000Z" });
    const runB = makeSlideRun({ id: 2, startedAt: "2025-06-01T09:00:00.000Z", completedAt: "2025-06-01T09:05:00.000Z" });
    const runs = aggregateUnifiedRuns(undefined, [runA, runB], []);
    expect(runs).toHaveLength(2);
  });
});

// ── Scheduler run mapping tests ───────────────────────────────────────────────

describe("aggregateUnifiedRuns() — scheduler run mapping", () => {
  it("skips rows with unknown schedulerKey", () => {
    const row = makeSchedulerRow({ schedulerKey: "unknown-scheduler" });
    const runs = aggregateUnifiedRuns(undefined, [], [row]);
    expect(runs).toHaveLength(0);
  });

  it("maps 'research-workflows' to type='analyst'", () => {
    const row = makeSchedulerRow({ schedulerKey: "research-workflows" });
    const runs = aggregateUnifiedRuns(undefined, [], [row]);
    expect(runs[0].type).toBe("analyst");
  });

  it("maps 'iris-health' to type='iris'", () => {
    const row = makeSchedulerRow({ schedulerKey: "iris-health" });
    const runs = aggregateUnifiedRuns(undefined, [], [row]);
    expect(runs[0].type).toBe("iris");
  });

  it("maps 'iris-reindex' to type='iris'", () => {
    const row = makeSchedulerRow({ schedulerKey: "iris-reindex" });
    const runs = aggregateUnifiedRuns(undefined, [], [row]);
    expect(runs[0].type).toBe("iris");
  });

  it("maps 'constants-refresh' to type='analyst'", () => {
    const row = makeSchedulerRow({ schedulerKey: "constants-refresh" });
    const runs = aggregateUnifiedRuns(undefined, [], [row]);
    expect(runs[0].type).toBe("analyst");
  });

  it("uses agentName from ANALYST_SCHEDULER_KEYS for analyst rows", () => {
    const row = makeSchedulerRow({ schedulerKey: "research-workflows" });
    const runs = aggregateUnifiedRuns(undefined, [], [row]);
    expect(runs[0].agentName).toBe(ANALYST_SCHEDULER_KEYS["research-workflows"]);
  });

  it("uses agentName from IRIS_SCHEDULER_KEYS for iris rows", () => {
    const row = makeSchedulerRow({ schedulerKey: "iris-health" });
    const runs = aggregateUnifiedRuns(undefined, [], [row]);
    expect(runs[0].agentName).toBe(IRIS_SCHEDULER_KEYS["iris-health"]);
  });

  it("sets agentRole to 'Analyst' for analyst rows", () => {
    const row = makeSchedulerRow({ schedulerKey: "research-workflows" });
    const runs = aggregateUnifiedRuns(undefined, [], [row]);
    expect(runs[0].agentRole).toBe("Analyst");
  });

  it("sets agentRole to AGENTS.iris.role for iris scheduler rows", () => {
    const row = makeSchedulerRow({ schedulerKey: "iris-health" });
    const runs = aggregateUnifiedRuns(undefined, [], [row]);
    expect(runs[0].agentRole).toBe(AGENTS.iris.role);
  });

  it("uses lastRunAt path when recentRuns is empty", () => {
    const row = makeSchedulerRow({
      schedulerKey: "research-workflows",
      lastRunAt: "2025-06-01T08:00:00.000Z",
      recentRuns: [],
    });
    const runs = aggregateUnifiedRuns(undefined, [], [row]);
    expect(runs).toHaveLength(1);
    expect(runs[0].id).toBe("scheduler-research-workflows");
    expect(runs[0].startedAt).toBe("2025-06-01T08:00:00.000Z");
    expect(runs[0].completedAt).toBe("2025-06-01T08:00:00.000Z");
  });

  it("sets id to 'scheduler-<key>' for the lastRunAt path", () => {
    const row = makeSchedulerRow({ schedulerKey: "constants-refresh", recentRuns: [] });
    const runs = aggregateUnifiedRuns(undefined, [], [row]);
    expect(runs[0].id).toBe("scheduler-constants-refresh");
  });

  it("normalizes 'ok' status from lastRunAt row to 'completed'", () => {
    const row = makeSchedulerRow({ schedulerKey: "research-workflows", status: "ok", recentRuns: [] });
    const runs = aggregateUnifiedRuns(undefined, [], [row]);
    expect(runs[0].status).toBe("completed");
  });

  it("normalizes null status from lastRunAt row to 'completed' (via default)", () => {
    const row = makeSchedulerRow({ schedulerKey: "research-workflows", status: null, recentRuns: [] });
    const runs = aggregateUnifiedRuns(undefined, [], [row]);
    expect(runs[0].status).toBe("completed"); // normalizeStatus("completed")
  });

  it("produces one run per recentRun entry when recentRuns is non-empty", () => {
    const row = makeSchedulerRow({
      schedulerKey: "research-workflows",
      recentRuns: [
        { ranAt: "2025-06-01T08:00:00.000Z", status: "ok", durationMs: 1_000, notes: null, considered: 5, succeeded: 5, failed: 0 },
        { ranAt: "2025-05-31T08:00:00.000Z", status: "warn", durationMs: 2_000, notes: "slow", considered: 3, succeeded: 2, failed: 1 },
      ],
    });
    const runs = aggregateUnifiedRuns(undefined, [], [row]);
    expect(runs).toHaveLength(2);
  });

  it("sets id to 'scheduler-<key>-<ranAt>' for recentRun rows", () => {
    const ranAt = "2025-06-01T08:00:00.000Z";
    const row = makeSchedulerRow({
      schedulerKey: "research-workflows",
      recentRuns: [
        { ranAt, status: "ok", durationMs: 1_000, notes: null, considered: 1, succeeded: 1, failed: 0 },
      ],
    });
    const runs = aggregateUnifiedRuns(undefined, [], [row]);
    expect(runs[0].id).toBe(`scheduler-research-workflows-${ranAt}`);
  });

  it("maps meta from recentRun (notes, considered, succeeded, failed)", () => {
    const row = makeSchedulerRow({
      schedulerKey: "research-workflows",
      recentRuns: [
        { ranAt: "2025-06-01T08:00:00.000Z", status: "ok", durationMs: 1_000, notes: "all good", considered: 10, succeeded: 9, failed: 1 },
      ],
    });
    const runs = aggregateUnifiedRuns(undefined, [], [row]);
    expect(runs[0].meta?.notes).toBe("all good");
    expect(runs[0].meta?.considered).toBe(10);
    expect(runs[0].meta?.succeeded).toBe(9);
    expect(runs[0].meta?.failed).toBe(1);
  });

  it("skips the row entirely when lastRunAt is null and recentRuns is empty", () => {
    const row = makeSchedulerRow({ schedulerKey: "research-workflows", lastRunAt: null, recentRuns: [] });
    const runs = aggregateUnifiedRuns(undefined, [], [row]);
    expect(runs).toHaveLength(0);
  });

  it("skips 'specialist-photos-batch' rows that have no lastRunAt and no recentRuns", () => {
    const row = makeSchedulerRow({ schedulerKey: "specialist-photos-batch", lastRunAt: null, recentRuns: [] });
    const runs = aggregateUnifiedRuns(undefined, [], [row]);
    expect(runs).toHaveLength(0);
  });
});

// ── Sorting contract ──────────────────────────────────────────────────────────

describe("aggregateUnifiedRuns() — sort order", () => {
  it("places active runs before completed ones regardless of timestamp", () => {
    const completedSlide = makeSlideRun({
      id: 1,
      status: "complete",
      startedAt: "2025-06-01T09:00:00.000Z",
      completedAt: "2025-06-01T09:05:00.000Z",
    });
    const runningSlide = makeSlideRun({
      id: 2,
      status: "building",
      startedAt: "2025-05-01T06:00:00.000Z", // older timestamp
      completedAt: null,
    });
    const runs = aggregateUnifiedRuns(undefined, [completedSlide, runningSlide], []);
    expect(runs[0].status).toBe("building");
    expect(runs[1].status).toBe("complete");
  });

  it("sorts by startedAt descending when no run is active", () => {
    const oldSlide = makeSlideRun({ id: 1, startedAt: "2025-05-01T09:00:00.000Z", completedAt: "2025-05-01T09:05:00.000Z" });
    const newSlide = makeSlideRun({ id: 2, startedAt: "2025-06-01T09:00:00.000Z", completedAt: "2025-06-01T09:05:00.000Z" });
    const runs = aggregateUnifiedRuns(undefined, [oldSlide, newSlide], []);
    expect(runs[0].id).toBe("slide-2"); // newer first
    expect(runs[1].id).toBe("slide-1");
  });

  it("mixes iris, slide, and scheduler runs into a single sorted array", () => {
    const runs = aggregateUnifiedRuns(
      makeIrisStatus({ status: "completed", runAt: "2025-06-01T07:00:00.000Z" }),
      [makeSlideRun({ id: 1, startedAt: "2025-06-01T08:00:00.000Z", completedAt: "2025-06-01T08:05:00.000Z" })],
      [makeSchedulerRow({ schedulerKey: "research-workflows", lastRunAt: "2025-06-01T06:00:00.000Z", recentRuns: [] })],
    );
    expect(runs).toHaveLength(3);
    // All completed, sorted desc by startedAt: slide (08:xx) > iris (07:xx) > scheduler (06:xx)
    expect(runs[0].id).toBe("slide-1");
    expect(runs[1].id).toBe("iris-1");
    expect(runs[2].id).toBe("scheduler-research-workflows");
  });
});
