/**
 * Bianca swarm team — Unit tests.
 *
 * Three layers:
 *   1. runBiancaReader — deterministic, no mocks needed
 *   2. runBiancaBuilder — mocked Anthropic client
 *   3. runBiancaInspector — mocked Anthropic client + storage provider
 *   4. runBiancaTeam — integration via mocked sub-agents
 *
 * Test scenarios:
 *   - Reader: segregates approved vs. unapproved, empty, passes canonicalPngKey through
 *   - Builder happy path: all 3 slots → well-formed Slide2Payload with provenance
 *   - Builder edge — empty slot: all null → empty payload
 *   - Builder: respects char limits (truncates)
 *   - Builder: null slot returns with no field in payload (field is undefined/absent)
 *   - Inspector Pass 1 blocks on malformed payload (text too long, provenance missing)
 *   - Inspector Pass 2 returns ok on LLM approval
 *   - Inspector Pass 2 returns block on LLM rejection
 *   - Inspector Pass 2 defaults to ok when canonical PNG unavailable
 *   - Team happy path → status ok
 *   - Team builder error → status fail
 *   - Team inspector block → status block propagated
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
import { runBiancaReader } from "../../slides/swarms/bianca/reader";
import { runBiancaBuilder } from "../../slides/swarms/bianca/builder";
import { runBiancaInspector } from "../../slides/swarms/bianca/inspector";
import { runBiancaTeam } from "../../slides/swarms/bianca/index";
import type { SlideTeamInput } from "../../slides/swarms/types";
import type { LuccaSlotDraft } from "@workspace/db";
import {
  SLIDE2_OPERATIONAL_MODEL_MAX,
  SLIDE2_REVENUE_BULLET_MAX,
  SLIDE2_PROGRAMMING_BULLET_MAX,
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
    slideNumber: 2,
    slotDrafts: {},
    financialInputs: null,
    canonicalPngKey: "canonical/lb-6-slide/slides/slide-2.png",
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

// ── Bianca-01 Reader tests ────────────────────────────────────────────────────

describe("runBiancaReader", () => {
  it("segregates approved vs. unapproved drafts", () => {
    const out = runBiancaReader(
      makeInput({
        slotDrafts: {
          "slide2.operationalModelText": makeDraft("Boutique B&B model", true),
          "slide2.revenueBullet": makeDraft("ADR target $350/night", false),
          "slide2.programmingBullet": makeDraft("Yoga retreats and wellness weekends", true),
        },
      }),
    );
    expect(Object.keys(out.approvedDrafts)).toEqual([
      "slide2.operationalModelText",
      "slide2.programmingBullet",
    ]);
    expect(Object.keys(out.allDrafts)).toHaveLength(3);
  });

  it("returns empty maps when no drafts provided", () => {
    const out = runBiancaReader(makeInput());
    expect(out.approvedDrafts).toEqual({});
    expect(out.allDrafts).toEqual({});
  });

  it("passes canonicalPngKey through", () => {
    const out = runBiancaReader(makeInput());
    expect(out.canonicalPngKey).toBe("canonical/lb-6-slide/slides/slide-2.png");
  });
});

// ── Bianca-02 Builder tests ───────────────────────────────────────────────────

describe("runBiancaBuilder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("happy path: approved drafts → well-formed Slide2Payload with provenance", async () => {
    const anthropic = makeAnthropicMock("emit_slide2_payload", {
      operationalModelText: "Operational Model: Owner-operated boutique inn",
      revenueBullet: "Targeting $350 ADR with direct booking strategy",
      programmingBullet: "Wellness retreats, farm-to-table dining, cultural events",
    });
    (getAnthropicClient as Mock).mockReturnValue(anthropic);

    const readerOutput = runBiancaReader(
      makeInput({
        slotDrafts: {
          "slide2.operationalModelText": makeDraft("Operational Model: Owner-operated boutique inn"),
          "slide2.revenueBullet": makeDraft("Targeting $350 ADR with direct booking strategy"),
          "slide2.programmingBullet": makeDraft("Wellness retreats, farm-to-table dining, cultural events"),
        },
      }),
    );

    const payload = await runBiancaBuilder(readerOutput);

    expect(payload.operationalModelText?.text).toBe("Operational Model: Owner-operated boutique inn");
    expect(payload.revenueBullet?.text).toBe("Targeting $350 ADR with direct booking strategy");
    expect(payload.programmingBullet?.text).toBe("Wellness retreats, farm-to-table dining, cultural events");
    expect(payload.operationalModelText?.provenance.source).toBe("llm");
  });

  it("edge — empty Lucca slots: all null → empty payload", async () => {
    const anthropic = makeAnthropicMock("emit_slide2_payload", {
      operationalModelText: null,
      revenueBullet: null,
      programmingBullet: null,
    });
    (getAnthropicClient as Mock).mockReturnValue(anthropic);

    const readerOutput = runBiancaReader(makeInput());
    const payload = await runBiancaBuilder(readerOutput);

    expect(payload.operationalModelText).toBeUndefined();
    expect(payload.revenueBullet).toBeUndefined();
    expect(payload.programmingBullet).toBeUndefined();
  });

  it("respects character limits by truncating", async () => {
    const longText = "x".repeat(300);
    const anthropic = makeAnthropicMock("emit_slide2_payload", {
      operationalModelText: longText,
      revenueBullet: longText,
      programmingBullet: longText,
    });
    (getAnthropicClient as Mock).mockReturnValue(anthropic);

    const readerOutput = runBiancaReader(
      makeInput({
        slotDrafts: {
          "slide2.operationalModelText": makeDraft(longText),
          "slide2.revenueBullet": makeDraft(longText),
          "slide2.programmingBullet": makeDraft(longText),
        },
      }),
    );

    const payload = await runBiancaBuilder(readerOutput);
    expect(payload.operationalModelText!.text.length).toBeLessThanOrEqual(SLIDE2_OPERATIONAL_MODEL_MAX);
    expect(payload.revenueBullet!.text.length).toBeLessThanOrEqual(SLIDE2_REVENUE_BULLET_MAX);
    expect(payload.programmingBullet!.text.length).toBeLessThanOrEqual(SLIDE2_PROGRAMMING_BULLET_MAX);
  });

  it("null slot returns with field absent when no draft exists", async () => {
    const anthropic = makeAnthropicMock("emit_slide2_payload", {
      operationalModelText: "Operational Model: Boutique",
      revenueBullet: null,
      programmingBullet: null,
    });
    (getAnthropicClient as Mock).mockReturnValue(anthropic);

    // Only provide one draft; other slots absent
    const readerOutput = runBiancaReader(
      makeInput({
        slotDrafts: {
          "slide2.operationalModelText": makeDraft("Operational Model: Boutique"),
        },
      }),
    );

    const payload = await runBiancaBuilder(readerOutput);
    expect(payload.operationalModelText).toBeDefined();
    expect(payload.revenueBullet).toBeUndefined();
    expect(payload.programmingBullet).toBeUndefined();
  });
});

// ── Bianca-03 Inspector tests ─────────────────────────────────────────────────

describe("runBiancaInspector", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Pass 1 blocks on malformed payload (text too long, provenance missing)", async () => {
    const malformed = {
      operationalModelText: { text: "x".repeat(300) }, // too long, provenance missing
    } as unknown as import("@shared/deck-payload-v2").Slide2Payload;

    const verdict = await runBiancaInspector(malformed, "canonical/lb-6-slide/slides/slide-2.png");
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

    const payload: import("@shared/deck-payload-v2").Slide2Payload = {
      operationalModelText: {
        text: "Operational Model: Owner-operated boutique inn",
        provenance: { source: "llm", updatedAt: "2026-05-07T00:00:00.000Z" },
      },
    };

    const verdict = await runBiancaInspector(payload, "canonical/lb-6-slide/slides/slide-2.png");
    expect(verdict.status).toBe("ok");
    expect(verdict.notes).toBeNull();
  });

  it("Pass 2 returns block on LLM rejection", async () => {
    const anthropic = makeAnthropicMock("report_inspection_verdict", {
      approved: false,
      notes: "Operational model text lacks specificity",
    });
    (getAnthropicClient as Mock).mockReturnValue(anthropic);
    (getStorageProviderAsync as Mock).mockResolvedValue(makeStorageMock());

    const payload: import("@shared/deck-payload-v2").Slide2Payload = {
      operationalModelText: {
        text: "Good property",
        provenance: { source: "llm", updatedAt: "2026-05-07T00:00:00.000Z" },
      },
    };

    const verdict = await runBiancaInspector(payload, "canonical/lb-6-slide/slides/slide-2.png");
    expect(verdict.status).toBe("block");
    expect(verdict.notes).toBe("Operational model text lacks specificity");
  });

  it("Pass 2 defaults to ok when canonical PNG unavailable", async () => {
    (getStorageProviderAsync as Mock).mockResolvedValue({
      downloadBuffer: vi.fn().mockRejectedValue(new Error("R2 unavailable")),
    });

    const payload: import("@shared/deck-payload-v2").Slide2Payload = {};
    const verdict = await runBiancaInspector(payload, "canonical/lb-6-slide/slides/slide-2.png");
    expect(verdict.status).toBe("ok");
  });
});

// ── runBiancaTeam integration tests ──────────────────────────────────────────

describe("runBiancaTeam", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("happy path: all approvals → status ok", async () => {
    (getAnthropicClient as Mock)
      .mockReturnValueOnce(
        makeAnthropicMock("emit_slide2_payload", {
          operationalModelText: "Operational Model: Boutique inn",
          revenueBullet: "ADR target $350",
          programmingBullet: "Wellness and culinary retreats",
        }),
      )
      .mockReturnValueOnce(
        makeAnthropicMock("report_inspection_verdict", { approved: true, notes: null }),
      );
    (getStorageProviderAsync as Mock).mockResolvedValue(makeStorageMock());

    const out = await runBiancaTeam(
      makeInput({
        slotDrafts: {
          "slide2.operationalModelText": makeDraft("Operational Model: Boutique inn"),
          "slide2.revenueBullet": makeDraft("ADR target $350"),
          "slide2.programmingBullet": makeDraft("Wellness and culinary retreats"),
        },
      }),
    );

    expect(out.slideNumber).toBe(2);
    expect(out.status).toBe("ok");
    expect(out.payloadV2).toBeDefined();
  });

  it("builder error → status fail", async () => {
    (getAnthropicClient as Mock).mockReturnValue({
      messages: { create: vi.fn().mockRejectedValue(new Error("LLM error")) },
    });

    const out = await runBiancaTeam(makeInput());
    expect(out.status).toBe("fail");
    expect(out.notes).toMatch(/builder error/i);
  });

  it("inspector block → status block propagated", async () => {
    (getAnthropicClient as Mock)
      .mockReturnValueOnce(
        makeAnthropicMock("emit_slide2_payload", {
          operationalModelText: "Operational Model: OK",
          revenueBullet: "Revenue bullet",
          programmingBullet: "Programming bullet",
        }),
      )
      .mockReturnValueOnce(
        makeAnthropicMock("report_inspection_verdict", {
          approved: false,
          notes: "Copy too generic for investor presentation",
        }),
      );
    (getStorageProviderAsync as Mock).mockResolvedValue(makeStorageMock());

    const out = await runBiancaTeam(
      makeInput({
        slotDrafts: {
          "slide2.operationalModelText": makeDraft("Operational Model: OK"),
          "slide2.revenueBullet": makeDraft("Revenue bullet"),
          "slide2.programmingBullet": makeDraft("Programming bullet"),
        },
      }),
    );

    expect(out.status).toBe("block");
    expect(out.notes).toBe("Copy too generic for investor presentation");
  });
});
