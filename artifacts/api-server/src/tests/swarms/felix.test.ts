/**
 * Felix swarm team — Unit tests.
 *
 * Five layers:
 *   1. runFelixAggregate — deterministic, no mocks needed
 *   2. runFelixValidate — deterministic, no mocks needed
 *   3. runFelixFormat — deterministic, no mocks needed
 *   4. runFelixBuilder — mocked Anthropic client
 *   5. runFelixInspector — mocked Anthropic client + storage provider
 *   6. runFelixTeam — integration via mocked sub-agents
 *
 * Test scenarios:
 *   - Aggregator with null inputs → empty aggregation, usaliMode: true, projectionYears: 10
 *   - Aggregator with structured pass-through → returns input as-is
 *   - Validator: valid aggregation → valid: true
 *   - Validator: usaliMode false → valid: false
 *   - Validator: wrong projectionYears → valid: false, error contains year count
 *   - Formatter: converts numeric rows to string arrays
 *   - Builder: disclaimer present → Slide6Payload with disclaimer and provenance
 *   - Builder: no disclaimer → empty payload
 *   - Inspector Pass 1 blocks on malformed payload
 *   - Inspector Pass 2 returns ok on LLM approval
 *   - Inspector Pass 2 defaults to ok when PNG unavailable
 *   - Team happy path: full chain → ok
 *   - Team validator blocks → block (Builder never called)
 *   - Team builder error → fail
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
import { runFelixAggregate } from "../../slides/swarms/felix/aggregate";
import { runFelixValidate } from "../../slides/swarms/felix/validate";
import { runFelixFormat } from "../../slides/swarms/felix/format";
import { runFelixBuilder } from "../../slides/swarms/felix/builder";
import { runFelixInspector } from "../../slides/swarms/felix/inspector";
import { runFelixTeam } from "../../slides/swarms/felix/index";
import type { SlideTeamInput } from "../../slides/swarms/types";
import type { LuccaSlotDraft } from "@workspace/db";
import { SLIDE6_DISCLAIMER_MAX } from "@shared/deck-payload-v2";
import { FELIX_PROJECTION_YEARS } from "../../slides/deck-render-constants";

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
    slideNumber: 6,
    slotDrafts: {},
    financialInputs: null,
    canonicalPngKey: "canonical/lb-6-slide/slides/slide-6.png",
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

// ── Felix-01 Aggregator tests ─────────────────────────────────────────────────

describe("runFelixAggregate", () => {
  it("null financialInputs → empty aggregation with correct defaults", () => {
    const agg = runFelixAggregate(null);
    expect(agg.usaliRows).toEqual([]);
    expect(agg.usaliMode).toBe(true);
    expect(agg.projectionYears).toBe(FELIX_PROJECTION_YEARS);
  });

  it("structured financialInputs pass-through → returns input as FelixAggregateOutput", () => {
    const structured = {
      usaliRows: [{ label: "Revenue", values: [100000, 110000] }],
      projectionYears: FELIX_PROJECTION_YEARS,
      usaliMode: true,
    };
    const agg = runFelixAggregate(structured);
    expect(agg.usaliRows).toHaveLength(1);
    expect(agg.usaliRows[0].label).toBe("Revenue");
    expect(agg.projectionYears).toBe(FELIX_PROJECTION_YEARS);
    expect(agg.usaliMode).toBe(true);
  });
});

// ── Felix-03 Validator tests ──────────────────────────────────────────────────

describe("runFelixValidate", () => {
  it("valid aggregation → valid: true, error: null", () => {
    const agg = { usaliRows: [], projectionYears: FELIX_PROJECTION_YEARS, usaliMode: true };
    const result = runFelixValidate(agg);
    expect(result.valid).toBe(true);
    expect(result.error).toBeNull();
  });

  it("usaliMode false → valid: false", () => {
    const agg = { usaliRows: [], projectionYears: FELIX_PROJECTION_YEARS, usaliMode: false };
    const result = runFelixValidate(agg);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/usaliMode/);
  });

  it("wrong projectionYears → valid: false, error contains year count", () => {
    const wrongYears = 5;
    const agg = { usaliRows: [], projectionYears: wrongYears, usaliMode: true };
    const result = runFelixValidate(agg);
    expect(result.valid).toBe(false);
    expect(result.error).toContain(String(FELIX_PROJECTION_YEARS));
    expect(result.error).toContain(String(wrongYears));
  });
});

// ── Felix-04 Formatter tests ──────────────────────────────────────────────────

describe("runFelixFormat", () => {
  it("converts numeric rows to locale-formatted currency strings", () => {
    const agg = {
      usaliRows: [
        { label: "Revenue", values: [100000, 110000] },
        { label: "Expenses", values: [50000, 55000] },
      ],
      projectionYears: FELIX_PROJECTION_YEARS,
      usaliMode: true,
    };
    const result = runFelixFormat(agg);
    expect(result.formattedRows).toHaveLength(2);
    expect(result.formattedRows[0].label).toBe("Revenue");
    expect(result.formattedRows[0].values[0]).toMatch(/^\$100,000/);
    expect(result.formattedRows[1].label).toBe("Expenses");
  });
});

// ── Felix-02 Builder tests ────────────────────────────────────────────────────

describe("runFelixBuilder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("happy path: disclaimer draft present → Slide6Payload with disclaimer and provenance", async () => {
    const anthropic = makeAnthropicMock("emit_slide6_payload", {
      disclaimer: "Projections are forward-looking estimates and not guarantees.",
    });
    (getAnthropicClient as Mock).mockReturnValue(anthropic);

    const payload = await runFelixBuilder(
      makeInput({
        slotDrafts: {
          "slide6.disclaimer": makeDraft(
            "Projections are forward-looking estimates and not guarantees.",
          ),
        },
      }),
    );

    expect(payload.disclaimer?.text).toBe(
      "Projections are forward-looking estimates and not guarantees.",
    );
    expect(payload.disclaimer?.provenance.source).toBe("llm");
    expect(payload.disclaimer?.provenance.updatedAt).toBeDefined();
  });

  it("no disclaimer draft → empty Slide6Payload", async () => {
    const anthropic = makeAnthropicMock("emit_slide6_payload", {
      disclaimer: null,
    });
    (getAnthropicClient as Mock).mockReturnValue(anthropic);

    const payload = await runFelixBuilder(makeInput());

    expect(payload.disclaimer).toBeUndefined();
    expect(Object.keys(payload)).toHaveLength(0);
  });
});

// ── Felix-05 Inspector tests ──────────────────────────────────────────────────

describe("runFelixInspector", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Pass 1 blocks on malformed payload", async () => {
    // disclaimer.text exceeds max (200 chars) — Zod should block
    const malformed = {
      disclaimer: {
        text: "x".repeat(SLIDE6_DISCLAIMER_MAX + 10),
        provenance: { source: "llm", updatedAt: "2026-05-07T00:00:00.000Z" },
      },
    } as unknown as import("@shared/deck-payload-v2").Slide6Payload;

    const verdict = await runFelixInspector(malformed, "canonical/lb-6-slide/slides/slide-6.png");
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

    const payload: import("@shared/deck-payload-v2").Slide6Payload = {};

    const verdict = await runFelixInspector(payload, "canonical/lb-6-slide/slides/slide-6.png");
    expect(verdict.status).toBe("ok");
    expect(verdict.notes).toBeNull();
  });

  it("Pass 2 defaults to ok when canonical PNG unavailable", async () => {
    (getStorageProviderAsync as Mock).mockResolvedValue({
      downloadBuffer: vi.fn().mockRejectedValue(new Error("R2 unavailable")),
    });

    const payload: import("@shared/deck-payload-v2").Slide6Payload = {};
    const verdict = await runFelixInspector(payload, "canonical/lb-6-slide/slides/slide-6.png");
    expect(verdict.status).toBe("ok");
  });
});

// ── runFelixTeam integration tests ───────────────────────────────────────────

describe("runFelixTeam", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("happy path: full chain → status ok", async () => {
    (getAnthropicClient as Mock)
      .mockReturnValueOnce(
        makeAnthropicMock("emit_slide6_payload", { disclaimer: null }),
      )
      .mockReturnValueOnce(
        makeAnthropicMock("report_inspection_verdict", { approved: true, notes: null }),
      );
    (getStorageProviderAsync as Mock).mockResolvedValue(makeStorageMock());

    const out = await runFelixTeam(makeInput());

    expect(out.slideNumber).toBe(6);
    expect(out.status).toBe("ok");
    expect(out.payloadV2).toBeDefined();
  });

  it("validator blocks (wrong projectionYears) → status block, builder never called", async () => {
    // Pass structured financialInputs that trigger a validation failure
    const out = await runFelixTeam(
      makeInput({
        financialInputs: {
          usaliRows: [],
          projectionYears: 5, // wrong — should be FELIX_PROJECTION_YEARS (10)
          usaliMode: true,
        },
      }),
    );

    expect(out.status).toBe("block");
    expect(out.notes).toContain(String(FELIX_PROJECTION_YEARS));
    // Builder (Anthropic) should NOT have been called
    expect(getAnthropicClient as Mock).not.toHaveBeenCalled();
  });

  it("builder error → status fail", async () => {
    (getAnthropicClient as Mock).mockReturnValue({
      messages: { create: vi.fn().mockRejectedValue(new Error("LLM error")) },
    });

    const out = await runFelixTeam(makeInput());
    expect(out.status).toBe("fail");
    expect(out.notes).toMatch(/builder error/i);
  });
});
