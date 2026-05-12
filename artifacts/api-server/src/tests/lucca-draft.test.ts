/**
 * Lucca draft pipeline — Unit 4b tests.
 *
 * Uses vi.mock to stub getAnthropicClient() and storage.getProperty()
 * so tests run fully offline.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

// ── Mocks (must be declared before any import that triggers the modules) ─────

vi.mock("../ai/clients", () => ({
  getAnthropicClient: vi.fn(),
}));

vi.mock("../storage", () => ({
  storage: {
    getProperty: vi.fn(),
  },
}));

vi.mock("../storage/slide-factory-runs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../storage/slide-factory-runs")>();
  return {
    ...actual,
    getSlideFactoryRunById: vi.fn(),
    updateSlideFactoryRun: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("../logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("../slides/factory-v2-llm-resolver", () => ({
  resolveLorenzoVisionModelId: vi.fn().mockResolvedValue("test-model-id"),
}));

import { getAnthropicClient } from "../ai/clients";
import { storage } from "../storage";
import { getSlideFactoryRunById, updateSlideFactoryRun } from "../storage/slide-factory-runs";
import { runLuccaDraft } from "../slides/lucca-draft";
import {
  SLIDE1_HEADER_SUBTITLE_MAX,
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
    renovationScope: "Full gut renovation",
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
  return {
    type: "tool_use" as const,
    id: "tool_1",
    name,
    input,
  };
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildMultiGroupMock() {
  return {
    messages: {
      create: vi.fn()
        .mockResolvedValueOnce({ content: [makeToolBlock("draft_vision", makeVisionInput())] })
        .mockResolvedValueOnce({ content: [makeToolBlock("draft_operational", makeOperationalInput())] })
        .mockResolvedValueOnce({ content: [makeToolBlock("draft_investment", makeInvestmentInput())] })
        .mockResolvedValueOnce({ content: [makeToolBlock("draft_transformation", makeTransformationInput())] }),
    },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("runLuccaDraft", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("happy path — drafts all 4 groups and writes 15 slot keys", async () => {
    (getSlideFactoryRunById as Mock).mockResolvedValue(makeRun());
    (storage.getProperty as Mock).mockResolvedValue(makeProperty());
    (getAnthropicClient as Mock).mockReturnValue(buildMultiGroupMock());

    await runLuccaDraft(42);

    expect(updateSlideFactoryRun).toHaveBeenCalledOnce();
    const [, patch] = (updateSlideFactoryRun as Mock).mock.calls[0];

    expect(patch.status).toBe("draft_review");

    const draft = patch.luccaDraft as Record<string, { value: string; source: string; approved: boolean }>;

    // 2 vision + 3 operational + 4 investment + 6 transformation (desc + aggregate + 4 individual)
    const TOTAL_SLOT_KEYS = 15;
    expect(Object.keys(draft)).toHaveLength(TOTAL_SLOT_KEYS);

    // Spot-check serialization
    expect(draft["slide1.visionBullets"].value).toContain("• Vision bullet 1");
    expect(draft["slide3.reasons"].value).toContain("Reason 1: Supporting detail for reason 1.");
    expect(draft["slide5.transformationRows"].value).toContain("Feature 1 | Current state 1 | Proposed state 1");
    expect(draft["slide5.transformationRows[2]"].value).toBe("Feature 3 | Current state 3 | Proposed state 3");

    expect(draft["slide1.headerSubtitle"].source).toBe("lucca");
    expect(draft["slide1.headerSubtitle"].approved).toBe(false);
  });

  it("null propertyId for a group — produces empty stubs for that group", async () => {
    (getSlideFactoryRunById as Mock).mockResolvedValue(makeRun({ slide1PropertyId: null }));
    (storage.getProperty as Mock).mockResolvedValue(makeProperty());
    (getAnthropicClient as Mock).mockReturnValue({
      messages: {
        create: vi.fn()
          .mockResolvedValueOnce({ content: [makeToolBlock("draft_operational", makeOperationalInput())] })
          .mockResolvedValueOnce({ content: [makeToolBlock("draft_investment", makeInvestmentInput())] })
          .mockResolvedValueOnce({ content: [makeToolBlock("draft_transformation", makeTransformationInput())] }),
      },
    });

    await runLuccaDraft(42);

    const [, patch] = (updateSlideFactoryRun as Mock).mock.calls[0];
    const draft = patch.luccaDraft as Record<string, { value: string }>;

    expect(draft["slide1.headerSubtitle"].value).toBe("");
    expect(draft["slide1.visionBullets"].value).toBe("");
    expect(draft["slide2.operationalModelText"].value).not.toBe("");
  });

  it("no tool block returned — produces empty stubs for that group, continues others", async () => {
    (getSlideFactoryRunById as Mock).mockResolvedValue(makeRun());
    (storage.getProperty as Mock).mockResolvedValue(makeProperty());
    (getAnthropicClient as Mock).mockReturnValue({
      messages: {
        create: vi.fn()
          .mockResolvedValueOnce({ content: [] })  // vision: no tool block
          .mockResolvedValueOnce({ content: [makeToolBlock("draft_operational", makeOperationalInput())] })
          .mockResolvedValueOnce({ content: [makeToolBlock("draft_investment", makeInvestmentInput())] })
          .mockResolvedValueOnce({ content: [makeToolBlock("draft_transformation", makeTransformationInput())] }),
      },
    });

    await runLuccaDraft(42);

    const [, patch] = (updateSlideFactoryRun as Mock).mock.calls[0];
    const draft = patch.luccaDraft as Record<string, { value: string }>;

    expect(draft["slide1.headerSubtitle"].value).toBe("");
    expect(draft["slide1.visionBullets"].value).toBe("");
    expect(draft["slide2.operationalModelText"].value).not.toBe("");
    expect(patch.status).toBe("draft_review");
  });

  it("over-budget validation failure — slot gets empty value, run still reaches draft_review", async () => {
    const overBudgetHeader = "X".repeat(SLIDE1_HEADER_SUBTITLE_MAX + 1);
    (getSlideFactoryRunById as Mock).mockResolvedValue(makeRun());
    (storage.getProperty as Mock).mockResolvedValue(makeProperty());
    (getAnthropicClient as Mock).mockReturnValue({
      messages: {
        create: vi.fn()
          .mockResolvedValueOnce({
            content: [makeToolBlock("draft_vision", {
              headerSubtitle: { text: overBudgetHeader },
              visionBullets: {
                bullets: Array.from({ length: SLIDE1_VISION_BULLETS_COUNT }, (_, i) => ({
                  text: `Bullet ${i + 1}`,
                })),
              },
            })],
          })
          .mockResolvedValueOnce({ content: [makeToolBlock("draft_operational", makeOperationalInput())] })
          .mockResolvedValueOnce({ content: [makeToolBlock("draft_investment", makeInvestmentInput())] })
          .mockResolvedValueOnce({ content: [makeToolBlock("draft_transformation", makeTransformationInput())] }),
      },
    });

    await runLuccaDraft(42);

    const [, patch] = (updateSlideFactoryRun as Mock).mock.calls[0];
    const draft = patch.luccaDraft as Record<string, { value: string }>;

    expect(draft["slide1.headerSubtitle"].value).toBe("");
    expect(draft["slide1.visionBullets"].value).toContain("• Bullet 1");
    expect(patch.status).toBe("draft_review");
  });

  it("run not found — sets status to error", async () => {
    (getSlideFactoryRunById as Mock).mockResolvedValue(null);
    (getAnthropicClient as Mock).mockReturnValue(buildMultiGroupMock());

    await runLuccaDraft(99);

    expect(updateSlideFactoryRun).toHaveBeenCalledWith(99, { status: "error" });
  });
});
