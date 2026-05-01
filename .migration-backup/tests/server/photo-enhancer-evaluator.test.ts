/**
 * Tests for the Photos & Renders engine evaluator
 * (engine/analyst/surface/photos/photo-enhancer-evaluator.ts).
 *
 * Storage + the shared pipeline are mocked so this is a pure logic test
 * of: dispatch-context resolution (caller args > runtimeConfig defaults
 * > "standard"), per-property failure isolation, and admin-config
 * propagation (promptTemplate + modelResourceId reach the pipeline call).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const getSpecialistConfig = vi.fn();
const runPipeline = vi.fn();

vi.mock("../../server/storage", () => ({
  storage: {
    getSpecialistConfig: (id: string) => getSpecialistConfig(id),
  },
}));

vi.mock("../../server/services/photo-enhancer-pipeline", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../server/services/photo-enhancer-pipeline")>();
  return {
    ...actual,
    runPhotoEnhancerPipeline: (input: unknown) => runPipeline(input),
  };
});

vi.mock("../../server/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
  log: vi.fn(),
}));

import { evaluatePhotoEnhancerSpecialist } from "../../engine/analyst/surface/photos/photo-enhancer-evaluator";
import {
  PHOTO_ENHANCER_SPECIALIST_ID,
  PhotoEnhancerStyleDisabledError,
} from "../../server/services/photo-enhancer-pipeline";

beforeEach(() => {
  getSpecialistConfig.mockReset();
  runPipeline.mockReset();
});

describe("evaluatePhotoEnhancerSpecialist — config wiring", () => {
  it("loads admin promptTemplate + modelResourceId from specialist_configs", async () => {
    getSpecialistConfig.mockResolvedValue({
      promptTemplate: "Render in {{style}} mode: {{prompt}}",
      modelResourceId: 42,
      runtimeConfig: {},
    });
    runPipeline.mockResolvedValue({
      objectPath: "p/x.png",
      imageData: "",
      isAiGenerated: true,
      style: "standard",
      usedFallback: false,
      specialistRunId: 7,
    });
    const summary = await evaluatePhotoEnhancerSpecialist({
      propertyIds: [101],
      prompt: "exterior",
      originatedFrom: "scheduled-batch",
      route: "test",
    });
    expect(getSpecialistConfig).toHaveBeenCalledWith(PHOTO_ENHANCER_SPECIALIST_ID);
    expect(runPipeline).toHaveBeenCalledTimes(1);
    const args = runPipeline.mock.calls[0][0] as Record<string, unknown>;
    expect(args.promptTemplate).toBe("Render in {{style}} mode: {{prompt}}");
    expect(args.modelResourceId).toBe(42);
    expect(args.propertyId).toBe(101);
    expect(args.originatedFrom).toBe("scheduled-batch");
    expect(summary.modelResourceId).toBe(42);
    expect(summary.promptTemplateApplied).toBe(true);
  });

  it("falls back to runtimeConfig.scheduledStyle when caller omits style", async () => {
    getSpecialistConfig.mockResolvedValue({
      promptTemplate: "",
      modelResourceId: null,
      runtimeConfig: { scheduledStyle: "architectural-exterior", scheduledPrompt: "wide angle" },
    });
    runPipeline.mockResolvedValue({
      objectPath: "p/x.png",
      imageData: "",
      isAiGenerated: true,
      style: "architectural-exterior",
      usedFallback: false,
      specialistRunId: 8,
    });
    const summary = await evaluatePhotoEnhancerSpecialist({
      propertyIds: [1],
      originatedFrom: "scheduled-batch",
      route: "test",
    });
    const args = runPipeline.mock.calls[0][0] as Record<string, unknown>;
    expect(args.style).toBe("architectural-exterior");
    expect(args.prompt).toBe("wide angle");
    expect(summary.style).toBe("architectural-exterior");
  });

  it("ignores invalid runtimeConfig.scheduledStyle and defaults to 'standard'", async () => {
    getSpecialistConfig.mockResolvedValue({
      promptTemplate: "",
      modelResourceId: null,
      runtimeConfig: { scheduledStyle: "not-a-real-style" },
    });
    runPipeline.mockResolvedValue({
      objectPath: "", imageData: "", isAiGenerated: true,
      style: "standard", usedFallback: false, specialistRunId: 1,
    });
    await evaluatePhotoEnhancerSpecialist({
      propertyIds: [1],
      originatedFrom: "scheduled-batch",
      route: "test",
    });
    const args = runPipeline.mock.calls[0][0] as Record<string, unknown>;
    expect(args.style).toBe("standard");
  });
});

describe("evaluatePhotoEnhancerSpecialist — batch behavior", () => {
  beforeEach(() => {
    getSpecialistConfig.mockResolvedValue({
      promptTemplate: "",
      modelResourceId: null,
      runtimeConfig: {},
    });
  });

  it("dispatches once per property and aggregates per-property results", async () => {
    runPipeline
      .mockResolvedValueOnce({ objectPath: "a", imageData: "", isAiGenerated: true, style: "standard", usedFallback: false, specialistRunId: 11 })
      .mockResolvedValueOnce({ objectPath: "b", imageData: "", isAiGenerated: true, style: "standard", usedFallback: true, specialistRunId: 12 })
      .mockResolvedValueOnce({ objectPath: "c", imageData: "", isAiGenerated: true, style: "standard", usedFallback: false, specialistRunId: 13 });
    const summary = await evaluatePhotoEnhancerSpecialist({
      propertyIds: [1, 2, 3],
      originatedFrom: "scheduled-batch",
      route: "test",
    });
    expect(runPipeline).toHaveBeenCalledTimes(3);
    expect(summary.considered).toBe(3);
    expect(summary.succeeded).toBe(3);
    expect(summary.failed).toBe(0);
    expect(summary.perProperty.map((r) => r.propertyId)).toEqual([1, 2, 3]);
    expect(summary.perProperty[1].usedFallback).toBe(true);
  });

  it("isolates per-property failures so one bad property doesn't abort the batch", async () => {
    runPipeline
      .mockResolvedValueOnce({ objectPath: "a", imageData: "", isAiGenerated: true, style: "standard", usedFallback: false, specialistRunId: 1 })
      .mockRejectedValueOnce(new Error("upstream timeout"))
      .mockResolvedValueOnce({ objectPath: "c", imageData: "", isAiGenerated: true, style: "standard", usedFallback: false, specialistRunId: 3 });
    const summary = await evaluatePhotoEnhancerSpecialist({
      propertyIds: [10, 20, 30],
      originatedFrom: "scheduled-batch",
      route: "test",
    });
    expect(summary.considered).toBe(3);
    expect(summary.succeeded).toBe(2);
    expect(summary.failed).toBe(1);
    const failedRow = summary.perProperty.find((r) => r.status === "failed");
    expect(failedRow?.propertyId).toBe(20);
    expect(failedRow?.error).toContain("upstream timeout");
  });

  it("short-circuits the rest of the batch when style is admin-disabled", async () => {
    runPipeline
      .mockResolvedValueOnce({ objectPath: "a", imageData: "", isAiGenerated: true, style: "standard", usedFallback: false, specialistRunId: 1 })
      .mockRejectedValueOnce(new PhotoEnhancerStyleDisabledError("photo-to-render"));
    const summary = await evaluatePhotoEnhancerSpecialist({
      propertyIds: [10, 20, 30, 40, 50],
      style: "photo-to-render",
      originatedFrom: "scheduled-batch",
      route: "test",
    });
    expect(runPipeline).toHaveBeenCalledTimes(2); // first ok, second hits the disabled style → break
    expect(summary.succeeded).toBe(1);
    expect(summary.skipped).toBe(4); // the failing one + 3 unprocessed remainder
    expect(summary.failed).toBe(0);
    // Regression guard: the original implementation indexed the unprocessed
    // remainder off `perProperty.length`, which grows with every push. That
    // bug skipped real ids and stamped `0` for trailing entries. Assert the
    // exact ordered (propertyId, status) shape so any future refactor that
    // re-introduces the misindex fails loudly here.
    expect(summary.perProperty.map((r) => ({ id: r.propertyId, status: r.status }))).toEqual([
      { id: 10, status: "succeeded" },
      { id: 20, status: "skipped" },
      { id: 30, status: "skipped" },
      { id: 40, status: "skipped" },
      { id: 50, status: "skipped" },
    ]);
    expect(summary.perProperty.filter((r) => r.status === "skipped").every((r) => r.reason === "style-disabled:photo-to-render")).toBe(true);
  });

  it("returns an empty zero-summary when scheduled-batch dispatch has no targets", async () => {
    const summary = await evaluatePhotoEnhancerSpecialist({
      propertyIds: [],
      originatedFrom: "scheduled-batch",
      route: "test",
    });
    expect(runPipeline).not.toHaveBeenCalled();
    expect(summary.considered).toBe(0);
    expect(summary.succeeded).toBe(0);
    expect(summary.specialistId).toBe(PHOTO_ENHANCER_SPECIALIST_ID);
  });

  it("only forwards beforeImageUrl when the batch targets a single property", async () => {
    runPipeline.mockResolvedValue({
      objectPath: "a", imageData: "", isAiGenerated: true,
      style: "standard", usedFallback: false, specialistRunId: 1,
    });
    await evaluatePhotoEnhancerSpecialist({
      propertyIds: [1, 2],
      originatedFrom: "specialist-page",
      route: "test",
      beforeImageUrl: "https://example.com/x.png",
    });
    for (const call of runPipeline.mock.calls) {
      expect((call[0] as Record<string, unknown>).beforeImageUrl).toBeUndefined();
    }
    runPipeline.mockClear();
    await evaluatePhotoEnhancerSpecialist({
      propertyIds: [99],
      originatedFrom: "specialist-page",
      route: "test",
      beforeImageUrl: "https://example.com/x.png",
    });
    expect((runPipeline.mock.calls[0][0] as Record<string, unknown>).beforeImageUrl).toBe("https://example.com/x.png");
  });
});
