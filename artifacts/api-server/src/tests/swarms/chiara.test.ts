/**
 * Chiara swarm team — Unit 5 tests.
 *
 * Three layers:
 *   1. runChiaraReader — deterministic, no mocks needed
 *   2. runChiaraBuilder — mocked Anthropic client
 *   3. runChiaraInspector — mocked Anthropic client + storage provider
 *   4. runChiaraTeam — integration via mocked sub-agents
 *
 * Test scenarios:
 *   - Happy path: valid Lucca drafts → well-formed Slide3Payload + ok verdict
 *   - Edge — empty Lucca slot: no drafts → empty payload + ok verdict (Pass 2 skip)
 *   - Builder: reasons fall back to own JSON parser when LLM returns null but draft exists
 *   - Builder: respects char limits (truncates each field and each reason label/detail)
 *   - Inspector Pass 1 blocks malformed payload
 *   - Inspector Pass 2: ok/block/skip-when-png-unavailable
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

vi.mock("../../slides/factory-v2-llm-resolver", () => ({
  resolveLorenzoVisionModelId: vi.fn().mockResolvedValue("test-model-id"),
}));

import { getAnthropicClient } from "../../ai/clients";
import { getStorageProviderAsync } from "../../providers/storage";
import { runChiaraReader } from "../../slides/swarms/chiara/reader";
import { runChiaraBuilder } from "../../slides/swarms/chiara/builder";
import { runChiaraInspector } from "../../slides/swarms/chiara/inspector";
import { runChiaraTeam } from "../../slides/swarms/chiara/index";
import type { SlideTeamInput } from "../../slides/swarms/types";
import type { LuccaSlotDraft } from "@workspace/db";

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
    slideNumber: 3,
    slotDrafts: {},
    financialInputs: null,
    canonicalPngKey: "canonical/lb-6-slide/slides/slide-3.png",
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

const SAMPLE_REASONS_JSON =
  '[{"label":"Prime Location","detail":"Heart of Barrio San Diego with colonial architecture access"},{"label":"Revenue Model","detail":"Dual-unit setup maximizes STR yield and arbitrage"},{"label":"Scarcity","detail":"Only 12 comparable duplex conversions in the historic district"}]';

// ── Chiara-01 Reader tests ─────────────────────────────────────────────────────

describe("runChiaraReader", () => {
  it("segregates approved vs. unapproved drafts", () => {
    const out = runChiaraReader(
      makeInput({
        slotDrafts: {
          "slide3.conceptParagraph": makeDraft("A colonial duplex concept", true),
          "slide3.marketRationale": makeDraft("Why Cartagena is compelling", false),
        },
      }),
    );
    expect(Object.keys(out.approvedDrafts)).toEqual(["slide3.conceptParagraph"]);
    expect(Object.keys(out.allDrafts)).toHaveLength(2);
  });

  it("returns empty maps when no drafts provided", () => {
    const out = runChiaraReader(makeInput());
    expect(out.approvedDrafts).toEqual({});
    expect(out.allDrafts).toEqual({});
  });

  it("passes canonicalPngKey through", () => {
    const out = runChiaraReader(makeInput());
    expect(out.canonicalPngKey).toBe("canonical/lb-6-slide/slides/slide-3.png");
  });
});

// ── Chiara-02 Builder tests ────────────────────────────────────────────────────

describe("runChiaraBuilder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("happy path: approved drafts → well-formed Slide3Payload", async () => {
    const anthropic = makeAnthropicMock("emit_slide3_payload", {
      conceptParagraph: "A historic duplex in Barrio San Diego, Cartagena.",
      marketRationale: "Cartagena is Colombia's top STR market with 90%+ occupancy.",
      reasons: [
        { label: "Prime Location", detail: "Heart of the colonial district" },
        { label: "Revenue Model", detail: "Dual-unit STR arbitrage" },
        { label: "Scarcity", detail: "Only 12 comparable conversions" },
      ],
      closingLine: "The only duplex investment in historic Cartagena at this price point.",
    });
    (getAnthropicClient as Mock).mockReturnValue(anthropic);

    const readerOutput = runChiaraReader(
      makeInput({
        slotDrafts: {
          "slide3.conceptParagraph": makeDraft("A historic duplex in Barrio San Diego, Cartagena."),
          "slide3.marketRationale": makeDraft(
            "Cartagena is Colombia's top STR market with 90%+ occupancy.",
          ),
          "slide3.reasons": makeDraft(SAMPLE_REASONS_JSON),
          "slide3.closingLine": makeDraft(
            "The only duplex investment in historic Cartagena at this price point.",
          ),
        },
      }),
    );

    const payload = await runChiaraBuilder(readerOutput);

    expect(payload.conceptParagraph?.text).toBe(
      "A historic duplex in Barrio San Diego, Cartagena.",
    );
    expect(payload.marketRationale?.text).toBe(
      "Cartagena is Colombia's top STR market with 90%+ occupancy.",
    );
    expect(payload.reasons).toHaveLength(3);
    expect(payload.reasons?.[0].label.text).toBe("Prime Location");
    expect(payload.reasons?.[0].detail.text).toBe("Heart of the colonial district");
    expect(payload.closingLine?.text).toBe(
      "The only duplex investment in historic Cartagena at this price point.",
    );
    expect(payload.conceptParagraph?.provenance.source).toBe("llm");
    expect(payload.reasons?.[0].label.provenance.source).toBe("llm");
  });

  it("edge — empty Lucca slot: no drafts → empty payload", async () => {
    const anthropic = makeAnthropicMock("emit_slide3_payload", {
      conceptParagraph: null,
      marketRationale: null,
      reasons: null,
      closingLine: null,
    });
    (getAnthropicClient as Mock).mockReturnValue(anthropic);

    const readerOutput = runChiaraReader(makeInput());
    const payload = await runChiaraBuilder(readerOutput);

    expect(payload.conceptParagraph).toBeUndefined();
    expect(payload.marketRationale).toBeUndefined();
    expect(payload.reasons).toBeUndefined();
    expect(payload.closingLine).toBeUndefined();
  });

  it("falls back to own JSON parser when Builder returns null reasons but draft exists", async () => {
    const anthropic = makeAnthropicMock("emit_slide3_payload", {
      conceptParagraph: null,
      marketRationale: null,
      reasons: null,
      closingLine: null,
    });
    (getAnthropicClient as Mock).mockReturnValue(anthropic);

    const readerOutput = runChiaraReader(
      makeInput({
        slotDrafts: {
          "slide3.reasons": makeDraft(SAMPLE_REASONS_JSON),
        },
      }),
    );

    const payload = await runChiaraBuilder(readerOutput);
    expect(payload.reasons).toHaveLength(3);
    expect(payload.reasons?.[0].label.text).toBe("Prime Location");
    expect(payload.reasons?.[1].label.text).toBe("Revenue Model");
    expect(payload.reasons?.[2].label.text).toBe("Scarcity");
  });

  it("respects char limits by truncating fields and reason label/detail", async () => {
    const longText = "x".repeat(400);
    const longLabel = "L".repeat(100);
    const longDetail = "D".repeat(300);
    const anthropic = makeAnthropicMock("emit_slide3_payload", {
      conceptParagraph: longText,
      marketRationale: longText,
      reasons: [{ label: longLabel, detail: longDetail }],
      closingLine: longText,
    });
    (getAnthropicClient as Mock).mockReturnValue(anthropic);

    const readerOutput = runChiaraReader(
      makeInput({
        slotDrafts: {
          "slide3.conceptParagraph": makeDraft(longText),
          "slide3.marketRationale": makeDraft(longText),
          "slide3.reasons": makeDraft(
            JSON.stringify([{ label: longLabel, detail: longDetail }]),
          ),
          "slide3.closingLine": makeDraft(longText),
        },
      }),
    );

    const payload = await runChiaraBuilder(readerOutput);
    expect(payload.conceptParagraph!.text.length).toBeLessThanOrEqual(320);
    expect(payload.marketRationale!.text.length).toBeLessThanOrEqual(320);
    expect(payload.reasons![0].label.text.length).toBeLessThanOrEqual(60);
    expect(payload.reasons![0].detail.text.length).toBeLessThanOrEqual(200);
    expect(payload.closingLine!.text.length).toBeLessThanOrEqual(200);
  });
});

// ── Chiara-03 Inspector tests ──────────────────────────────────────────────────

describe("runChiaraInspector", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Pass 1 blocks on malformed payload", async () => {
    const malformed = {
      conceptParagraph: { text: "x".repeat(400) }, // too long, provenance missing
    } as unknown as import("@shared/deck-payload-v2").Slide3Payload;

    const verdict = await runChiaraInspector(
      malformed,
      "canonical/lb-6-slide/slides/slide-3.png",
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

    const payload: import("@shared/deck-payload-v2").Slide3Payload = {
      conceptParagraph: {
        text: "A historic duplex in Barrio San Diego.",
        provenance: { source: "llm", updatedAt: "2026-05-07T00:00:00.000Z" },
      },
    };

    const verdict = await runChiaraInspector(
      payload,
      "canonical/lb-6-slide/slides/slide-3.png",
    );
    expect(verdict.status).toBe("ok");
    expect(verdict.notes).toBeNull();
  });

  it("Pass 2 returns block on LLM rejection", async () => {
    const anthropic = makeAnthropicMock("report_inspection_verdict", {
      approved: false,
      notes: "Concept paragraph lacks investment thesis specificity",
    });
    (getAnthropicClient as Mock).mockReturnValue(anthropic);
    (getStorageProviderAsync as Mock).mockResolvedValue(makeStorageMock());

    const payload: import("@shared/deck-payload-v2").Slide3Payload = {
      conceptParagraph: {
        text: "Great property",
        provenance: { source: "llm", updatedAt: "2026-05-07T00:00:00.000Z" },
      },
    };

    const verdict = await runChiaraInspector(
      payload,
      "canonical/lb-6-slide/slides/slide-3.png",
    );
    expect(verdict.status).toBe("block");
    expect(verdict.notes).toBe("Concept paragraph lacks investment thesis specificity");
  });

  it("Pass 2 defaults to ok when canonical PNG unavailable", async () => {
    (getStorageProviderAsync as Mock).mockResolvedValue({
      downloadBuffer: vi.fn().mockRejectedValue(new Error("R2 unavailable")),
    });

    const payload: import("@shared/deck-payload-v2").Slide3Payload = {};
    const verdict = await runChiaraInspector(
      payload,
      "canonical/lb-6-slide/slides/slide-3.png",
    );
    expect(verdict.status).toBe("ok");
  });
});

// ── runChiaraTeam integration tests ──────────────────────────────────────────

describe("runChiaraTeam", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("happy path: all approvals → status ok", async () => {
    (getAnthropicClient as Mock)
      .mockReturnValueOnce(
        makeAnthropicMock("emit_slide3_payload", {
          conceptParagraph: "Colonial duplex concept.",
          marketRationale: "Cartagena market rationale.",
          reasons: [
            { label: "Location", detail: "Prime district" },
            { label: "Revenue", detail: "STR arbitrage" },
            { label: "Scarcity", detail: "Limited supply" },
          ],
          closingLine: "A unique Cartagena opportunity.",
        }),
      )
      .mockReturnValueOnce(
        makeAnthropicMock("report_inspection_verdict", { approved: true, notes: null }),
      );
    (getStorageProviderAsync as Mock).mockResolvedValue(makeStorageMock());

    const out = await runChiaraTeam(
      makeInput({
        slotDrafts: {
          "slide3.conceptParagraph": makeDraft("Colonial duplex concept."),
          "slide3.marketRationale": makeDraft("Cartagena market rationale."),
          "slide3.reasons": makeDraft(SAMPLE_REASONS_JSON),
          "slide3.closingLine": makeDraft("A unique Cartagena opportunity."),
        },
      }),
    );

    expect(out.slideNumber).toBe(3);
    expect(out.status).toBe("ok");
    expect(out.payloadV2).toBeDefined();
  });

  it("builder error → status fail", async () => {
    (getAnthropicClient as Mock).mockReturnValue({
      messages: { create: vi.fn().mockRejectedValue(new Error("LLM error")) },
    });

    const out = await runChiaraTeam(makeInput());
    expect(out.status).toBe("fail");
    expect(out.notes).toMatch(/builder error/i);
  });

  it("inspector block → status block propagated", async () => {
    (getAnthropicClient as Mock)
      .mockReturnValueOnce(
        makeAnthropicMock("emit_slide3_payload", {
          conceptParagraph: "OK text",
          marketRationale: "OK rationale",
          reasons: [{ label: "A", detail: "B" }],
          closingLine: "OK closing",
        }),
      )
      .mockReturnValueOnce(
        makeAnthropicMock("report_inspection_verdict", {
          approved: false,
          notes: "Copy too generic for investor audience",
        }),
      );
    (getStorageProviderAsync as Mock).mockResolvedValue(makeStorageMock());

    const out = await runChiaraTeam(
      makeInput({
        slotDrafts: {
          "slide3.conceptParagraph": makeDraft("OK text"),
          "slide3.marketRationale": makeDraft("OK rationale"),
          "slide3.reasons": makeDraft(SAMPLE_REASONS_JSON),
          "slide3.closingLine": makeDraft("OK closing"),
        },
      }),
    );

    expect(out.status).toBe("block");
    expect(out.notes).toBe("Copy too generic for investor audience");
  });
});
