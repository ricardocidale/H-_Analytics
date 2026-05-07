/**
 * Dario swarm team — Unit tests.
 *
 * Three layers:
 *   1. runDarioBuilder — mocked Anthropic client (reads SlideTeamInput directly)
 *   2. runDarioInspector — mocked Anthropic client + storage provider
 *   3. runDarioTeam — integration via mocked sub-agents
 *
 * Test scenarios:
 *   - Builder happy path: sectionSubtitle slot present → Slide4Payload with subtitle + provenance
 *   - Builder edge — no drafts: empty slotDrafts → empty Slide4Payload ({})
 *   - Builder: respects char limit (truncates to SLIDE4_SECTION_SUBTITLE_MAX)
 *   - Inspector Pass 1 blocks on malformed payload
 *   - Inspector Pass 2 returns ok on LLM approval
 *   - Inspector Pass 2 returns block on LLM rejection
 *   - Inspector Pass 2 defaults to ok when canonical PNG unavailable
 *   - Team happy path → ok
 *   - Team builder error → fail
 *   - Team inspector block → block
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
import { runDarioBuilder } from "../../slides/swarms/dario/builder";
import { runDarioInspector } from "../../slides/swarms/dario/inspector";
import { runDarioTeam } from "../../slides/swarms/dario/index";
import type { SlideTeamInput } from "../../slides/swarms/types";
import type { LuccaSlotDraft } from "@workspace/db";
import { SLIDE4_SECTION_SUBTITLE_MAX } from "@shared/deck-payload-v2";

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
    slideNumber: 4,
    slotDrafts: {},
    financialInputs: null,
    canonicalPngKey: "canonical/lb-6-slide/slides/slide-4.png",
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

// ── Dario-01 Builder tests ────────────────────────────────────────────────────

describe("runDarioBuilder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("happy path: sectionSubtitle draft present → Slide4Payload with subtitle and provenance", async () => {
    const anthropic = makeAnthropicMock("emit_slide4_payload", {
      sectionSubtitle: "A diversified portfolio of hospitality assets",
    });
    (getAnthropicClient as Mock).mockReturnValue(anthropic);

    const payload = await runDarioBuilder(
      makeInput({
        slotDrafts: {
          "slide4.sectionSubtitle": makeDraft("A diversified portfolio of hospitality assets"),
        },
      }),
    );

    expect(payload.sectionSubtitle?.text).toBe("A diversified portfolio of hospitality assets");
    expect(payload.sectionSubtitle?.provenance.source).toBe("llm");
    expect(payload.sectionSubtitle?.provenance.updatedAt).toBeDefined();
  });

  it("edge — no drafts: empty slotDrafts → empty Slide4Payload", async () => {
    const anthropic = makeAnthropicMock("emit_slide4_payload", {
      sectionSubtitle: null,
    });
    (getAnthropicClient as Mock).mockReturnValue(anthropic);

    const payload = await runDarioBuilder(makeInput());

    expect(payload.sectionSubtitle).toBeUndefined();
    expect(Object.keys(payload)).toHaveLength(0);
  });

  it("respects char limit — truncates sectionSubtitle to SLIDE4_SECTION_SUBTITLE_MAX", async () => {
    const longText = "x".repeat(SLIDE4_SECTION_SUBTITLE_MAX + 50);
    const anthropic = makeAnthropicMock("emit_slide4_payload", {
      sectionSubtitle: longText,
    });
    (getAnthropicClient as Mock).mockReturnValue(anthropic);

    const payload = await runDarioBuilder(
      makeInput({
        slotDrafts: {
          "slide4.sectionSubtitle": makeDraft(longText),
        },
      }),
    );

    expect(payload.sectionSubtitle!.text.length).toBeLessThanOrEqual(SLIDE4_SECTION_SUBTITLE_MAX);
  });
});

// ── Dario-02 Inspector tests ──────────────────────────────────────────────────

describe("runDarioInspector", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Pass 1 blocks on malformed payload", async () => {
    // sectionSubtitle.text exceeds max (80 chars) — Zod should block
    const malformed = {
      sectionSubtitle: {
        text: "x".repeat(SLIDE4_SECTION_SUBTITLE_MAX + 10),
        provenance: { source: "llm", updatedAt: "2026-05-07T00:00:00.000Z" },
      },
    } as unknown as import("@shared/deck-payload-v2").Slide4Payload;

    const verdict = await runDarioInspector(malformed, "canonical/lb-6-slide/slides/slide-4.png");
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

    const payload: import("@shared/deck-payload-v2").Slide4Payload = {
      sectionSubtitle: {
        text: "Portfolio overview subtitle",
        provenance: { source: "llm", updatedAt: "2026-05-07T00:00:00.000Z" },
      },
    };

    const verdict = await runDarioInspector(payload, "canonical/lb-6-slide/slides/slide-4.png");
    expect(verdict.status).toBe("ok");
    expect(verdict.notes).toBeNull();
  });

  it("Pass 2 returns block on LLM rejection", async () => {
    const anthropic = makeAnthropicMock("report_inspection_verdict", {
      approved: false,
      notes: "Subtitle is not professional enough",
    });
    (getAnthropicClient as Mock).mockReturnValue(anthropic);
    (getStorageProviderAsync as Mock).mockResolvedValue(makeStorageMock());

    const payload: import("@shared/deck-payload-v2").Slide4Payload = {};

    const verdict = await runDarioInspector(payload, "canonical/lb-6-slide/slides/slide-4.png");
    expect(verdict.status).toBe("block");
    expect(verdict.notes).toBe("Subtitle is not professional enough");
  });

  it("Pass 2 defaults to ok when canonical PNG unavailable", async () => {
    (getStorageProviderAsync as Mock).mockResolvedValue({
      downloadBuffer: vi.fn().mockRejectedValue(new Error("R2 unavailable")),
    });

    const payload: import("@shared/deck-payload-v2").Slide4Payload = {};
    const verdict = await runDarioInspector(payload, "canonical/lb-6-slide/slides/slide-4.png");
    expect(verdict.status).toBe("ok");
  });
});

// ── runDarioTeam integration tests ───────────────────────────────────────────

describe("runDarioTeam", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("happy path: builder + inspector approve → status ok", async () => {
    (getAnthropicClient as Mock)
      .mockReturnValueOnce(
        makeAnthropicMock("emit_slide4_payload", {
          sectionSubtitle: "A diversified portfolio",
        }),
      )
      .mockReturnValueOnce(
        makeAnthropicMock("report_inspection_verdict", { approved: true, notes: null }),
      );
    (getStorageProviderAsync as Mock).mockResolvedValue(makeStorageMock());

    const out = await runDarioTeam(
      makeInput({
        slotDrafts: {
          "slide4.sectionSubtitle": makeDraft("A diversified portfolio"),
        },
      }),
    );

    expect(out.slideNumber).toBe(4);
    expect(out.status).toBe("ok");
    expect(out.payloadV2).toBeDefined();
  });

  it("builder error → status fail", async () => {
    (getAnthropicClient as Mock).mockReturnValue({
      messages: { create: vi.fn().mockRejectedValue(new Error("LLM error")) },
    });

    const out = await runDarioTeam(makeInput());
    expect(out.status).toBe("fail");
    expect(out.notes).toMatch(/builder error/i);
  });

  it("inspector block → status block propagated", async () => {
    (getAnthropicClient as Mock)
      .mockReturnValueOnce(
        makeAnthropicMock("emit_slide4_payload", { sectionSubtitle: "OK subtitle" }),
      )
      .mockReturnValueOnce(
        makeAnthropicMock("report_inspection_verdict", {
          approved: false,
          notes: "Copy is not investor-appropriate",
        }),
      );
    (getStorageProviderAsync as Mock).mockResolvedValue(makeStorageMock());

    const out = await runDarioTeam(
      makeInput({
        slotDrafts: {
          "slide4.sectionSubtitle": makeDraft("OK subtitle"),
        },
      }),
    );

    expect(out.status).toBe("block");
    expect(out.notes).toBe("Copy is not investor-appropriate");
  });
});
