/**
 * Marco — Unit 1 + Unit 7 + U4 (Enzo) tests.
 *
 * Three layers:
 *   1. dispatchMarcoTool — deterministic primitive tools (no LLM)
 *   2. checkVerdictCache — Enzo unit tests (pure function, no mocks needed)
 *   3. runMarco          — bounded agent loop (scripted Anthropic mock)
 *
 * U7 additions: invoke_maya, invoke_dino, and raw-signal update_agent_result.
 * U4 Enzo: verdict cache skip for unchanged slides on Marco retrigger.
 * Per-slide sequence: dispatch_slide_team → invoke_maya → invoke_dino → update_agent_result.
 * Approval logic lives in handleUpdateAgentResult (deterministic), not in Marco's prompt.
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

vi.mock("../slides/maya", () => ({
  runMaya: vi.fn().mockResolvedValue({ verdict: "ok", headline: "Looks good", notes: null }),
}));

vi.mock("../slides/dino", () => ({
  runDino: vi.fn().mockResolvedValue({ pixelDiffPct: 1.2, exceedsThreshold: false, threshold: 5 }),
}));

vi.mock("../slides/minions/franco", () => ({
  runFranco: vi.fn().mockResolvedValue({ deckR2Key: "factory-runs/42/deck.pdf" }),
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
import { runMaya } from "../slides/maya";
import { runDino } from "../slides/dino";
import { runFranco } from "../slides/minions/franco";
import { runMarco } from "../slides/marco";
import { MARCO_TOOLS, dispatchMarcoTool, handleProduceDeck } from "../slides/marco-tools";
import { checkVerdictCache, computeSlideContentHash } from "../slides/minions/enzo";
import { MARCO_MAX_TOOL_DEPTH, TOTAL_SLIDES } from "../slides/deck-render-constants";
import { MARCO_SYSTEM_PROMPT } from "../slides/marco";

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

/**
 * Marco's U7 per-slide sequence: dispatch → maya → dino → update_agent_result.
 * teamStatus defaults to "ok" (approved); pass "block" or "fail" for rejection.
 */
function slideTurns(
  slideNumber: number,
  opts: { teamStatus?: string; mayaVerdict?: string; dinoExceeds?: boolean } = {},
) {
  const { teamStatus = "ok", mayaVerdict = "ok", dinoExceeds = false } = opts;
  const dinoPixelDiffPct = dinoExceeds ? 8.5 : 1.2;
  return [
    { content: [makeToolUse("dispatch_slide_team", { runId: 42, slideNumber })] },
    { content: [makeToolUse("invoke_maya", { runId: 42, slideNumber })] },
    { content: [makeToolUse("invoke_dino", { runId: 42, slideNumber })] },
    {
      content: [
        makeToolUse("update_agent_result", {
          runId: 42,
          slideNumber,
          teamStatus,
          mayaVerdict,
          mayaHeadline: null,
          mayaNotes: null,
          dinoPixelDiffPct,
          dinoExceedsThreshold: dinoExceeds,
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
    (getSlideFactoryRunById as Mock).mockResolvedValue(makeRun());
  });

  it("read_run returns run state subset", async () => {
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
    (dispatchSlideTeam as Mock).mockResolvedValue({
      slideNumber: 1, status: "ok", payloadV2: { x: 1 }, notes: null,
    });
    await dispatchMarcoTool("dispatch_slide_team", { runId: 42, slideNumber: 1 }, { runId: 42 });
    const passed = (dispatchSlideTeam as Mock).mock.calls[0][0];
    expect(Object.keys(passed.slotDrafts)).toEqual(["slide1.headerSubtitle"]);
    expect(passed.canonicalPngKey).toContain("slide-1");
  });

  it("invoke_maya calls runMaya with cached payloadV2 and returns { verdict, headline, notes }", async () => {
    // Populate the cache via dispatch_slide_team first (tests T4 — cache-hit path)
    (dispatchSlideTeam as Mock).mockResolvedValue({
      slideNumber: 2, status: "ok", payloadV2: { assembled: true }, notes: null,
    });
    await dispatchMarcoTool("dispatch_slide_team", { runId: 42, slideNumber: 2 }, { runId: 42 });
    (runMaya as Mock).mockResolvedValue({ verdict: "advisory", headline: "Minor phrasing", notes: "verbose" });
    const out = await dispatchMarcoTool("invoke_maya", { runId: 42, slideNumber: 2 }, { runId: 42 });
    expect(out.result).toEqual({ verdict: "advisory", headline: "Minor phrasing", notes: "verbose" });
    expect(runMaya).toHaveBeenCalledWith(2, { assembled: true }, expect.any(Object));
  });

  it("invoke_maya returns error when payloadV2 is missing (dispatch_slide_team not called first)", async () => {
    const out = await dispatchMarcoTool("invoke_maya", { runId: 42, slideNumber: 5 }, { runId: 42 });
    expect(out.result).toMatchObject({ error: expect.stringContaining("payloadV2 unavailable") });
    expect(runMaya).not.toHaveBeenCalled();
  });

  it("invoke_dino calls runDino and returns { pixelDiffPct, exceedsThreshold, threshold }", async () => {
    (runDino as Mock).mockResolvedValue({ pixelDiffPct: 3.7, exceedsThreshold: false, threshold: 5 });
    const out = await dispatchMarcoTool("invoke_dino", { runId: 42, slideNumber: 3 }, { runId: 42 });
    expect(out.result).toEqual({ pixelDiffPct: 3.7, exceedsThreshold: false, threshold: 5 });
    expect(runDino).toHaveBeenCalledWith(3, expect.stringContaining("slide-3"));
  });

  it("update_agent_result computes approved when all signals pass", async () => {
    const out = await dispatchMarcoTool(
      "update_agent_result",
      {
        runId: 42, slideNumber: 3,
        teamStatus: "ok", mayaVerdict: "ok", mayaHeadline: null, mayaNotes: null,
        dinoPixelDiffPct: 1.5, dinoExceedsThreshold: false,
      },
      { runId: 42 },
    );
    const [, , written] = (updateAgentResult as Mock).mock.calls[0];
    expect(written.status).toBe("approved");
    expect(written.pixelDiffPct).toBe(1.5);
    expect(written.mayaVerdict).toBe("ok");
    expect(written.approvedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(written.errorMessage).toBeNull();
    expect(out.result).toMatchObject({ computedStatus: "approved" });
  });

  it("update_agent_result computes approved when maya verdict is advisory", async () => {
    await dispatchMarcoTool(
      "update_agent_result",
      {
        runId: 42, slideNumber: 1,
        teamStatus: "ok", mayaVerdict: "advisory", mayaHeadline: "Minor phrasing", mayaNotes: null,
        dinoPixelDiffPct: 0, dinoExceedsThreshold: false,
      },
      { runId: 42 },
    );
    const [, , written] = (updateAgentResult as Mock).mock.calls[0];
    expect(written.status).toBe("approved");
    expect(written.errorMessage).toBeNull();
  });

  it("update_agent_result computes rejected when dino exceeds threshold", async () => {
    await dispatchMarcoTool(
      "update_agent_result",
      {
        runId: 42, slideNumber: 5,
        teamStatus: "ok", mayaVerdict: "ok", mayaHeadline: null, mayaNotes: null,
        dinoPixelDiffPct: 8.3, dinoExceedsThreshold: true,
      },
      { runId: 42 },
    );
    const [, , written] = (updateAgentResult as Mock).mock.calls[0];
    expect(written.status).toBe("rejected");
    expect(written.errorMessage).toMatch(/dino=8\.3% > threshold/);
    expect(written.approvedAt).toBeNull();
  });

  it("update_agent_result computes rejected when maya verdict is warning", async () => {
    await dispatchMarcoTool(
      "update_agent_result",
      {
        runId: 42, slideNumber: 2,
        teamStatus: "ok", mayaVerdict: "warning", mayaHeadline: "Revenue unverifiable", mayaNotes: "details",
        dinoPixelDiffPct: 0, dinoExceedsThreshold: false,
      },
      { runId: 42 },
    );
    const [, , written] = (updateAgentResult as Mock).mock.calls[0];
    expect(written.status).toBe("rejected");
    expect(written.errorMessage).toMatch(/maya=warning/);
  });

  it("update_agent_result computes rejected when teamStatus is fail", async () => {
    await dispatchMarcoTool(
      "update_agent_result",
      {
        runId: 42, slideNumber: 4,
        teamStatus: "fail", mayaVerdict: "ok", mayaHeadline: null, mayaNotes: null,
        dinoPixelDiffPct: 0, dinoExceedsThreshold: false,
      },
      { runId: 42 },
    );
    const [, , written] = (updateAgentResult as Mock).mock.calls[0];
    expect(written.status).toBe("rejected");
    expect(written.errorMessage).toMatch(/team=fail/);
  });

  it("transition_status to complete sets completedAt", async () => {
    (getSlideFactoryRunById as Mock).mockResolvedValue(makeRun({ agentResults: {} }));
    await dispatchMarcoTool(
      "transition_status",
      { runId: 42, newStatus: "complete" },
      { runId: 42 },
    );
    const patch = (updateSlideFactoryRun as Mock).mock.calls[0][1];
    expect(patch.status).toBe("complete");
    expect(patch.completedAt).toBeInstanceOf(Date);
  });

  it("transition_status to complete is downgraded to error if any slide is rejected", async () => {
    (getSlideFactoryRunById as Mock).mockResolvedValue(makeRun({
      agentResults: {
        slide1: { status: "approved", pixelDiffPct: 1.0, mayaVerdict: "ok", mayaNotes: null, approvedAt: "2026-05-07T00:00:00Z", errorMessage: null },
        slide3: { status: "rejected", pixelDiffPct: 9.0, mayaVerdict: "block", mayaNotes: "bad content", approvedAt: null, errorMessage: "maya=block" },
      },
    }));
    const out = await dispatchMarcoTool(
      "transition_status",
      { runId: 42, newStatus: "complete" },
      { runId: 42 },
    );
    const patch = (updateSlideFactoryRun as Mock).mock.calls[0][1];
    expect(patch.status).toBe("error");
    expect(patch).not.toHaveProperty("completedAt");
    expect(out.result).toMatchObject({ downgradedFrom: "complete" });
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

  it("produce_deck happy path: returns { ok: true, deckR2Key }", async () => {
    (runFranco as Mock).mockResolvedValue({ deckR2Key: "factory-runs/42/deck.pdf" });
    const out = await dispatchMarcoTool("produce_deck", {}, { runId: 42 });
    expect(out.result).toEqual({ ok: true, deckR2Key: "factory-runs/42/deck.pdf" });
    expect(runFranco).toHaveBeenCalledWith(42, { caller: "marco" });
  });

  it("produce_deck error path: runFranco throws → returns { error } (no throw across boundary)", async () => {
    (runFranco as Mock).mockRejectedValue(new Error("R2 upload failed"));
    const out = await dispatchMarcoTool("produce_deck", {}, { runId: 42 });
    expect(out.result).toMatchObject({ error: expect.stringContaining("R2 upload failed") });
    // Make sure no `ok: true` slipped through on the error path
    expect((out.result as Record<string, unknown>).ok).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Layer 1b: handleProduceDeck (direct call — bypasses dispatcher)
// ─────────────────────────────────────────────────────────────────────────────

describe("handleProduceDeck", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("happy path: returns { ok: true, deckR2Key } on Franco success", async () => {
    (runFranco as Mock).mockResolvedValue({ deckR2Key: "k" });
    const out = await handleProduceDeck(7);
    expect(out).toEqual({ ok: true, deckR2Key: "k" });
    expect(runFranco).toHaveBeenCalledWith(7, { caller: "marco" });
  });

  it("error path: returns { error } when Franco throws (does not propagate)", async () => {
    (runFranco as Mock).mockRejectedValue(new Error("Playwright render timeout"));
    const out = await handleProduceDeck(7);
    expect(out).toMatchObject({ error: expect.stringContaining("Playwright render timeout") });
    expect((out as Record<string, unknown>).ok).toBeUndefined();
  });

  it("error path with non-Error throw: stringifies the value", async () => {
    (runFranco as Mock).mockRejectedValue("plain string failure");
    const out = await handleProduceDeck(7);
    expect(out).toMatchObject({ error: "plain string failure" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Layer 1c: Enzo verdict cache (checkVerdictCache + invoke_maya cache integration)
// ─────────────────────────────────────────────────────────────────────────────

/** Build a minimal SlideFactoryRun-like fixture for Enzo tests. */
function makeEnzoRun(overrides: Record<string, unknown> = {}) {
  return {
    id: 42,
    status: "building",
    luccaDraft: {
      "slide1.headerSubtitle": { value: "Hotel Alpha", approved: true, approvedAt: "2026-05-07", source: "lucca" },
      "slide1.tagline": { value: "Luxury at its finest", approved: true, approvedAt: "2026-05-07", source: "lucca" },
      "slide2.operationalModelText": { value: "Strong ops", approved: true, approvedAt: "2026-05-07", source: "lucca" },
    },
    agentResults: {
      slide1: {
        status: "approved",
        pixelDiffPct: 1.0,
        mayaVerdict: "ok",
        mayaNotes: null,
        approvedAt: "2026-05-07T00:00:00Z",
        errorMessage: null,
      },
    },
    slotContentHashes: null,
    briefR2Key: "uploads/brief.pdf",
    ...overrides,
  };
}

describe("Enzo — computeSlideContentHash", () => {
  it("returns sorted-key concatenation with | separator", () => {
    const draft = {
      "slide1.tagline": { value: "Luxury at its finest" },
      "slide1.headerSubtitle": { value: "Hotel Alpha" },
      "slide2.body": { value: "Other slide" },
    };
    // Keys sorted alphabetically: slide1.headerSubtitle < slide1.tagline
    const hash = computeSlideContentHash(draft as never, "slide1");
    expect(hash).toBe("Hotel Alpha|Luxury at its finest");
  });

  it("returns empty string when no keys match the slide prefix", () => {
    const draft = { "slide2.body": { value: "Other" } };
    expect(computeSlideContentHash(draft as never, "slide1")).toBe("");
  });

  it("is sensitive to value changes", () => {
    const draft1 = { "slide1.title": { value: "V1" } };
    const draft2 = { "slide1.title": { value: "V2" } };
    expect(computeSlideContentHash(draft1 as never, "slide1")).not.toBe(
      computeSlideContentHash(draft2 as never, "slide1"),
    );
  });
});

describe("Enzo — checkVerdictCache", () => {
  it("cache hit: matching hash + ok verdict → fromCache: true", async () => {
    // Pre-compute what the hash will be for the slide1 slots in makeEnzoRun
    const luccaDraft = {
      "slide1.headerSubtitle": { value: "Hotel Alpha" },
      "slide1.tagline": { value: "Luxury at its finest" },
    };
    const hash = computeSlideContentHash(luccaDraft as never, "slide1");

    const run = makeEnzoRun({
      slotContentHashes: { slide1: hash },
    });

    const result = await checkVerdictCache(run as never, "slide1");
    expect(result.fromCache).toBe(true);
    if (result.fromCache) {
      expect(result.mayaVerdict).toBe("ok");
      expect(result.mayaNotes).toBeNull();
    }
  });

  it("cache hit: matching hash + advisory verdict → fromCache: true", async () => {
    const luccaDraft = {
      "slide1.headerSubtitle": { value: "Hotel Alpha" },
      "slide1.tagline": { value: "Luxury at its finest" },
    };
    const hash = computeSlideContentHash(luccaDraft as never, "slide1");

    const run = makeEnzoRun({
      agentResults: {
        slide1: { status: "approved", pixelDiffPct: 1.0, mayaVerdict: "advisory", mayaNotes: "minor phrasing", approvedAt: "2026-05-07T00:00:00Z", errorMessage: null },
      },
      slotContentHashes: { slide1: hash },
    });

    const result = await checkVerdictCache(run as never, "slide1");
    expect(result.fromCache).toBe(true);
    if (result.fromCache) {
      expect(result.mayaVerdict).toBe("advisory");
      expect(result.mayaNotes).toBe("minor phrasing");
    }
  });

  it("cache miss: content changed (hash mismatch) → fromCache: false", async () => {
    // Store a stale hash (computed from different content)
    const run = makeEnzoRun({
      slotContentHashes: { slide1: "stale-hash-value" },
    });

    const result = await checkVerdictCache(run as never, "slide1");
    expect(result.fromCache).toBe(false);
  });

  it("cache miss: no prior slotContentHashes entry → fromCache: false", async () => {
    const run = makeEnzoRun({
      slotContentHashes: null,
    });

    const result = await checkVerdictCache(run as never, "slide1");
    expect(result.fromCache).toBe(false);
  });

  it("cache miss: no prior agentResult for slide → fromCache: false", async () => {
    const run = makeEnzoRun({
      agentResults: null,
      slotContentHashes: { slide1: "some-hash" },
    });

    const result = await checkVerdictCache(run as never, "slide1");
    expect(result.fromCache).toBe(false);
  });

  it("cache miss: prior verdict is 'block' → always re-judges, fromCache: false", async () => {
    const luccaDraft = {
      "slide1.headerSubtitle": { value: "Hotel Alpha" },
      "slide1.tagline": { value: "Luxury at its finest" },
    };
    const hash = computeSlideContentHash(luccaDraft as never, "slide1");

    const run = makeEnzoRun({
      agentResults: {
        slide1: { status: "rejected", pixelDiffPct: 1.0, mayaVerdict: "block", mayaNotes: "serious issue", approvedAt: null, errorMessage: "maya=block" },
      },
      slotContentHashes: { slide1: hash },
    });

    const result = await checkVerdictCache(run as never, "slide1");
    expect(result.fromCache).toBe(false);
  });

  it("cache miss: prior verdict is 'warning' → always re-judges, fromCache: false", async () => {
    const luccaDraft = {
      "slide1.headerSubtitle": { value: "Hotel Alpha" },
      "slide1.tagline": { value: "Luxury at its finest" },
    };
    const hash = computeSlideContentHash(luccaDraft as never, "slide1");

    const run = makeEnzoRun({
      agentResults: {
        slide1: { status: "rejected", pixelDiffPct: 1.0, mayaVerdict: "warning", mayaNotes: "revenue unverifiable", approvedAt: null, errorMessage: "maya=warning" },
      },
      slotContentHashes: { slide1: hash },
    });

    const result = await checkVerdictCache(run as never, "slide1");
    expect(result.fromCache).toBe(false);
  });
});

describe("Enzo — invoke_maya cache integration via dispatchMarcoTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("cache hit: runMaya not called when slotContentHashes matches and verdict is ok", async () => {
    // Build a run where the hash matches current luccaDraft content
    const luccaDraft: Record<string, { value: string; approved: boolean; approvedAt: string | null; source: string }> = {
      "slide1.headerSubtitle": { value: "Hotel Alpha", approved: true, approvedAt: "2026-05-07", source: "lucca" },
      "slide1.tagline": { value: "Luxury at its finest", approved: true, approvedAt: "2026-05-07", source: "lucca" },
    };
    const hash = computeSlideContentHash(luccaDraft as never, "slide1");

    (getSlideFactoryRunById as Mock).mockResolvedValue(
      makeRun({
        luccaDraft,
        agentResults: {
          slide1: { status: "approved", pixelDiffPct: 1.0, mayaVerdict: "ok", mayaNotes: null, approvedAt: "2026-05-07T00:00:00Z", errorMessage: null },
        },
        slotContentHashes: { slide1: hash },
      }),
    );

    // Populate dispatch cache so invoke_maya can find it (even though Enzo should skip it)
    (dispatchSlideTeam as Mock).mockResolvedValue({
      slideNumber: 1, status: "ok", payloadV2: { x: 1 }, notes: null,
    });
    await dispatchMarcoTool("dispatch_slide_team", { runId: 42, slideNumber: 1 }, { runId: 42 });

    const out = await dispatchMarcoTool("invoke_maya", { runId: 42, slideNumber: 1 }, { runId: 42 });
    expect(runMaya).not.toHaveBeenCalled();
    expect(out.result).toMatchObject({ verdict: "ok", headline: null });
  });

  it("cache miss (content changed): runMaya IS called when hash mismatches", async () => {
    const luccaDraft: Record<string, { value: string; approved: boolean; approvedAt: string | null; source: string }> = {
      "slide1.headerSubtitle": { value: "Hotel Alpha NEW", approved: true, approvedAt: "2026-05-07", source: "lucca" },
    };

    (getSlideFactoryRunById as Mock).mockResolvedValue(
      makeRun({
        luccaDraft,
        agentResults: {
          slide1: { status: "approved", pixelDiffPct: 1.0, mayaVerdict: "ok", mayaNotes: null, approvedAt: "2026-05-07T00:00:00Z", errorMessage: null },
        },
        // stale hash — content changed
        slotContentHashes: { slide1: "old-hash-value" },
      }),
    );

    (runMaya as Mock).mockResolvedValue({ verdict: "ok", headline: "Good", notes: null });
    (dispatchSlideTeam as Mock).mockResolvedValue({
      slideNumber: 1, status: "ok", payloadV2: { assembled: true }, notes: null,
    });
    await dispatchMarcoTool("dispatch_slide_team", { runId: 42, slideNumber: 1 }, { runId: 42 });

    await dispatchMarcoTool("invoke_maya", { runId: 42, slideNumber: 1 }, { runId: 42 });
    expect(runMaya).toHaveBeenCalledTimes(1);
  });

  it("cache miss (no prior hash): runMaya IS called when slotContentHashes is null", async () => {
    (getSlideFactoryRunById as Mock).mockResolvedValue(
      makeRun({
        agentResults: {
          slide1: { status: "approved", pixelDiffPct: 1.0, mayaVerdict: "ok", mayaNotes: null, approvedAt: "2026-05-07T00:00:00Z", errorMessage: null },
        },
        slotContentHashes: null,
      }),
    );

    (runMaya as Mock).mockResolvedValue({ verdict: "ok", headline: "Good", notes: null });
    (dispatchSlideTeam as Mock).mockResolvedValue({
      slideNumber: 1, status: "ok", payloadV2: { assembled: true }, notes: null,
    });
    await dispatchMarcoTool("dispatch_slide_team", { runId: 42, slideNumber: 1 }, { runId: 42 });

    await dispatchMarcoTool("invoke_maya", { runId: 42, slideNumber: 1 }, { runId: 42 });
    expect(runMaya).toHaveBeenCalledTimes(1);
  });

  it("cache miss (block verdict): runMaya IS called even if hash matches", async () => {
    const luccaDraft: Record<string, { value: string; approved: boolean; approvedAt: string | null; source: string }> = {
      "slide1.headerSubtitle": { value: "Hotel Alpha", approved: true, approvedAt: "2026-05-07", source: "lucca" },
    };
    const hash = computeSlideContentHash(luccaDraft as never, "slide1");

    (getSlideFactoryRunById as Mock).mockResolvedValue(
      makeRun({
        luccaDraft,
        agentResults: {
          slide1: { status: "rejected", pixelDiffPct: 1.0, mayaVerdict: "block", mayaNotes: "bad", approvedAt: null, errorMessage: "maya=block" },
        },
        slotContentHashes: { slide1: hash },
      }),
    );

    (runMaya as Mock).mockResolvedValue({ verdict: "ok", headline: "Fixed now", notes: null });
    (dispatchSlideTeam as Mock).mockResolvedValue({
      slideNumber: 1, status: "ok", payloadV2: { assembled: true }, notes: null,
    });
    await dispatchMarcoTool("dispatch_slide_team", { runId: 42, slideNumber: 1 }, { runId: 42 });

    await dispatchMarcoTool("invoke_maya", { runId: 42, slideNumber: 1 }, { runId: 42 });
    expect(runMaya).toHaveBeenCalledTimes(1);
  });

  it("after a successful Maya call with ok verdict, updateSlideFactoryRun writes slotContentHashes", async () => {
    const luccaDraft: Record<string, { value: string; approved: boolean; approvedAt: string | null; source: string }> = {
      "slide2.operationalModelText": { value: "Strong ops", approved: true, approvedAt: "2026-05-07", source: "lucca" },
    };

    (getSlideFactoryRunById as Mock).mockResolvedValue(
      makeRun({
        luccaDraft,
        agentResults: null,
        slotContentHashes: null,
      }),
    );
    (updateSlideFactoryRun as Mock).mockResolvedValue({ id: 42, status: "building" });
    (runMaya as Mock).mockResolvedValue({ verdict: "ok", headline: "Good", notes: null });
    (dispatchSlideTeam as Mock).mockResolvedValue({
      slideNumber: 2, status: "ok", payloadV2: { assembled: true }, notes: null,
    });

    await dispatchMarcoTool("dispatch_slide_team", { runId: 42, slideNumber: 2 }, { runId: 42 });
    await dispatchMarcoTool("invoke_maya", { runId: 42, slideNumber: 2 }, { runId: 42 });

    expect(updateSlideFactoryRun).toHaveBeenCalledWith(
      42,
      expect.objectContaining({
        slotContentHashes: expect.objectContaining({ slide2: expect.any(String) }),
      }),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Layer 1d: MARCO_TOOLS schema + system prompt sanity
// ─────────────────────────────────────────────────────────────────────────────

describe("MARCO_TOOLS schema + system prompt", () => {
  // U3 added produce_deck — Marco is now an 8-tool agent
  const MARCO_TOOL_COUNT = 8;

  it("MARCO_TOOLS has 8 entries (was 7 before U3)", () => {
    expect(MARCO_TOOLS).toHaveLength(MARCO_TOOL_COUNT);
  });

  it("MARCO_TOOLS includes produce_deck", () => {
    const names = MARCO_TOOLS.map((t) => t.name);
    expect(names).toContain("produce_deck");
  });

  it("system prompt mentions produce_deck and transition_status", () => {
    expect(MARCO_SYSTEM_PROMPT).toContain("produce_deck");
    expect(MARCO_SYSTEM_PROMPT).toContain("transition_status");
  });

  it("system prompt's tool-count constraint mentions 'eight' (not 'seven')", () => {
    expect(MARCO_SYSTEM_PROMPT).toContain("eight");
    expect(MARCO_SYSTEM_PROMPT).not.toMatch(/other than the seven listed/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Layer 2: runMarco bounded agent loop
// ─────────────────────────────────────────────────────────────────────────────

describe("runMarco", () => {
  let currentStatus: string;

  beforeEach(() => {
    vi.clearAllMocks();
    currentStatus = "building";
    (getSlideFactoryRunById as Mock).mockImplementation(async () =>
      makeRun({ status: currentStatus }),
    );
    (updateSlideFactoryRun as Mock).mockImplementation(async (_id, patch) => {
      if (typeof patch.status === "string") currentStatus = patch.status;
      return makeRun({ status: currentStatus });
    });
    (dispatchSlideTeam as Mock).mockImplementation(async (input: { slideNumber: number }) => ({
      slideNumber: input.slideNumber,
      status: "ok",
      payloadV2: { stubbed: true },
      notes: null,
    }));
    (runMaya as Mock).mockResolvedValue({ verdict: "ok", headline: "Looks good", notes: null });
    (runDino as Mock).mockResolvedValue({ pixelDiffPct: 1.2, exceedsThreshold: false, threshold: 5 });
  });

  it("happy path — drives all 6 slides to approved and transitions to complete", async () => {
    (getAnthropicClient as Mock).mockReturnValue(scriptedAnthropic(happyPathTurns()));

    await runMarco(42);

    expect(dispatchSlideTeam).toHaveBeenCalledTimes(TOTAL_SLIDES);
    expect(runMaya).toHaveBeenCalledTimes(TOTAL_SLIDES);
    expect(runDino).toHaveBeenCalledTimes(TOTAL_SLIDES);
    expect(updateAgentResult).toHaveBeenCalledTimes(TOTAL_SLIDES);
    const finalPatch = (updateSlideFactoryRun as Mock).mock.calls[0][1];
    expect(finalPatch.status).toBe("complete");
  });

  it("slide 3 dino exceeds threshold — slide 3 rejected, run transitions to error", async () => {
    const turns = [
      { content: [makeToolUse("read_run", { runId: 42 })] },
      ...slideTurns(1),
      ...slideTurns(2),
      ...slideTurns(3, { dinoExceeds: true }),
      ...slideTurns(4),
      ...slideTurns(5),
      ...slideTurns(6),
      { content: [makeToolUse("transition_status", { runId: 42, newStatus: "error" })] },
      { content: [makeToolUse("complete_task", { summary: "slide 3 dino rejected" })] },
    ];
    (getAnthropicClient as Mock).mockReturnValue(scriptedAnthropic(turns));

    await runMarco(42);

    expect(updateAgentResult).toHaveBeenCalledTimes(TOTAL_SLIDES);
    const slide3Call = (updateAgentResult as Mock).mock.calls.find(
      ([, slideNumber]) => slideNumber === 3,
    );
    expect(slide3Call?.[2].status).toBe("rejected");
    const finalPatch = (updateSlideFactoryRun as Mock).mock.calls[0][1];
    expect(finalPatch.status).toBe("error");
  });

  it("team dispatch throws — wrapped as error result, run continues across all slides", async () => {
    (dispatchSlideTeam as Mock).mockImplementation(async (input: { slideNumber: number }) => {
      if (input.slideNumber === 2) throw new Error("Bianca exploded");
      return { slideNumber: input.slideNumber, status: "ok", payloadV2: {}, notes: null };
    });

    const turns = [
      { content: [makeToolUse("read_run", { runId: 42 })] },
      ...slideTurns(1),
      // Slide 2: dispatch returns { error }, Marco continues with maya/dino/update
      ...slideTurns(2, { teamStatus: "fail" }),
      ...slideTurns(3),
      ...slideTurns(4),
      ...slideTurns(5),
      ...slideTurns(6),
      { content: [makeToolUse("transition_status", { runId: 42, newStatus: "error" })] },
      { content: [makeToolUse("complete_task", { summary: "Bianca threw" })] },
    ];
    (getAnthropicClient as Mock).mockReturnValue(scriptedAnthropic(turns));

    await runMarco(42);

    expect(updateAgentResult).toHaveBeenCalledTimes(TOTAL_SLIDES);
    const slide2Call = (updateAgentResult as Mock).mock.calls.find(
      ([, slideNumber]) => slideNumber === 2,
    );
    expect(slide2Call?.[2].status).toBe("rejected");
  });

  it("loop bound — emitting tool_use forever transitions run to error", async () => {
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

    expect(fakeAnthropic.messages.create).toHaveBeenCalledTimes(MARCO_MAX_TOOL_DEPTH);
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

    const lastPatchCall = (updateSlideFactoryRun as Mock).mock.calls.at(-1);
    expect(lastPatchCall?.[1].status).toBe("error");
  });

  it("complete_task fired without transition_status — post-loop guard forces error", async () => {
    const turns = [
      { content: [makeToolUse("read_run", { runId: 42 })] },
      ...slideTurns(1),
      ...slideTurns(2),
      ...slideTurns(3),
      ...slideTurns(4),
      ...slideTurns(5),
      ...slideTurns(6),
      // Skip transition_status — straight to complete_task
      { content: [makeToolUse("complete_task", { summary: "forgot to transition" })] },
    ];
    (getAnthropicClient as Mock).mockReturnValue(scriptedAnthropic(turns));

    await runMarco(42);

    const lastPatchCall = (updateSlideFactoryRun as Mock).mock.calls.at(-1);
    expect(lastPatchCall?.[1].status).toBe("error");
  });
});
