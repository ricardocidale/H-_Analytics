/**
 * Tests for the Photos & Renders scheduled batch
 * (server/jobs/specialist-photos-batch.ts).
 *
 * Storage + the engine evaluator are mocked. Wall-clock-bound module
 * state (`lastDispatchAt`, `isRunning`) is reset between tests via the
 * `__resetPhotosBatchStateForTest` seam.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const getSpecialistConfig = vi.fn();
const getAllPropertiesAdmin = vi.fn();
const recordSchedulerRun = vi.fn();
const evalSpecialist = vi.fn();

vi.mock("../../server/storage", () => ({
  storage: {
    getSpecialistConfig: (id: string) => getSpecialistConfig(id),
    getAllPropertiesAdmin: (incl?: boolean) => getAllPropertiesAdmin(incl),
    recordSchedulerRun: (input: unknown) => recordSchedulerRun(input),
  },
}));

vi.mock("../../engine/analyst/surface/photos/photo-enhancer-evaluator", () => ({
  evaluatePhotoEnhancerSpecialist: (input: unknown) => evalSpecialist(input),
}));

vi.mock("../../server/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
  log: vi.fn(),
}));

import {
  parseBatchScheduleConfig,
  runPhotosBatchCycle,
  __resetPhotosBatchStateForTest,
} from "../../server/jobs/specialist-photos-batch";
import { SCHEDULER_REGISTRY } from "../../server/jobs/scheduler-run-tracker";

beforeEach(() => {
  getSpecialistConfig.mockReset();
  getAllPropertiesAdmin.mockReset();
  recordSchedulerRun.mockReset();
  evalSpecialist.mockReset();
  recordSchedulerRun.mockResolvedValue(undefined);
  __resetPhotosBatchStateForTest();
});

describe("parseBatchScheduleConfig", () => {
  it("returns disabled defaults when runtimeConfig has no batchSchedule block", () => {
    expect(parseBatchScheduleConfig({}).enabled).toBe(false);
    expect(parseBatchScheduleConfig(null).enabled).toBe(false);
    expect(parseBatchScheduleConfig({ unrelated: 1 }).enabled).toBe(false);
  });

  it("clamps intervalHours to the supported range", () => {
    expect(parseBatchScheduleConfig({ batchSchedule: { enabled: true, intervalHours: 0 } }).intervalHours).toBeGreaterThanOrEqual(1);
    expect(parseBatchScheduleConfig({ batchSchedule: { enabled: true, intervalHours: 999 } }).intervalHours).toBeLessThanOrEqual(24 * 7);
    expect(parseBatchScheduleConfig({ batchSchedule: { enabled: true, intervalHours: 6 } }).intervalHours).toBe(6);
  });

  it("clamps maxPerCycle to a safe positive integer", () => {
    expect(parseBatchScheduleConfig({ batchSchedule: { enabled: true, maxPerCycle: -5 } }).maxPerCycle).toBeGreaterThan(0);
    expect(parseBatchScheduleConfig({ batchSchedule: { enabled: true, maxPerCycle: 9999 } }).maxPerCycle).toBeLessThanOrEqual(50);
  });

  it("rejects malformed propertyIds entries individually", () => {
    const cfg = parseBatchScheduleConfig({
      batchSchedule: { enabled: true, propertyIds: [1, "x", 0, -3, 4] },
    });
    expect(cfg.propertyIds).toEqual([1, 4]);
  });

  it("treats targetMode='all' as a valid fan-out mode", () => {
    const cfg = parseBatchScheduleConfig({
      batchSchedule: { enabled: true, targetMode: "all" },
    });
    expect(cfg.targetMode).toBe("all");
    expect(cfg.propertyIds).toBeNull();
  });

  it("falls back to 'standard' style when an unknown one is supplied", () => {
    const cfg = parseBatchScheduleConfig({
      batchSchedule: { enabled: true, style: "totally-fake" },
    });
    expect(cfg.style).toBe("standard");
  });
});

describe("runPhotosBatchCycle — short-circuits", () => {
  it("no-ops without dispatching when batchSchedule is disabled", async () => {
    getSpecialistConfig.mockResolvedValue({
      promptTemplate: "",
      modelResourceId: null,
      runtimeConfig: { batchSchedule: { enabled: false } },
    });
    const summary = await runPhotosBatchCycle();
    expect(evalSpecialist).not.toHaveBeenCalled();
    expect(summary.dispatched).toBe(false);
    expect(summary.skippedReason).toBe("disabled");
    // Even disabled cycles record into scheduler_runs so the Observability
    // page shows that the scheduler is alive (just intentionally idle).
    expect(recordSchedulerRun).toHaveBeenCalledTimes(1);
  });

  it("warns + records when enabled but no targets resolve", async () => {
    getSpecialistConfig.mockResolvedValue({
      promptTemplate: "",
      modelResourceId: null,
      runtimeConfig: {
        batchSchedule: { enabled: true, targetMode: "explicit", propertyIds: [] },
      },
    });
    const summary = await runPhotosBatchCycle();
    expect(evalSpecialist).not.toHaveBeenCalled();
    expect(summary.dispatched).toBe(false);
    expect(summary.skippedReason).toBe("no-targets");
    const call = recordSchedulerRun.mock.calls[0][0] as Record<string, unknown>;
    expect(call.status).toBe("warn");
  });
});

describe("runPhotosBatchCycle — dispatch path", () => {
  it("hands the explicit propertyIds list to the evaluator (capped by maxPerCycle)", async () => {
    getSpecialistConfig.mockResolvedValue({
      promptTemplate: "",
      modelResourceId: null,
      runtimeConfig: {
        batchSchedule: {
          enabled: true,
          intervalHours: 1,
          maxPerCycle: 2,
          propertyIds: [10, 20, 30],
          style: "interior-design",
          prompt: "warm tones",
        },
      },
    });
    evalSpecialist.mockResolvedValue({
      specialistId: "photos.photo-enhancer",
      considered: 2, succeeded: 2, failed: 0, skipped: 0,
      style: "interior-design", promptTemplateApplied: false, modelResourceId: null,
      perProperty: [],
    });
    const summary = await runPhotosBatchCycle();
    const args = evalSpecialist.mock.calls[0][0] as Record<string, unknown>;
    expect(args.propertyIds).toEqual([10, 20]);
    expect(args.style).toBe("interior-design");
    expect(args.prompt).toBe("warm tones");
    expect(args.originatedFrom).toBe("scheduled-batch");
    expect(summary.dispatched).toBe(true);
    expect(recordSchedulerRun).toHaveBeenCalledTimes(1);
    const cycleRow = recordSchedulerRun.mock.calls[0][0] as Record<string, unknown>;
    expect(cycleRow.status).toBe("ok");
    expect(cycleRow.succeeded).toBe(2);
  });

  it("fans out to all admin-visible properties when targetMode='all'", async () => {
    getSpecialistConfig.mockResolvedValue({
      promptTemplate: "",
      modelResourceId: null,
      runtimeConfig: {
        batchSchedule: { enabled: true, intervalHours: 1, maxPerCycle: 5, targetMode: "all" },
      },
    });
    getAllPropertiesAdmin.mockResolvedValue(
      Array.from({ length: 12 }, (_, i) => ({ id: 100 + i })),
    );
    evalSpecialist.mockResolvedValue({
      specialistId: "photos.photo-enhancer",
      considered: 5, succeeded: 5, failed: 0, skipped: 0,
      style: "standard", promptTemplateApplied: false, modelResourceId: null,
      perProperty: [],
    });
    await runPhotosBatchCycle();
    const args = evalSpecialist.mock.calls[0][0] as Record<string, unknown>;
    expect((args.propertyIds as number[]).length).toBe(5);
    expect((args.propertyIds as number[])[0]).toBe(100);
    expect((args.propertyIds as number[])[4]).toBe(104);
  });

  it("escalates the cycle status to 'warn' when any property is skipped or 'error' when all fail", async () => {
    getSpecialistConfig.mockResolvedValue({
      promptTemplate: "",
      modelResourceId: null,
      runtimeConfig: {
        batchSchedule: { enabled: true, intervalHours: 1, propertyIds: [1, 2] },
      },
    });
    evalSpecialist.mockResolvedValueOnce({
      specialistId: "photos.photo-enhancer",
      considered: 2, succeeded: 1, failed: 0, skipped: 1,
      style: "standard", promptTemplateApplied: false, modelResourceId: null,
      perProperty: [],
    });
    await runPhotosBatchCycle();
    expect((recordSchedulerRun.mock.calls[0][0] as Record<string, unknown>).status).toBe("warn");

    recordSchedulerRun.mockClear();
    evalSpecialist.mockClear();
    __resetPhotosBatchStateForTest();
    evalSpecialist.mockResolvedValueOnce({
      specialistId: "photos.photo-enhancer",
      considered: 2, succeeded: 0, failed: 2, skipped: 0,
      style: "standard", promptTemplateApplied: false, modelResourceId: null,
      perProperty: [],
    });
    await runPhotosBatchCycle();
    expect((recordSchedulerRun.mock.calls[0][0] as Record<string, unknown>).status).toBe("error");
  });
});

describe("scheduler registry", () => {
  it("exposes 'specialist-photos-batch' so the Observability page can render it", () => {
    const keys = SCHEDULER_REGISTRY.map((s) => s.key);
    expect(keys).toContain("specialist-photos-batch");
  });
});
