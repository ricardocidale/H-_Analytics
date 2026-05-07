/**
 * Marco — Unit 1 tests.
 *
 * Two layers:
 *   1. dispatchMarcoTool — deterministic primitive tools (no LLM)
 *   2. runMarco          — bounded agent loop (scripted Anthropic mock)
 *
 * Maya/Dino-related scenarios are deferred to U7. Phase 1 verifies team
 * dispatch + result writes + status transitions + loop bound.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

// ── Mocks (declared before any import that pulls these modules) ──────────────

vi.mock("../ai/clients", () => ({
  getAnthropicClient: vi.fn(),
}));

vi.mock("../storage/slide-factory-runs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../storage/slide-factory-runs")>();
  return {
    ...actual,
    getSlideFactoryRunById: vi.fn(),
    updateSlideFactoryRun: vi.fn().mockResolvedValue({ id: 1, status: "complete" }),
    updateAgentResult: vi.fn().mockResolvedValue({ id: 1, status: "building" }),
  };
});

vi.mock("../slides/swarms/dispatch", () => ({
  dispatchSlideTeam: vi.fn(),
}));

vi.mock("../logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { getAnthropicClient } from "../ai/clients";
import {
  getSlideFactoryRunById,
  updateSlideFactoryRun,
  updateAgentResult,
} from "../storage/slide-factory-runs";
import { dispatchSlideTeam } from "../slides/swarms/dispatch";
import { runMarco } from "../slides/marco";
import { dispatchMarcoTool } from "../slides/marco-tools";
import { MARCO_MAX_TOOL_DEPTH, TOTAL_SLIDES } from "../slides/deck-render-constants";

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeRun(overrides: Record<string, unknown> = {}) {
  return {
    id: 42,
    status: "building",
    slide1PropertyId: 1,
    slide2PropertyId: 2,
    slide3PropertyId: 3,
    slide5PropertyId: 5,
    luccaDraft: {
      "slide1.headerSubtitle": { value: "Hi", approved: true, approvedAt: "2026-05-07", source: "lucca" },
      "slide2.operationalModelText": { value: "Op", approved: true, approvedAt: "2026-05-07", source: "lucca" },
    },
    agentResults: null,
    briefR2Key: "uploads/brief.pdf",
    ...overrides,
  };
}

function makeToolUse(name: string, input: Record<string, unknown>, id = `tu_${name}_${Math.random()}`) {
  return { type: "tool_use" as const, id, name, input };
}

// Build a fake Anthropic that returns scripted responses turn-by-turn
function scriptedAnthropic(turns: Array<{ content: unknown[]; stop_reason?: string }>) {
  let i = 0;
  return {
    messages: {
      create: vi.fn().mockImplementation(async () => {
        const turn = turns[i] ?? { content: [], stop_reason: "end_turn" };
        i += 1;
        return { content: turn.content, stop_reason: turn.stop_reason ?? "tool_use" };
      }),
    },
  };
}

// Marco's natural tool sequence for one slide: dispatch → update_agent_result
function slideTurns(slideNumber: number, status: "approved" | "rejected" = "approved") {
  return [
    {
      content: [makeToolUse("dispatch_slide_team", { runId: 42, slideNumber })],
    },
    {
      content: [
        makeToolUse("update_agent_result", {
          runId: 42,
          slideNumber,
          status,
          errorMessage: status === "rejected" ? "team rejected" : null,
        }),
      ],
    },
  ];
}

function happyPathTurns() {
  return [
    { content: [makeToolUse("read_run", { runId: 42 })] },
    ...slideTurns(1),
    ...slideTurns(2),
    ...slideTurns(3),
    ...slideTurns(4),
    ...slideTurns(5),
    ...slideTurns(6),
    { content: [makeToolUse("transition_status", { runId: 42, newStatus: "complete" })] },
    { content: [makeToolUse("complete_task", { summary: "all 6 slides approved" })] },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// Layer 1: dispatchMarcoTool primitives
// ─────────────────────────────────────────────────────────────────────────────

describe("dispatchMarcoTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("read_run returns run state subset", async () => {
    (getSlideFactoryRunById as Mock).mockResolvedValue(makeRun());
    const out = await dispatchMarcoTool("read_run", { runId: 42 }, { runId: 42 });
    expect(out.result).toMatchObject({
      id: 42,
      status: "building",
      slide1PropertyId: 1,
      luccaDraftKeys: expect.arrayContaining(["slide1.headerSubtitle"]),
    });
  });

  it("read_run returns error when run not found", async () => {
    (getSlideFactoryRunById as Mock).mockResolvedValue(null);
    const out = await dispatchMarcoTool("read_run", { runId: 999 }, { runId: 999 });
    expect(out.result).toMatchObject({ error: expect.stringContaining("999") });
  });

  it("dispatch_slide_team passes slot drafts filtered by slide prefix", async () => {
    (getSlideFactoryRunById as Mock).mockResolvedValue(makeRun());
    (dispatchSlideTeam as Mock).mockResolvedValue({
      slideNumber: 1, status: "ok", payloadV2: { x: 1 }, notes: null,
    });
    await dispatchMarcoTool("dispatch_slide_team", { runId: 42, slideNumber: 1 }, { runId: 42 });
    const passed = (dispatchSlideTeam as Mock).mock.calls[0][0];
    expect(Object.keys(passed.slotDrafts)).toEqual(["slide1.headerSubtitle"]);
    expect(passed.canonicalPngKey).toContain("slide-1");
  });

  it("update_agent_result writes approved result with approvedAt timestamp", async () => {
    await dispatchMarcoTool(
      "update_agent_result",
      { runId: 42, slideNumber: 3, status: "approved", errorMessage: null },
      { runId: 42 },
    );
    const [runId, slideNumber, written] = (updateAgentResult as Mock).mock.calls[0];
    expect(runId).toBe(42);
    expect(slideNumber).toBe(3);
    expect(written.status).toBe("approved");
    expect(written.approvedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(written.errorMessage).toBeNull();
    expect(written.pixelDiffPct).toBeNull(); // U7 fills this
  });

  it("update_agent_result writes rejected result with errorMessage and no approvedAt", async () => {
    await dispatchMarcoTool(
      "update_agent_result",
      { runId: 42, slideNumber: 5, status: "rejected", errorMessage: "team rejected" },
      { runId: 42 },
    );
    const written = (updateAgentResult as Mock).mock.calls[0][2];
    expect(written.status).toBe("rejected");
    expect(written.errorMessage).toBe("team rejected");
    expect(written.approvedAt).toBeNull();
  });

  it("transition_status to complete sets completedAt", async () => {
    await dispatchMarcoTool(
      "transition_status",
      { runId: 42, newStatus: "complete" },
      { runId: 42 },
    );
    const patch = (updateSlideFactoryRun as Mock).mock.calls[0][1];
    expect(patch.status).toBe("complete");
    expect(patch.completedAt).toBeInstanceOf(Date);
  });

  it("transition_status to error does NOT set completedAt", async () => {
    await dispatchMarcoTool(
      "transition_status",
      { runId: 42, newStatus: "error" },
      { runId: 42 },
    );
    const patch = (updateSlideFactoryRun as Mock).mock.calls[0][1];
    expect(patch.status).toBe("error");
    expect(patch).not.toHaveProperty("completedAt");
  });

  it("complete_task returns finalSummary so the loop exits", async () => {
    const out = await dispatchMarcoTool(
      "complete_task",
      { summary: "done" },
      { runId: 42 },
    );
    expect(out.finalSummary).toBe("done");
  });

  it("invalid slide number throws inside dispatch_slide_team", async () => {
    (getSlideFactoryRunById as Mock).mockResolvedValue(makeRun());
    const out = await dispatchMarcoTool(
      "dispatch_slide_team",
      { runId: 42, slideNumber: 7 },
      { runId: 42 },
    );
    expect(out.result).toMatchObject({ error: expect.stringContaining("1..6") });
  });

  it("unknown tool returns structured error", async () => {
    const out = await dispatchMarcoTool("nonsense", {}, { runId: 42 });
    expect(out.result).toMatchObject({ error: expect.stringContaining("Unknown tool") });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Layer 2: runMarco bounded agent loop
// ─────────────────────────────────────────────────────────────────────────────

describe("runMarco", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getSlideFactoryRunById as Mock).mockResolvedValue(makeRun());
    (dispatchSlideTeam as Mock).mockImplementation(async (input: { slideNumber: number }) => ({
      slideNumber: input.slideNumber,
      status: "ok",
      payloadV2: { stubbed: true },
      notes: null,
    }));
  });

  it("happy path — drives all 6 slides to approved and transitions to complete", async () => {
    (getAnthropicClient as Mock).mockReturnValue(scriptedAnthropic(happyPathTurns()));

    await runMarco(42);

    // Six dispatches, one per slide
    expect(dispatchSlideTeam).toHaveBeenCalledTimes(TOTAL_SLIDES);
    // Six update_agent_result writes
    expect(updateAgentResult).toHaveBeenCalledTimes(TOTAL_SLIDES);
    // Final transition to complete
    const finalPatch = (updateSlideFactoryRun as Mock).mock.calls[0][1];
    expect(finalPatch.status).toBe("complete");
  });

  it("team-block-on-slide-3 — slide 3 written rejected, run transitions to error", async () => {
    // Override: slide 3 returns block
    (dispatchSlideTeam as Mock).mockImplementation(async (input: { slideNumber: number }) => {
      if (input.slideNumber === 3) {
        return { slideNumber: 3, status: "block", payloadV2: null, notes: "schema invalid" };
      }
      return { slideNumber: input.slideNumber, status: "ok", payloadV2: {}, notes: null };
    });

    const turns = [
      { content: [makeToolUse("read_run", { runId: 42 })] },
      ...slideTurns(1, "approved"),
      ...slideTurns(2, "approved"),
      ...slideTurns(3, "rejected"),
      ...slideTurns(4, "approved"),
      ...slideTurns(5, "approved"),
      ...slideTurns(6, "approved"),
      { content: [makeToolUse("transition_status", { runId: 42, newStatus: "error" })] },
      { content: [makeToolUse("complete_task", { summary: "slide 3 rejected" })] },
    ];
    (getAnthropicClient as Mock).mockReturnValue(scriptedAnthropic(turns));

    await runMarco(42);

    expect(updateAgentResult).toHaveBeenCalledTimes(TOTAL_SLIDES);
    // Verify slide 3 was written rejected
    const slide3Call = (updateAgentResult as Mock).mock.calls.find(
      ([, slideNumber]) => slideNumber === 3,
    );
    expect(slide3Call?.[2].status).toBe("rejected");
    // Verify final transition to error
    const finalPatch = (updateSlideFactoryRun as Mock).mock.calls[0][1];
    expect(finalPatch.status).toBe("error");
  });

  it("team dispatch throws — wrapped as error result, run continues", async () => {
    (dispatchSlideTeam as Mock).mockImplementation(async (input: { slideNumber: number }) => {
      if (input.slideNumber === 2) throw new Error("Bianca exploded");
      return { slideNumber: input.slideNumber, status: "ok", payloadV2: {}, notes: null };
    });

    const turns = [
      { content: [makeToolUse("read_run", { runId: 42 })] },
      ...slideTurns(1, "approved"),
      ...slideTurns(2, "rejected"),
      ...slideTurns(3, "approved"),
      ...slideTurns(4, "approved"),
      ...slideTurns(5, "approved"),
      ...slideTurns(6, "approved"),
      { content: [makeToolUse("transition_status", { runId: 42, newStatus: "error" })] },
      { content: [makeToolUse("complete_task", { summary: "Bianca threw" })] },
    ];
    (getAnthropicClient as Mock).mockReturnValue(scriptedAnthropic(turns));

    await runMarco(42);

    // The throw was caught inside dispatchMarcoTool, so the loop didn't crash
    expect(updateAgentResult).toHaveBeenCalledTimes(TOTAL_SLIDES);
    // Slide 2 should still have a result written (rejected)
    const slide2Call = (updateAgentResult as Mock).mock.calls.find(
      ([, slideNumber]) => slideNumber === 2,
    );
    expect(slide2Call?.[2].status).toBe("rejected");
  });

  it("loop bound — emitting tool_use forever transitions run to error", async () => {
    // Anthropic mock that always returns dispatch_slide_team(1) — never completes
    const fakeAnthropic = {
      messages: {
        create: vi.fn().mockImplementation(async () => ({
          content: [makeToolUse("dispatch_slide_team", { runId: 42, slideNumber: 1 })],
          stop_reason: "tool_use",
        })),
      },
    };
    (getAnthropicClient as Mock).mockReturnValue(fakeAnthropic);

    await runMarco(42);

    // Loop ran exactly MARCO_MAX_TOOL_DEPTH times before giving up
    expect(fakeAnthropic.messages.create).toHaveBeenCalledTimes(MARCO_MAX_TOOL_DEPTH);
    // Run was best-effort marked as error
    const lastPatchCall = (updateSlideFactoryRun as Mock).mock.calls.at(-1);
    expect(lastPatchCall?.[1].status).toBe("error");
  });

  it("Anthropic client unavailable — run transitions to error without calling messages.create", async () => {
    (getAnthropicClient as Mock).mockImplementation(() => {
      throw new Error("no API key");
    });

    await runMarco(42);

    expect(updateSlideFactoryRun).toHaveBeenCalledWith(42, { status: "error" });
  });

  it("assistant ends turn without tool_use — loop exits and run transitions to error", async () => {
    const fakeAnthropic = scriptedAnthropic([
      { content: [{ type: "text", text: "I'm done" }], stop_reason: "end_turn" },
    ]);
    (getAnthropicClient as Mock).mockReturnValue(fakeAnthropic);

    await runMarco(42);

    // No completion signal → error
    const lastPatchCall = (updateSlideFactoryRun as Mock).mock.calls.at(-1);
    expect(lastPatchCall?.[1].status).toBe("error");
  });
});
