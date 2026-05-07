/**
 * Sofia swarm team — Unit 5 tests.
 *
 * Three layers:
 *   1. runSofiaReader — deterministic, no mocks needed
 *   2. runSofiaBuilder — mocked Anthropic client
 *   3. runSofiaInspector — mocked Anthropic client + storage provider
 *   4. runSofiaTeam — integration via mocked sub-agents
 *
 * Test scenarios from U5 plan:
 *   - Happy path: valid Lucca drafts → well-formed Slide1Payload + ok verdict
 *   - Edge — empty Lucca slot: no drafts → empty payload + ok verdict (Pass 2 skip)
 *   - Error path — Inspector Pass 1 blocks on schema violation
 *   - Error path — Inspector Pass 2 blocks on LLM rejection
 *   - Builder error propagates as fail status
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
import { runSofiaReader } from "../../slides/swarms/sofia/reader";
import { runSofiaBuilder } from "../../slides/swarms/sofia/builder";
import { runSofiaInspector } from "../../slides/swarms/sofia/inspector";
import { runSofiaTeam } from "../../slides/swarms/sofia/index";
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
    slideNumber: 1,
    slotDrafts: {},
    financialInputs: null,
    canonicalPngKey: "canonical/lb-6-slide/slides/slide-1.png",
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

// ── Sofia-01 Reader tests ─────────────────────────────────────────────────────

describe("runSofiaReader", () => {
  it("segregates approved vs. unapproved drafts", () => {
    const out = runSofiaReader(
      makeInput({
        slotDrafts: {
          "slide1.headerSubtitle": makeDraft("A Belleayre gem", true),
          "slide1.visionBullets": makeDraft("• A\n• B\n• C", false),
        },
      }),
    );
    expect(Object.keys(out.approvedDrafts)).toEqual(["slide1.headerSubtitle"]);
    expect(Object.keys(out.allDrafts)).toHaveLength(2);
  });

  it("returns empty maps when no drafts provided", () => {
    const out = runSofiaReader(makeInput());
    expect(out.approvedDrafts).toEqual({});
    expect(out.allDrafts).toEqual({});
  });

  it("passes canonicalPngKey through", () => {
    const out = runSofiaReader(makeInput());
    expect(out.canonicalPngKey).toBe("canonical/lb-6-slide/slides/slide-1.png");
  });
});

// ── Sofia-02 Builder tests ────────────────────────────────────────────────────

describe("runSofiaBuilder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("happy path: approved drafts → well-formed Slide1Payload", async () => {
    const anthropic = makeAnthropicMock("emit_slide1_payload", {
      headerSubtitle: "Belleayre Mountain — a Catskills jewel",
      visionBullets: ["Mountain escape", "Strong ADR fundamentals", "Operational upside"],
    });
    (getAnthropicClient as Mock).mockReturnValue(anthropic);

    const readerOutput = runSofiaReader(
      makeInput({
        slotDrafts: {
          "slide1.headerSubtitle": makeDraft("Belleayre Mountain — a Catskills jewel"),
          "slide1.visionBullets": makeDraft("• Mountain escape\n• Strong ADR fundamentals\n• Operational upside"),
        },
      }),
    );

    const payload = await runSofiaBuilder(readerOutput);

    expect(payload.headerSubtitle?.text).toBe("Belleayre Mountain — a Catskills jewel");
    expect(payload.visionBullets).toHaveLength(3);
    expect(payload.visionBullets?.[0].text).toBe("Mountain escape");
    expect(payload.headerSubtitle?.provenance.source).toBe("llm");
  });

  it("edge — empty Lucca slot: no drafts → empty payload", async () => {
    const anthropic = makeAnthropicMock("emit_slide1_payload", {
      headerSubtitle: null,
      visionBullets: null,
    });
    (getAnthropicClient as Mock).mockReturnValue(anthropic);

    const readerOutput = runSofiaReader(makeInput());
    const payload = await runSofiaBuilder(readerOutput);

    expect(payload.headerSubtitle).toBeUndefined();
    expect(payload.visionBullets).toBeUndefined();
  });

  it("respects character limits by truncating", async () => {
    const longText = "x".repeat(200);
    const anthropic = makeAnthropicMock("emit_slide1_payload", {
      headerSubtitle: longText,
      visionBullets: null,
    });
    (getAnthropicClient as Mock).mockReturnValue(anthropic);

    const readerOutput = runSofiaReader(
      makeInput({
        slotDrafts: {
          "slide1.headerSubtitle": makeDraft(longText),
        },
      }),
    );

    const payload = await runSofiaBuilder(readerOutput);
    expect(payload.headerSubtitle!.text.length).toBeLessThanOrEqual(120);
  });

  it("falls back to own bullet parser when Builder returns null bullets but draft exists", async () => {
    const anthropic = makeAnthropicMock("emit_slide1_payload", {
      headerSubtitle: null,
      visionBullets: null,
    });
    (getAnthropicClient as Mock).mockReturnValue(anthropic);

    const readerOutput = runSofiaReader(
      makeInput({
        slotDrafts: {
          "slide1.visionBullets": makeDraft("• First\n• Second\n• Third"),
        },
      }),
    );

    const payload = await runSofiaBuilder(readerOutput);
    expect(payload.visionBullets).toHaveLength(3);
    expect(payload.visionBullets?.[0].text).toBe("First");
  });
});

// ── Sofia-03 Inspector tests ──────────────────────────────────────────────────

describe("runSofiaInspector", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Pass 1 blocks on malformed payload", async () => {
    const malformed = {
      headerSubtitle: { text: "x".repeat(200) }, // too long, provenance missing
    } as unknown as import("@shared/deck-payload-v2").Slide1Payload;

    const verdict = await runSofiaInspector(malformed, "canonical/lb-6-slide/slides/slide-1.png");
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

    const payload: import("@shared/deck-payload-v2").Slide1Payload = {
      headerSubtitle: {
        text: "Belleayre Mountain",
        provenance: { source: "llm", updatedAt: "2026-05-07T00:00:00.000Z" },
      },
    };

    const verdict = await runSofiaInspector(payload, "canonical/lb-6-slide/slides/slide-1.png");
    expect(verdict.status).toBe("ok");
    expect(verdict.notes).toBeNull();
  });

  it("Pass 2 returns block on LLM rejection", async () => {
    const anthropic = makeAnthropicMock("report_inspection_verdict", {
      approved: false,
      notes: "Header subtitle lacks specificity",
    });
    (getAnthropicClient as Mock).mockReturnValue(anthropic);
    (getStorageProviderAsync as Mock).mockResolvedValue(makeStorageMock());

    const payload: import("@shared/deck-payload-v2").Slide1Payload = {
      headerSubtitle: {
        text: "Great property",
        provenance: { source: "llm", updatedAt: "2026-05-07T00:00:00.000Z" },
      },
    };

    const verdict = await runSofiaInspector(payload, "canonical/lb-6-slide/slides/slide-1.png");
    expect(verdict.status).toBe("block");
    expect(verdict.notes).toBe("Header subtitle lacks specificity");
  });

  it("Pass 2 defaults to ok when canonical PNG unavailable", async () => {
    (getStorageProviderAsync as Mock).mockResolvedValue({
      downloadBuffer: vi.fn().mockRejectedValue(new Error("R2 unavailable")),
    });

    const payload: import("@shared/deck-payload-v2").Slide1Payload = {};
    const verdict = await runSofiaInspector(payload, "canonical/lb-6-slide/slides/slide-1.png");
    expect(verdict.status).toBe("ok");
  });
});

// ── runSofiaTeam integration tests ──────────────────────────────────────────

describe("runSofiaTeam", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("happy path: all approvals → status ok", async () => {
    (getAnthropicClient as Mock)
      .mockReturnValueOnce(
        makeAnthropicMock("emit_slide1_payload", {
          headerSubtitle: "Belleayre gem",
          visionBullets: ["Bull A", "Bull B", "Bull C"],
        }),
      )
      .mockReturnValueOnce(
        makeAnthropicMock("report_inspection_verdict", { approved: true, notes: null }),
      );
    (getStorageProviderAsync as Mock).mockResolvedValue(makeStorageMock());

    const out = await runSofiaTeam(
      makeInput({
        slotDrafts: {
          "slide1.headerSubtitle": makeDraft("Belleayre gem"),
          "slide1.visionBullets": makeDraft("• Bull A\n• Bull B\n• Bull C"),
        },
      }),
    );

    expect(out.slideNumber).toBe(1);
    expect(out.status).toBe("ok");
    expect(out.payloadV2).toBeDefined();
  });

  it("builder error → status fail", async () => {
    (getAnthropicClient as Mock).mockReturnValue({
      messages: { create: vi.fn().mockRejectedValue(new Error("LLM error")) },
    });

    const out = await runSofiaTeam(makeInput());
    expect(out.status).toBe("fail");
    expect(out.notes).toMatch(/builder error/i);
  });

  it("inspector block → status block propagated", async () => {
    (getAnthropicClient as Mock)
      .mockReturnValueOnce(
        makeAnthropicMock("emit_slide1_payload", {
          headerSubtitle: "OK text",
          visionBullets: ["A", "B", "C"],
        }),
      )
      .mockReturnValueOnce(
        makeAnthropicMock("report_inspection_verdict", {
          approved: false,
          notes: "Copy too generic",
        }),
      );
    (getStorageProviderAsync as Mock).mockResolvedValue(makeStorageMock());

    const out = await runSofiaTeam(
      makeInput({
        slotDrafts: {
          "slide1.headerSubtitle": makeDraft("OK text"),
          "slide1.visionBullets": makeDraft("• A\n• B\n• C"),
        },
      }),
    );

    expect(out.status).toBe("block");
    expect(out.notes).toBe("Copy too generic");
  });
});
