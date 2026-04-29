/**
 * G7 tests for Photo Enhancer specialist (Fernanda / photos.photo-enhancer).
 *
 * Coverage:
 *   G7-batch: evaluatePhotoEnhancerSpecialist logic
 *   - scheduled-batch with empty property IDs returns zero summary immediately
 *   - single-property success returns correct shape
 *   - PhotoEnhancerStyleDisabledError skips entire remaining batch
 *   - per-property failure is isolated — does not abort the batch
 *   - falls back to "standard" style when no style set on input or runtimeConfig
 *   - uses runtimeConfig.scheduledStyle when input.style is absent
 *   - promptTemplateApplied reflects whether config.promptTemplate is non-empty
 *   - modelResourceId from specialist config is propagated to the summary
 *
 *   G7-catalog: catalog entry
 *   - status is "built"
 *   - correct letter, subject, and humanName
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../../server/storage", () => ({
  storage: {
    getSpecialistConfig: vi.fn(),
  },
}));

vi.mock("../../../server/logger", () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("../../../server/services/photo-enhancer-pipeline", () => {
  class PhotoEnhancerStyleDisabledError extends Error {
    style: string;
    constructor(style: string) {
      super(`Style disabled: ${style}`);
      this.name = "PhotoEnhancerStyleDisabledError";
      this.style = style;
    }
  }
  class PhotoEnhancerInvalidSourceUrlError extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = "PhotoEnhancerInvalidSourceUrlError";
    }
  }
  return {
    PHOTO_ENHANCER_SPECIALIST_ID: "photos.photo-enhancer",
    PHOTO_ENHANCER_STYLES: [
      "standard",
      "architectural-exterior",
      "interior-design",
      "renovation-concept",
      "photo-upscale",
      "virtual-staging",
      "background-remove",
      "photo-to-render",
    ] as const,
    PhotoEnhancerStyleDisabledError,
    PhotoEnhancerInvalidSourceUrlError,
    runPhotoEnhancerPipeline: vi.fn(),
  };
});

import { evaluatePhotoEnhancerSpecialist } from "../../../engine/analyst/surface/photos/photo-enhancer-evaluator";
import { storage } from "../../../server/storage";
import {
  PhotoEnhancerStyleDisabledError,
  runPhotoEnhancerPipeline,
} from "../../../server/services/photo-enhancer-pipeline";
import { SPECIALIST_CATALOG } from "../../../engine/analyst/registry/specialist-catalog";

const mockedStorage = storage as unknown as {
  getSpecialistConfig: ReturnType<typeof vi.fn>;
};

const mockedRun = runPhotoEnhancerPipeline as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockedStorage.getSpecialistConfig.mockResolvedValue(null);
});

// ─── evaluatePhotoEnhancerSpecialist ─────────────────────────────────────────

describe("Photo Enhancer G7 — evaluatePhotoEnhancerSpecialist", () => {
  it("scheduled-batch with empty property IDs returns zero summary without running the pipeline", async () => {
    const result = await evaluatePhotoEnhancerSpecialist({
      propertyIds: [],
      originatedFrom: "scheduled-batch",
      route: "scheduler:test",
    });
    expect(result.specialistId).toBe("photos.photo-enhancer");
    expect(result.considered).toBe(0);
    expect(result.succeeded).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.perProperty).toEqual([]);
    expect(mockedRun).not.toHaveBeenCalled();
  });

  it("single-property success returns the correct batch summary shape", async () => {
    mockedRun.mockResolvedValue({
      specialistRunId: 42,
      objectPath: "objects/prop-1-render.jpg",
      usedFallback: false,
    });
    const result = await evaluatePhotoEnhancerSpecialist({
      propertyIds: [1],
      originatedFrom: "specialist-page",
      route: "specialist-page:test",
    });
    expect(result.considered).toBe(1);
    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.perProperty[0]?.status).toBe("succeeded");
    expect(result.perProperty[0]?.propertyId).toBe(1);
    expect(result.perProperty[0]?.objectPath).toBe("objects/prop-1-render.jpg");
  });

  it("PhotoEnhancerStyleDisabledError skips the triggering property and all remaining batch entries", async () => {
    mockedRun.mockRejectedValue(new PhotoEnhancerStyleDisabledError("virtual-staging"));
    const result = await evaluatePhotoEnhancerSpecialist({
      propertyIds: [1, 2, 3],
      originatedFrom: "specialist-page",
      route: "specialist-page:test",
    });
    expect(result.succeeded).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.skipped).toBe(3);
    expect(result.perProperty).toHaveLength(3);
    expect(result.perProperty.every((p) => p.status === "skipped")).toBe(true);
    // Loop breaks immediately — pipeline is only called once for the first property
    expect(mockedRun).toHaveBeenCalledTimes(1);
  });

  it("per-property failure does not abort the batch — remaining properties continue", async () => {
    mockedRun
      .mockResolvedValueOnce({ specialistRunId: 1, objectPath: "a.jpg", usedFallback: false })
      .mockRejectedValueOnce(new Error("upload timeout"))
      .mockResolvedValueOnce({ specialistRunId: 3, objectPath: "c.jpg", usedFallback: false });
    const result = await evaluatePhotoEnhancerSpecialist({
      propertyIds: [1, 2, 3],
      originatedFrom: "specialist-page",
      route: "specialist-page:test",
    });
    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.skipped).toBe(0);
    const failedEntry = result.perProperty.find((p) => p.propertyId === 2);
    expect(failedEntry?.status).toBe("failed");
    expect(failedEntry?.error).toMatch(/upload timeout/);
  });

  it("falls back to 'standard' style when neither input.style nor runtimeConfig.scheduledStyle is set", async () => {
    mockedRun.mockResolvedValue({ specialistRunId: 1, objectPath: "x.jpg", usedFallback: false });
    const result = await evaluatePhotoEnhancerSpecialist({
      propertyIds: [1],
      originatedFrom: "specialist-page",
      route: "specialist-page:test",
    });
    expect(result.style).toBe("standard");
  });

  it("uses runtimeConfig.scheduledStyle when input.style is not provided", async () => {
    mockedStorage.getSpecialistConfig.mockResolvedValue({
      runtimeConfig: { scheduledStyle: "architectural-exterior" },
      promptTemplate: "",
      modelResourceId: null,
    });
    mockedRun.mockResolvedValue({ specialistRunId: 1, objectPath: "x.jpg", usedFallback: false });
    const result = await evaluatePhotoEnhancerSpecialist({
      propertyIds: [1],
      originatedFrom: "specialist-page",
      route: "specialist-page:test",
    });
    expect(result.style).toBe("architectural-exterior");
  });

  it("promptTemplateApplied is true when specialist config has a non-empty promptTemplate", async () => {
    mockedStorage.getSpecialistConfig.mockResolvedValue({
      runtimeConfig: {},
      promptTemplate: "Brighten and sharpen for luxury presentation.",
      modelResourceId: null,
    });
    mockedRun.mockResolvedValue({ specialistRunId: 1, objectPath: "x.jpg", usedFallback: false });
    const result = await evaluatePhotoEnhancerSpecialist({
      propertyIds: [1],
      originatedFrom: "specialist-page",
      route: "specialist-page:test",
    });
    expect(result.promptTemplateApplied).toBe(true);
  });

  it("modelResourceId from specialist config is propagated to the batch summary", async () => {
    mockedStorage.getSpecialistConfig.mockResolvedValue({
      runtimeConfig: {},
      promptTemplate: "",
      modelResourceId: 7,
    });
    mockedRun.mockResolvedValue({ specialistRunId: 1, objectPath: "x.jpg", usedFallback: false });
    const result = await evaluatePhotoEnhancerSpecialist({
      propertyIds: [1],
      originatedFrom: "specialist-page",
      route: "specialist-page:test",
    });
    expect(result.modelResourceId).toBe(7);
  });
});

// ─── catalog ─────────────────────────────────────────────────────────────────

describe("Photo Enhancer G7 — catalog", () => {
  const entry = SPECIALIST_CATALOG.find((s) => s.id === "photos.photo-enhancer")!;

  it("photos.photo-enhancer status is built", () => {
    expect(entry).toBeDefined();
    expect(entry.status).toBe("built");
  });

  it("catalog entry has correct letter, subject, and humanName", () => {
    expect(entry.letter).toBe("F");
    expect(entry.subject).toBe("photos");
    expect(entry.humanName).toBe("Fernanda");
  });
});
