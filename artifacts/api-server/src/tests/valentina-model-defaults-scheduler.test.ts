/**
 * Unit tests for runValentinaModelDefaultsCycle.
 *
 * All external dependencies are mocked — no live DB, no live LLM.
 *
 * Coverage:
 *   - Concurrency guard: second call while first is in-flight returns immediately
 *   - Feature-flag disabled → flagDisabled:true, no DB write, no LLM call
 *   - No eligible rows → early return without LLM call
 *   - Row filter: lastSetSource≠seed or category outside property/management_company → excluded
 *   - Happy path: proposals written to DB, status ok
 *   - All proposals skipped → status warn, no DB writes
 *   - Mix of proposed + skipped → status ok when any proposed
 *   - runValentinaResearch throws → status error, no DB write
 *   - recordSchedulerCycle fires in every path (finally block guarantee)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Module mocks ─────────────────────────────────────────────────────────────
// All factories use inline vi.fn() — external const refs in vi.mock factories
// are in TDZ when the hoisted factory executes.

vi.mock("../db", () => ({
  db: { select: vi.fn(), update: vi.fn() },
}));

vi.mock("@workspace/db", () => ({
  modelDefaults: {},
  schedulerRuns: {},
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn().mockReturnValue("mock-eq"),
}));

vi.mock("../storage", () => ({
  storage: { getAdminResourceBySlug: vi.fn() },
}));

vi.mock("../ai/valentina-model-defaults", () => ({
  runValentinaResearch: vi.fn(),
  VALENTINA_ENABLED_PARAM: "valentina-enabled",
}));

vi.mock("../jobs/scheduler-run-tracker", () => ({
  recordSchedulerCycle: vi.fn(),
  truncateNotes: vi.fn((s: string | null | undefined) => s ?? null),
}));

vi.mock("../logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { runValentinaModelDefaultsCycle } from "../jobs/valentina-model-defaults-scheduler";
import { db } from "../db";
import { storage } from "../storage";
import { runValentinaResearch } from "../ai/valentina-model-defaults";
import { recordSchedulerCycle } from "../jobs/scheduler-run-tracker";

const mockDbSelect = vi.mocked(db.select);
const mockDbUpdate = vi.mocked(db.update);
const mockStorage = vi.mocked(storage);
const mockRunValentinaResearch = vi.mocked(runValentinaResearch);
const mockRecordSchedulerCycle = vi.mocked(recordSchedulerCycle);

// ── Fixtures ──────────────────────────────────────────────────────────────────

function seedRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    defaultKey: "occupancyRate",
    label: "Occupancy Rate",
    unit: "rate",
    value: 0.65,
    category: "property",
    subTab: "revenue",
    lastSetSource: "seed",
    ...overrides,
  };
}

function proposal(id: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    skipped: false,
    proposedValue: 0.72,
    proposedRangeLow: 0.6,
    proposedRangeHigh: 0.8,
    proposedAuthority: "STR Survey 2025",
    proposedReferenceUrl: "https://example.com",
    proposedConviction: 0.9,
    ...overrides,
  };
}

function skippedProposal(id: number, reason = "missing-from-llm-response") {
  return { id, skipped: true, skipReason: reason };
}

// ── Setup helpers ─────────────────────────────────────────────────────────────

function enableFlag() {
  mockStorage.getAdminResourceBySlug!.mockResolvedValue({ config: { value: 1 } } as never);
}

function disableFlag() {
  mockStorage.getAdminResourceBySlug!.mockResolvedValue(null as never);
}

function setupSelectReturning(rows: object[]) {
  mockDbSelect.mockReturnValue({ from: vi.fn().mockResolvedValue(rows) } as never);
}

function setupDbUpdateChain() {
  const mockWhere = vi.fn().mockResolvedValue([]);
  const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
  mockDbUpdate.mockReturnValue({ set: mockSet } as never);
  return { mockSet, mockWhere };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("runValentinaModelDefaultsCycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    disableFlag();
    setupSelectReturning([]);
    setupDbUpdateChain();
    mockRecordSchedulerCycle.mockResolvedValue(undefined);
  });

  // ── Concurrency guard ─────────────────────────────────────────────────────

  describe("concurrency guard", () => {
    it("returns immediately without calling recordSchedulerCycle when already in-flight", async () => {
      // First call hangs at the storage await so isRunning stays true
      let resolveFlag!: (v: unknown) => void;
      mockStorage.getAdminResourceBySlug!.mockReturnValueOnce(
        new Promise((r) => { resolveFlag = r; }) as never,
      );

      // isRunning becomes true synchronously before the first await inside the cycle
      const firstCall = runValentinaModelDefaultsCycle();

      // Second call sees isRunning === true
      const secondResult = await runValentinaModelDefaultsCycle();
      expect(secondResult).toEqual({ proposed: 0, skipped: 0, flagDisabled: false });
      expect(mockRecordSchedulerCycle).not.toHaveBeenCalled();

      // Let the first call finish so isRunning resets to false
      resolveFlag(null);
      await firstCall;
    });
  });

  // ── Feature-flag gate ─────────────────────────────────────────────────────

  describe("feature-flag gate", () => {
    it("returns flagDisabled:true when flag row is absent", async () => {
      disableFlag();
      const result = await runValentinaModelDefaultsCycle();
      expect(result).toEqual({ proposed: 0, skipped: 0, flagDisabled: true });
    });

    it("returns flagDisabled:true when flag value is 0", async () => {
      mockStorage.getAdminResourceBySlug!.mockResolvedValue({ config: { value: 0 } } as never);
      const result = await runValentinaModelDefaultsCycle();
      expect(result).toEqual({ proposed: 0, skipped: 0, flagDisabled: true });
    });

    it("does not call LLM when flag is disabled", async () => {
      disableFlag();
      await runValentinaModelDefaultsCycle();
      expect(mockRunValentinaResearch).not.toHaveBeenCalled();
    });

    it("records cycle with 'Feature flag disabled' note when flag is off", async () => {
      disableFlag();
      await runValentinaModelDefaultsCycle();
      expect(mockRecordSchedulerCycle).toHaveBeenCalledWith(
        expect.objectContaining({ notes: "Feature flag disabled" }),
      );
    });
  });

  // ── Row filtering ─────────────────────────────────────────────────────────

  describe("row filtering", () => {
    it("excludes rows where lastSetSource is not 'seed'", async () => {
      enableFlag();
      setupSelectReturning([
        seedRow({ lastSetSource: "admin" }),
        seedRow({ lastSetSource: "research" }),
      ]);
      const result = await runValentinaModelDefaultsCycle();
      expect(result).toEqual({ proposed: 0, skipped: 0, flagDisabled: false });
      expect(mockRunValentinaResearch).not.toHaveBeenCalled();
    });

    it("excludes rows in categories outside property and management_company", async () => {
      enableFlag();
      setupSelectReturning([
        seedRow({ category: "operations" }),
        seedRow({ category: "finance" }),
      ]);
      const result = await runValentinaModelDefaultsCycle();
      expect(mockRunValentinaResearch).not.toHaveBeenCalled();
      expect(result.proposed).toBe(0);
    });

    it("includes management_company seed rows", async () => {
      enableFlag();
      setupSelectReturning([seedRow({ id: 20, defaultKey: "mgmtFee", category: "management_company" })]);
      mockRunValentinaResearch.mockResolvedValue([proposal(20)]);
      const result = await runValentinaModelDefaultsCycle();
      expect(result.proposed).toBe(1);
    });

    it("passes eligible rows as ValentinaInputRow array to runValentinaResearch", async () => {
      enableFlag();
      const row = seedRow({ id: 5, defaultKey: "exitCapRate", value: 0.075 });
      setupSelectReturning([row]);
      mockRunValentinaResearch.mockResolvedValue([proposal(5)]);
      await runValentinaModelDefaultsCycle();
      expect(mockRunValentinaResearch).toHaveBeenCalledWith([
        expect.objectContaining({ id: 5, defaultKey: "exitCapRate", value: 0.075 }),
      ]);
    });
  });

  // ── Happy path ────────────────────────────────────────────────────────────

  describe("happy path", () => {
    it("returns proposed count when LLM produces accepted proposals", async () => {
      enableFlag();
      setupSelectReturning([seedRow({ id: 10 })]);
      mockRunValentinaResearch.mockResolvedValue([proposal(10)]);
      const result = await runValentinaModelDefaultsCycle();
      expect(result).toEqual({ proposed: 1, skipped: 0, flagDisabled: false });
    });

    it("writes proposed_* columns to DB for each accepted proposal", async () => {
      enableFlag();
      setupSelectReturning([seedRow({ id: 10 })]);
      mockRunValentinaResearch.mockResolvedValue([proposal(10)]);
      const { mockWhere } = setupDbUpdateChain();
      await runValentinaModelDefaultsCycle();
      expect(mockWhere).toHaveBeenCalledTimes(1);
    });

    it("writes one DB row per accepted proposal in a multi-row batch", async () => {
      enableFlag();
      setupSelectReturning([
        seedRow({ id: 10, defaultKey: "occupancyRate" }),
        seedRow({ id: 11, defaultKey: "exitCapRate" }),
      ]);
      mockRunValentinaResearch.mockResolvedValue([proposal(10), proposal(11)]);
      const { mockWhere } = setupDbUpdateChain();
      await runValentinaModelDefaultsCycle();
      expect(mockWhere).toHaveBeenCalledTimes(2);
    });

    it("records cycle with status ok and correct counts", async () => {
      enableFlag();
      setupSelectReturning([
        seedRow({ id: 10, defaultKey: "occupancyRate" }),
        seedRow({ id: 11, defaultKey: "exitCapRate" }),
      ]);
      mockRunValentinaResearch.mockResolvedValue([
        proposal(10),
        skippedProposal(11),
      ]);
      await runValentinaModelDefaultsCycle();
      expect(mockRecordSchedulerCycle).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "ok",
          considered: 2,
          succeeded: 1,
          failed: 1,
        }),
      );
    });
  });

  // ── All proposals skipped ─────────────────────────────────────────────────

  describe("all proposals skipped", () => {
    it("returns skipped count when all proposals are skipped", async () => {
      enableFlag();
      setupSelectReturning([seedRow({ id: 10 })]);
      mockRunValentinaResearch.mockResolvedValue([skippedProposal(10)]);
      const result = await runValentinaModelDefaultsCycle();
      expect(result).toEqual({ proposed: 0, skipped: 1, flagDisabled: false });
    });

    it("does not write to DB when all proposals are skipped", async () => {
      enableFlag();
      setupSelectReturning([seedRow({ id: 10 })]);
      mockRunValentinaResearch.mockResolvedValue([skippedProposal(10)]);
      const { mockWhere } = setupDbUpdateChain();
      await runValentinaModelDefaultsCycle();
      expect(mockWhere).not.toHaveBeenCalled();
    });

    it("records cycle with status warn when proposed is 0", async () => {
      enableFlag();
      setupSelectReturning([seedRow({ id: 10 })]);
      mockRunValentinaResearch.mockResolvedValue([skippedProposal(10)]);
      await runValentinaModelDefaultsCycle();
      expect(mockRecordSchedulerCycle).toHaveBeenCalledWith(
        expect.objectContaining({ status: "warn" }),
      );
    });
  });

  // ── Error path ────────────────────────────────────────────────────────────

  describe("error path", () => {
    it("returns without throwing when runValentinaResearch rejects", async () => {
      enableFlag();
      setupSelectReturning([seedRow({ id: 10 })]);
      mockRunValentinaResearch.mockRejectedValue(new Error("LLM timeout"));
      await expect(runValentinaModelDefaultsCycle()).resolves.toEqual({
        proposed: 0,
        skipped: 0,
        flagDisabled: false,
      });
    });

    it("does not write to DB when runValentinaResearch throws", async () => {
      enableFlag();
      setupSelectReturning([seedRow({ id: 10 })]);
      mockRunValentinaResearch.mockRejectedValue(new Error("LLM timeout"));
      const { mockWhere } = setupDbUpdateChain();
      await runValentinaModelDefaultsCycle();
      expect(mockWhere).not.toHaveBeenCalled();
    });

    it("records cycle with status error when runValentinaResearch throws", async () => {
      enableFlag();
      setupSelectReturning([seedRow({ id: 10 })]);
      mockRunValentinaResearch.mockRejectedValue(new Error("LLM timeout"));
      await runValentinaModelDefaultsCycle();
      expect(mockRecordSchedulerCycle).toHaveBeenCalledWith(
        expect.objectContaining({ status: "error" }),
      );
    });
  });

  // ── recordSchedulerCycle always fires ─────────────────────────────────────

  describe("recordSchedulerCycle always fires (finally block)", () => {
    it("fires when feature flag is disabled", async () => {
      disableFlag();
      await runValentinaModelDefaultsCycle();
      expect(mockRecordSchedulerCycle).toHaveBeenCalledTimes(1);
    });

    it("fires when no eligible rows exist", async () => {
      enableFlag();
      setupSelectReturning([]);
      await runValentinaModelDefaultsCycle();
      expect(mockRecordSchedulerCycle).toHaveBeenCalledTimes(1);
    });

    it("fires when proposals succeed", async () => {
      enableFlag();
      setupSelectReturning([seedRow({ id: 10 })]);
      mockRunValentinaResearch.mockResolvedValue([proposal(10)]);
      await runValentinaModelDefaultsCycle();
      expect(mockRecordSchedulerCycle).toHaveBeenCalledTimes(1);
    });

    it("fires when runValentinaResearch throws", async () => {
      enableFlag();
      setupSelectReturning([seedRow({ id: 10 })]);
      mockRunValentinaResearch.mockRejectedValue(new Error("network error"));
      await runValentinaModelDefaultsCycle();
      expect(mockRecordSchedulerCycle).toHaveBeenCalledTimes(1);
    });

    it("always records the scheduler key", async () => {
      disableFlag();
      await runValentinaModelDefaultsCycle();
      expect(mockRecordSchedulerCycle).toHaveBeenCalledWith(
        expect.objectContaining({ key: "valentina-model-defaults" }),
      );
    });
  });
});
