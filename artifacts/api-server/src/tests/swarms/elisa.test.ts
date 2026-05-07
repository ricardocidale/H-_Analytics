/**
 * Elisa swarm team — Unit 5 tests.
 *
 * Three layers:
 *   1. runElisaReader — deterministic, no mocks needed
 *   2. runElisaBuilder — mocked Anthropic client
 *   3. runElisaInspector — mocked Anthropic client + storage provider
 *   4. runElisaTeam — integration via mocked sub-agents
 *
 * Test scenarios:
 *   - Happy path: valid Lucca drafts → well-formed Slide5Payload with
 *     transformationDescription and transformationRows (4 rows with provenance)
 *   - Builder: transformationRows fall back to own JSON parser when LLM returns null
 *   - Builder: respects char limits (truncates description and row fields)
 *   - Builder edge — empty: no drafts → empty payload
 *   - Inspector Pass 1 blocks malformed payload
 *   - Inspector Pass 2: ok / block / skip-when-png-unavailable
 *   - Team: happy path, builder error → fail, inspector block → block
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("../../ai/clients", () => ({
  getAnthropicClient: vi.fn(),
}));

vi.mock("../../providers/storage", () => ({
  getStorageProviderAsync: vi.fn(),
}));

vi.mock("../../logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { getAnthropicClient } from "../../ai/clients";
import { getStorageProviderAsync } from "../../providers/storage";
import { runElisaReader } from "../../slides/swarms/elisa/reader";
import { runElisaBuilder } from "../../slides/swarms/elisa/builder";
import { runElisaInspector } from "../../slides/swarms/elisa/inspector";
import { runElisaTeam } from "../../slides/swarms/elisa/index";
import type { SlideTeamInput } from "../../slides/swarms/types";
import type { LuccaSlotDraft } from "@workspace/db";
import {
  SLIDE5_TRANSFORMATION_DESCRIPTION_MAX,
  SLIDE5_TRANSFORMATION_ROW_FEATURE_MAX,
  SLIDE5_TRANSFORMATION_ROW_EXISTING_MAX,
  SLIDE5_TRANSFORMATION_ROW_PROPOSED_MAX,
} from "@shared/deck-payload-v2";

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeDraft(value: string, approved = true): LuccaSlotDraft {
  return {
    value,
    approved,
    approvedAt: approved ? "2026-05-07T00:00:00.000Z" : null,
    source: "lucca",
  };
}

function makeInput(overrides: Partial<SlideTeamInput> = {}): SlideTeamInput {
  return {
    runId: 1,
    slideNumber: 5,
    slotDrafts: {},
    financialInputs: null,
    canonicalPngKey: "canonical/lb-6-slide/slides/slide-5.png",
    briefR2Key: null,
    ...overrides,
  };
}

function makeAnthropicMock(toolName: string, toolInput: Record<string, unknown>) {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [
          {
            type: "tool_use",
            id: "tu_test",
            name: toolName,
            input: toolInput,
          },
        ],
        stop_reason: "tool_use",
      }),
    },
  };
}

function makeStorageMock(pngBuffer: Buffer = Buffer.from("png-data")) {
  return {
    downloadBuffer: vi.fn().mockResolvedValue({ buffer: pngBuffer }),
  };
}

const SAMPLE_ROWS = [
  { feature: "Pool", existing: "No pool", proposed: "Heated rooftop pool with cabanas" },
  { feature: "Lobby", existing: "Dated decor", proposed: "Modern design with local art" },
  { feature: "Restaurant", existing: "Limited menu", proposed: "Farm-to-table dining concept" },
  { feature: "Fitness", existing: "Basic gym", proposed: "Full wellness center + spa" },
];

// ── Elisa-01 Reader tests ─────────────────────────────────────────────────────

describe("runElisaReader", () => {
  it("segregates approved vs. unapproved drafts", () => {
    const out = runElisaReader(
      makeInput({
        slotDrafts: {
          "slide5.transformationDescription": makeDraft("A transformation story", true),
          "slide5.transformationRows": makeDraft(JSON.stringify(SAMPLE_ROWS), false),
        },
      }),
    );
    expect(Object.keys(out.approvedDrafts)).toEqual(["slide5.transformationDescription"]);
    expect(Object.keys(out.allDrafts)).toHaveLength(2);
  });

  it("returns empty maps when no drafts provided", () => {
    const out = runElisaReader(makeInput());
    expect(out.approvedDrafts).toEqual({});
    expect(out.allDrafts).toEqual({});
  });

  it("passes canonicalPngKey through", () => {
    const out = runElisaReader(makeInput());
    expect(out.canonicalPngKey).toBe("canonical/lb-6-slide/slides/slide-5.png");
  });
});

// ── Elisa-02 Builder tests ────────────────────────────────────────────────────

describe("runElisaBuilder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("happy path: approved drafts → well-formed Slide5Payload with rows and provenance", async () => {
    const anthropic = makeAnthropicMock("emit_slide5_payload", {
      transformationDescription: "A compelling transformation investment thesis",
      transformationRows: SAMPLE_ROWS,
    });
    (getAnthropicClient as Mock).mockReturnValue(anthropic);

    const readerOutput = runElisaReader(
      makeInput({
        slotDrafts: {
          "slide5.transformationDescription": makeDraft(
            "A compelling transformation investment thesis",
          ),
          "slide5.transformationRows": makeDraft(JSON.stringify(SAMPLE_ROWS)),
        },
      }),
    );

    const payload = await runElisaBuilder(readerOutput);

    expect(payload.transformationDescription?.text).toBe(
      "A compelling transformation investment thesis",
    );
    expect(payload.transformationRows).toHaveLength(SAMPLE_ROWS.length);
    expect(payload.transformationRows?.[0].feature.text).toBe("Pool");
    expect(payload.transformationRows?.[0].existing.text).toBe("No pool");
    expect(payload.transformationRows?.[0].proposed.text).toBe(
      "Heated rooftop pool with cabanas",
    );
    expect(payload.transformationRows?.[0].feature.provenance.source).toBe("llm");
    expect(payload.transformationDescription?.provenance.source).toBe("llm");
  });

  it("edge — empty: no drafts → empty payload", async () => {
    const anthropic = makeAnthropicMock("emit_slide5_payload", {
      transformationDescription: null,
      transformationRows: null,
    });
    (getAnthropicClient as Mock).mockReturnValue(anthropic);

    const readerOutput = runElisaReader(makeInput());
    const payload = await runElisaBuilder(readerOutput);

    expect(payload.transformationDescription).toBeUndefined();
    expect(payload.transformationRows).toBeUndefined();
  });

  it("respects character limits by truncating all fields", async () => {
    const longDesc = "x".repeat(500);
    const longFeature = "f".repeat(100);
    const longExisting = "e".repeat(120);
    const longProposed = "p".repeat(150);
    const anthropic = makeAnthropicMock("emit_slide5_payload", {
      transformationDescription: longDesc,
      transformationRows: [
        { feature: longFeature, existing: longExisting, proposed: longProposed },
      ],
    });
    (getAnthropicClient as Mock).mockReturnValue(anthropic);

    const readerOutput = runElisaReader(
      makeInput({
        slotDrafts: {
          "slide5.transformationDescription": makeDraft(longDesc),
          "slide5.transformationRows": makeDraft(
            JSON.stringify([{ feature: longFeature, existing: longExisting, proposed: longProposed }]),
          ),
        },
      }),
    );

    const payload = await runElisaBuilder(readerOutput);
    expect(payload.transformationDescription!.text.length).toBeLessThanOrEqual(
      SLIDE5_TRANSFORMATION_DESCRIPTION_MAX,
    );
    expect(payload.transformationRows![0].feature.text.length).toBeLessThanOrEqual(
      SLIDE5_TRANSFORMATION_ROW_FEATURE_MAX,
    );
    expect(payload.transformationRows![0].existing.text.length).toBeLessThanOrEqual(
      SLIDE5_TRANSFORMATION_ROW_EXISTING_MAX,
    );
    expect(payload.transformationRows![0].proposed.text.length).toBeLessThanOrEqual(
      SLIDE5_TRANSFORMATION_ROW_PROPOSED_MAX,
    );
  });

  it("falls back to own JSON parser when Builder returns null rows but draft exists", async () => {
    const anthropic = makeAnthropicMock("emit_slide5_payload", {
      transformationDescription: null,
      transformationRows: null,
    });
    (getAnthropicClient as Mock).mockReturnValue(anthropic);

    const readerOutput = runElisaReader(
      makeInput({
        slotDrafts: {
          "slide5.transformationRows": makeDraft(JSON.stringify(SAMPLE_ROWS)),
        },
      }),
    );

    const payload = await runElisaBuilder(readerOutput);
    expect(payload.transformationRows).toHaveLength(SAMPLE_ROWS.length);
    expect(payload.transformationRows?.[0].feature.text).toBe("Pool");
  });
});

// ── Elisa-03 Inspector tests ──────────────────────────────────────────────────

describe("runElisaInspector", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Pass 1 blocks on malformed payload", async () => {
    const malformed = {
      transformationDescription: { text: "x".repeat(500) }, // too long, provenance missing
    } as unknown as import("@shared/deck-payload-v2").Slide5Payload;

    const verdict = await runElisaInspector(
      malformed,
      "canonical/lb-6-slide/slides/slide-5.png",
    );
    expect(verdict.status).toBe("block");
    expect(verdict.notes).toMatch(/schema/i);
  });

  it("Pass 2 returns ok on LLM approval", async () => {
    const anthropic = makeAnthropicMock("report_inspection_verdict", {
      approved: true,
      notes: null,
    });
    (getAnthropicClient as Mock).mockReturnValue(anthropic);
    (getStorageProviderAsync as Mock).mockResolvedValue(makeStorageMock());

    const payload: import("@shared/deck-payload-v2").Slide5Payload = {
      transformationDescription: {
        text: "A compelling transformation thesis",
        provenance: { source: "llm", updatedAt: "2026-05-07T00:00:00.000Z" },
      },
    };

    const verdict = await runElisaInspector(
      payload,
      "canonical/lb-6-slide/slides/slide-5.png",
    );
    expect(verdict.status).toBe("ok");
    expect(verdict.notes).toBeNull();
  });

  it("Pass 2 returns block on LLM rejection", async () => {
    const anthropic = makeAnthropicMock("report_inspection_verdict", {
      approved: false,
      notes: "Transformation description is too vague",
    });
    (getAnthropicClient as Mock).mockReturnValue(anthropic);
    (getStorageProviderAsync as Mock).mockResolvedValue(makeStorageMock());

    const payload: import("@shared/deck-payload-v2").Slide5Payload = {
      transformationDescription: {
        text: "Some changes",
        provenance: { source: "llm", updatedAt: "2026-05-07T00:00:00.000Z" },
      },
    };

    const verdict = await runElisaInspector(
      payload,
      "canonical/lb-6-slide/slides/slide-5.png",
    );
    expect(verdict.status).toBe("block");
    expect(verdict.notes).toBe("Transformation description is too vague");
  });

  it("Pass 2 defaults to ok when canonical PNG unavailable", async () => {
    (getStorageProviderAsync as Mock).mockResolvedValue({
      downloadBuffer: vi.fn().mockRejectedValue(new Error("R2 unavailable")),
    });

    const payload: import("@shared/deck-payload-v2").Slide5Payload = {};
    const verdict = await runElisaInspector(
      payload,
      "canonical/lb-6-slide/slides/slide-5.png",
    );
    expect(verdict.status).toBe("ok");
  });
});

// ── runElisaTeam integration tests ──────────────────────────────────────────

describe("runElisaTeam", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("happy path: all approvals → status ok", async () => {
    (getAnthropicClient as Mock)
      .mockReturnValueOnce(
        makeAnthropicMock("emit_slide5_payload", {
          transformationDescription: "A portfolio transformation story",
          transformationRows: SAMPLE_ROWS,
        }),
      )
      .mockReturnValueOnce(
        makeAnthropicMock("report_inspection_verdict", { approved: true, notes: null }),
      );
    (getStorageProviderAsync as Mock).mockResolvedValue(makeStorageMock());

    const out = await runElisaTeam(
      makeInput({
        slotDrafts: {
          "slide5.transformationDescription": makeDraft("A portfolio transformation story"),
          "slide5.transformationRows": makeDraft(JSON.stringify(SAMPLE_ROWS)),
        },
      }),
    );

    expect(out.slideNumber).toBe(5);
    expect(out.status).toBe("ok");
    expect(out.payloadV2).toBeDefined();
  });

  it("builder error → status fail", async () => {
    (getAnthropicClient as Mock).mockReturnValue({
      messages: { create: vi.fn().mockRejectedValue(new Error("LLM error")) },
    });

    const out = await runElisaTeam(makeInput());
    expect(out.status).toBe("fail");
    expect(out.notes).toMatch(/builder error/i);
  });

  it("inspector block → status block propagated", async () => {
    (getAnthropicClient as Mock)
      .mockReturnValueOnce(
        makeAnthropicMock("emit_slide5_payload", {
          transformationDescription: "Vague plan",
          transformationRows: SAMPLE_ROWS,
        }),
      )
      .mockReturnValueOnce(
        makeAnthropicMock("report_inspection_verdict", {
          approved: false,
          notes: "Copy too generic for investor presentation",
        }),
      );
    (getStorageProviderAsync as Mock).mockResolvedValue(makeStorageMock());

    const out = await runElisaTeam(
      makeInput({
        slotDrafts: {
          "slide5.transformationDescription": makeDraft("Vague plan"),
          "slide5.transformationRows": makeDraft(JSON.stringify(SAMPLE_ROWS)),
        },
      }),
    );

    expect(out.status).toBe("block");
    expect(out.notes).toBe("Copy too generic for investor presentation");
  });
});
