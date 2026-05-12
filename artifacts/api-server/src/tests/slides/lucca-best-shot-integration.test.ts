/**
 * Lucca best-shot orchestration test — Factory v2 U8.
 *
 * End-to-end integration test of `runLuccaDraft` when a property is missing
 * Slide-5 transformation data. The verifications are the U8 plan's explicit
 * acceptance criteria:
 *
 *   - A run with intentionally missing Slide-3 transformation data
 *     [i.e., renovationScope + renovationBudget both empty] produces
 *     both a narrative slot text AND a `wishListLog` entry naming the gap.
 *
 * Lives in its own file so its `vi.mock` declarations (anthropic, storage,
 * slide-factory-runs) don't bleed into the pure detection-rules tests in
 * `lucca-best-shot.test.ts`.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

// ── Mocks (must be declared before any import that triggers the modules) ─────

vi.mock("../../ai/clients", () => ({
  getAnthropicClient: vi.fn(),
}));

vi.mock("../../storage", () => ({
  storage: {
    getProperty: vi.fn(),
  },
}));

vi.mock("../../storage/slide-factory-runs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../storage/slide-factory-runs")>();
  return {
    ...actual,
    getSlideFactoryRunById: vi.fn(),
    updateSlideFactoryRun: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("../../logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("../../slides/factory-v2-llm-resolver", () => ({
  resolveLorenzoVisionModelId: vi.fn().mockResolvedValue("test-model-id"),
}));

import { getAnthropicClient } from "../../ai/clients";
import { storage } from "../../storage";
import {
  getSlideFactoryRunById,
  updateSlideFactoryRun,
} from "../../storage/slide-factory-runs";
import { runLuccaDraft } from "../../slides/lucca-draft";
import {
  SLIDE1_VISION_BULLETS_COUNT,
  SLIDE3_REASONS_COUNT,
  SLIDE5_TRANSFORMATION_ROWS_COUNT,
} from "@shared/deck-payload-v2";

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeProperty(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 1,
    name: "The Ridgeline Inn",
    city: "Woodstock",
    stateProvince: "NY",
    county: "Ulster",
    country: "US",
    purchasePrice: 2_500_000,
    roomCount: 18,
    startAdr: 350,
    maxOccupancy: 0.72,
    businessModel: "hotel",
    hospitalityType: "boutique",
    qualityTier: "upscale",
    description: "Historic 1890s farmhouse converted into a boutique retreat.",
    acquisitionStatus: "pipeline",
    isHistoric: true,
    // Both transformation-scope fields intentionally empty to force best-shot
    // on the slide-5 slots.
    renovationScope: "",
    renovationBudget: 0,
    ...overrides,
  };
}

function makeRun(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 42,
    slide1PropertyId: 1,
    slide2PropertyId: 1,
    slide3PropertyId: 1,
    slide5PropertyId: 1,
    status: "drafting",
    ...overrides,
  };
}

function makeToolBlock(name: string, input: unknown) {
  return { type: "tool_use" as const, id: "tool_1", name, input };
}

function makeVisionInput() {
  return {
    headerSubtitle: { text: "Boutique escape in the Catskills" },
    visionBullets: {
      bullets: Array.from({ length: SLIDE1_VISION_BULLETS_COUNT }, (_, i) => ({
        text: `Vision bullet ${i + 1} — short enough to fit`,
      })),
    },
  };
}

function makeOperationalInput() {
  return {
    operationalModelText: { text: "Owner-operated boutique with direct-booking focus." },
    revenueBullet: { text: "ADR $350 at 72% stabilized occupancy." },
    programmingBullet: { text: "Curated wellness retreats and culinary experiences." },
  };
}

function makeInvestmentInput() {
  return {
    conceptParagraph: { text: "A rare repositioning opportunity in a surging drive market." },
    marketRationale: { text: "Catskills market sees 4.2M+ annual visitors." },
    reasons: {
      reasons: Array.from({ length: SLIDE3_REASONS_COUNT }, (_, i) => ({
        label: `Reason ${i + 1}`,
        detail: `Supporting detail for reason ${i + 1}.`,
      })),
    },
    closingLine: { text: "An exceptional entry into a proven market." },
  };
}

function makeTransformationInput() {
  return {
    transformationDescription: { text: "Full gut renovation preserving historic character." },
    transformationRows: {
      rows: Array.from({ length: SLIDE5_TRANSFORMATION_ROWS_COUNT }, (_, i) => ({
        feature: `Feature ${i + 1}`,
        existing: `Current state ${i + 1}`,
        proposed: `Proposed state ${i + 1}`,
      })),
    },
  };
}

/**
 * Best-shot tool response — uniform across slot keys, the integration test
 * only cares that the structured payload is consumed and the wishListLog is
 * surfaced. The draft shapes vary by slot key; this helper returns the
 * shape for the description slot.
 */
function makeBestShotDescriptionResponse(field: string, whyItHelps: string) {
  return {
    content: [
      makeToolBlock("emit_best_shot_slide5_transformation_description", {
        draft: {
          text:
            "Best-shot transformation narrative — plausible thesis using available property context.",
        },
        wishListLog: [{ field, whyItHelps }],
      }),
    ],
  };
}

function makeBestShotRowsResponse(field: string, whyItHelps: string) {
  return {
    content: [
      makeToolBlock("emit_best_shot_slide5_transformation_rows", {
        draft: {
          rows: Array.from({ length: SLIDE5_TRANSFORMATION_ROWS_COUNT }, (_, i) => ({
            feature: `Best-shot feature ${i + 1}`,
            existing: `Existing state ${i + 1}`,
            proposed: `Proposed state ${i + 1}`,
          })),
        },
        wishListLog: [{ field, whyItHelps }],
      }),
    ],
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("runLuccaDraft — U8 best-shot orchestration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it(
    "best-shot fires on Slide-5 transformation when renovationScope is empty, " +
      "producing a narrative slot AND a wishListLog entry",
    async () => {
      (getSlideFactoryRunById as Mock).mockResolvedValue(makeRun());
      (storage.getProperty as Mock).mockResolvedValue(makeProperty());

      const create = vi
        .fn()
        // 4 normal-path group calls (vision/operational/investment/transformation)
        .mockResolvedValueOnce({
          content: [makeToolBlock("draft_vision", makeVisionInput())],
        })
        .mockResolvedValueOnce({
          content: [makeToolBlock("draft_operational", makeOperationalInput())],
        })
        .mockResolvedValueOnce({
          content: [makeToolBlock("draft_investment", makeInvestmentInput())],
        })
        .mockResolvedValueOnce({
          content: [makeToolBlock("draft_transformation", makeTransformationInput())],
        })
        // Best-shot pass: 2 calls for the two transformation parent slots.
        // (The 4 row-child slot keys are skipped — see `runBestShotForSlot`.)
        .mockResolvedValueOnce(
          makeBestShotDescriptionResponse(
            "transformation_scope",
            "enables a sharper renovation thesis on slide 5",
          ),
        )
        .mockResolvedValueOnce(
          makeBestShotRowsResponse(
            "transformation_scope",
            "enables before/after table rows with concrete capex anchors",
          ),
        );

      (getAnthropicClient as Mock).mockReturnValue({
        messages: { create },
      });

      await runLuccaDraft(42);

      // Verify the update was the success path.
      expect(updateSlideFactoryRun).toHaveBeenCalled();
      const [, patch] = (updateSlideFactoryRun as Mock).mock.calls[0];
      expect(patch.status).toBe("draft_review");

      // Verify a narrative slot text was produced for both transformation
      // slots (best-shot draft, not the normal-path content).
      const draft = patch.luccaDraft as Record<string, { value: string }>;
      expect(draft["slide5.transformationDescription"].value).toContain(
        "Best-shot transformation narrative",
      );
      expect(draft["slide5.transformationRows"].value).toContain(
        "Best-shot feature 1",
      );

      // Per-row keys are repopulated from the parent best-shot output.
      expect(draft["slide5.transformationRows[0]"].value).toContain(
        "Best-shot feature 1",
      );

      // Verify the wishListLog entries surface.
      const wishListLog = patch.wishListLog as Array<{
        field: string;
        slot: string;
        slideNumber: number;
        whyItHelps: string;
      }>;
      expect(wishListLog.length).toBeGreaterThanOrEqual(1);
      const transformationEntry = wishListLog.find(
        (e) => e.field === "transformation_scope",
      );
      expect(transformationEntry).toBeDefined();
      expect(transformationEntry?.slideNumber).toBe(5);
      expect(transformationEntry?.slot).toMatch(/^slide5\./);
      expect(transformationEntry?.whyItHelps).toMatch(/renovation|capex|thesis/i);
    },
  );

  it("with full data, no wishListLog entries are written", async () => {
    (getSlideFactoryRunById as Mock).mockResolvedValue(makeRun());
    (storage.getProperty as Mock).mockResolvedValue(
      // Fully-populated property; renovationScope present satisfies the
      // transformation_scope rule via OR-semantics in the brief field map.
      makeProperty({ renovationScope: "Full gut renovation" }),
    );

    const create = vi
      .fn()
      .mockResolvedValueOnce({
        content: [makeToolBlock("draft_vision", makeVisionInput())],
      })
      .mockResolvedValueOnce({
        content: [makeToolBlock("draft_operational", makeOperationalInput())],
      })
      .mockResolvedValueOnce({
        content: [makeToolBlock("draft_investment", makeInvestmentInput())],
      })
      .mockResolvedValueOnce({
        content: [makeToolBlock("draft_transformation", makeTransformationInput())],
      });

    (getAnthropicClient as Mock).mockReturnValue({ messages: { create } });

    await runLuccaDraft(42);

    expect(updateSlideFactoryRun).toHaveBeenCalled();
    const [, patch] = (updateSlideFactoryRun as Mock).mock.calls[0];
    expect(patch.status).toBe("draft_review");
    expect(patch.wishListLog).toEqual([]);
  });

  it(
    "best-shot LLM error path — retries once, then leaves the existing draft " +
      "and writes no wishListLog entry for the failed slot",
    async () => {
      (getSlideFactoryRunById as Mock).mockResolvedValue(makeRun());
      (storage.getProperty as Mock).mockResolvedValue(makeProperty());

      const create = vi
        .fn()
        .mockResolvedValueOnce({
          content: [makeToolBlock("draft_vision", makeVisionInput())],
        })
        .mockResolvedValueOnce({
          content: [makeToolBlock("draft_operational", makeOperationalInput())],
        })
        .mockResolvedValueOnce({
          content: [makeToolBlock("draft_investment", makeInvestmentInput())],
        })
        .mockResolvedValueOnce({
          content: [makeToolBlock("draft_transformation", makeTransformationInput())],
        })
        // Best-shot description: both attempts throw.
        .mockRejectedValueOnce(new Error("network unavailable"))
        .mockRejectedValueOnce(new Error("network unavailable"))
        // Best-shot rows: succeeds.
        .mockResolvedValueOnce(
          makeBestShotRowsResponse("transformation_scope", "rows help frame capex"),
        );

      (getAnthropicClient as Mock).mockReturnValue({ messages: { create } });

      await runLuccaDraft(42);

      expect(updateSlideFactoryRun).toHaveBeenCalled();
      const [, patch] = (updateSlideFactoryRun as Mock).mock.calls[0];
      expect(patch.status).toBe("draft_review");

      // Description slot kept the normal-path value (best-shot failed silently).
      const draft = patch.luccaDraft as Record<string, { value: string }>;
      expect(draft["slide5.transformationDescription"].value).toContain(
        "Full gut renovation preserving historic character.",
      );

      // Rows slot was successfully best-shot replaced.
      expect(draft["slide5.transformationRows"].value).toContain(
        "Best-shot feature 1",
      );

      // wishListLog only contains the rows entry (description's failed
      // attempt didn't produce an entry).
      const wishListLog = patch.wishListLog as Array<{ field: string }>;
      expect(wishListLog).toHaveLength(1);
    },
  );
});
