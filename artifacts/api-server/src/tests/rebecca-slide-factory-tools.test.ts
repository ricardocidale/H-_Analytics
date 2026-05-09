/**
 * Rebecca slide-factory tools — Unit 2 tests.
 *
 * Covers all nine slide-factory tools added to rebecca-tools.ts:
 *   create_slide_factory_run, list_slide_factory_runs, get_slide_factory_run,
 *   record_slide_factory_brief, accept_slide_factory_brief,
 *   assign_slide_factory_properties, update_slide_factory_slot,
 *   approve_all_slide_factory_slots, trigger_slide_factory_build.
 *
 * Test scenarios (per U2 plan):
 *   - Happy path per tool: valid input → structured result + dataChanged emission
 *   - CRUD completeness: each entity has C/R/U coverage (delete is N/A — runs are immutable)
 *   - Error path: invalid run id → error result (no isError: true — just result.error)
 *   - Status guards: each mutating tool blocks on wrong status
 *   - Integration: create + record_brief sequence → dataChanged on both
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Module mocks (hoisted before any static imports) ──────────────────────────

const mockCreateSlideFactoryRun = vi.fn();
const mockListSlideFactoryRuns = vi.fn();
const mockGetSlideFactoryRun = vi.fn();
const mockUpdateSlideFactoryRun = vi.fn();

vi.mock("../storage/slide-factory-runs", () => ({
  createSlideFactoryRun: (...a: unknown[]) => mockCreateSlideFactoryRun(...a),
  listSlideFactoryRuns: (...a: unknown[]) => mockListSlideFactoryRuns(...a),
  getSlideFactoryRun: (...a: unknown[]) => mockGetSlideFactoryRun(...a),
  updateSlideFactoryRun: (...a: unknown[]) => mockUpdateSlideFactoryRun(...a),
}));

const mockGetProperty = vi.fn();

vi.mock("../storage", () => ({
  storage: {
    getProperty: (...a: unknown[]) => mockGetProperty(...a),
  },
}));

vi.mock("../slides/lorenzo-ingestion", () => ({
  runLorenzoIngestion: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../slides/lucca-draft", () => ({
  runLuccaDraft: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../slides/marco", () => ({
  runMarco: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../slides/minions/franco", () => ({
  runFranco: vi.fn(),
}));

// ── Imports (after mocks) ────────────────────────────────────────────────────

import { dispatchRebeccaTool } from "../chat/rebecca-tools";
import { runMarco } from "../slides/marco";
import { runFranco } from "../slides/minions/franco";
import type { Mock } from "vitest";

// ── Fixtures ─────────────────────────────────────────────────────────────────

const CTX = { userId: 7 };

function makeRun(overrides: Record<string, unknown> = {}) {
  return {
    id: 99,
    userId: 7,
    status: "new",
    briefR2Key: null,
    briefFilename: null,
    briefAccepted: false,
    slide1PropertyId: null,
    slide2PropertyId: null,
    slide3PropertyId: null,
    slide5PropertyId: null,
    luccaDraft: null,
    agentResults: null,
    deckR2Key: null,
    startedAt: null,
    completedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeDraftReviewRun(approved = true) {
  return makeRun({
    status: "draft_review",
    briefR2Key: "uploads/brief.pdf",
    briefAccepted: true,
    luccaDraft: {
      "slide1.headerSubtitle": {
        value: "A great property",
        approved,
        approvedAt: approved ? "2026-05-07T00:00:00.000Z" : null,
        source: "lucca" as const,
      },
    },
  });
}

// ── create_slide_factory_run ──────────────────────────────────────────────────

describe("create_slide_factory_run", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateSlideFactoryRun.mockResolvedValue(makeRun({ id: 99, status: "new" }));
  });

  it("happy path: creates a run and returns id + status + dataChanged", async () => {
    const result = await dispatchRebeccaTool("create_slide_factory_run", {}, CTX);
    const r = result.result as Record<string, unknown>;
    expect(r.id).toBe(99);
    expect(r.status).toBe("new");
    expect(result.dataChanged).toMatchObject({ entityType: "slide_factory_run", entityId: 99 });
  });
});

// ── list_slide_factory_runs ───────────────────────────────────────────────────

describe("list_slide_factory_runs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListSlideFactoryRuns.mockResolvedValue([makeRun({ id: 1 }), makeRun({ id: 2 })]);
  });

  it("happy path: returns array with id, status, briefFilename", async () => {
    const result = await dispatchRebeccaTool("list_slide_factory_runs", {}, CTX);
    const r = result.result as Array<Record<string, unknown>>;
    expect(r).toHaveLength(2);
    expect(r[0].id).toBe(1);
    expect(r[0].status).toBeDefined();
    expect(r[0].briefFilename).toBeDefined();
  });

  it("no dataChanged emitted (read-only operation)", async () => {
    const result = await dispatchRebeccaTool("list_slide_factory_runs", {}, CTX);
    expect(result.dataChanged).toBeUndefined();
  });
});

// ── get_slide_factory_run ─────────────────────────────────────────────────────

describe("get_slide_factory_run", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSlideFactoryRun.mockResolvedValue(makeRun({ id: 99 }));
  });

  it("happy path: returns the full run object", async () => {
    const result = await dispatchRebeccaTool("get_slide_factory_run", { id: 99 }, CTX);
    const r = result.result as Record<string, unknown>;
    expect(r.id).toBe(99);
    expect(result.dataChanged).toBeUndefined();
  });

  it("run not found: returns error", async () => {
    mockGetSlideFactoryRun.mockResolvedValue(null);
    const result = await dispatchRebeccaTool("get_slide_factory_run", { id: 9999 }, CTX);
    expect((result.result as Record<string, unknown>).error).toMatch(/9999/);
  });

  it("invalid id: returns error without calling storage", async () => {
    const result = await dispatchRebeccaTool("get_slide_factory_run", { id: "bad" }, CTX);
    expect((result.result as Record<string, unknown>).error).toBeDefined();
    expect(mockGetSlideFactoryRun).not.toHaveBeenCalled();
  });
});

// ── record_slide_factory_brief ────────────────────────────────────────────────

describe("record_slide_factory_brief", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSlideFactoryRun.mockResolvedValue(makeRun({ id: 99, status: "new" }));
    mockUpdateSlideFactoryRun.mockResolvedValue(makeRun({ id: 99, status: "new", briefFilename: "q1.pdf" }));
  });

  it("happy path: records brief and emits dataChanged", async () => {
    const result = await dispatchRebeccaTool(
      "record_slide_factory_brief",
      { id: 99, r2Key: "uploads/abc.pdf", filename: "q1.pdf" },
      CTX,
    );
    const r = result.result as Record<string, unknown>;
    expect(r.id).toBe(99);
    expect(r.briefFilename).toBe("q1.pdf");
    expect(result.dataChanged).toMatchObject({ entityType: "slide_factory_run", entityId: 99 });
  });

  it("wrong status: returns error without writing", async () => {
    mockGetSlideFactoryRun.mockResolvedValue(makeRun({ id: 99, status: "ingesting" }));
    const result = await dispatchRebeccaTool(
      "record_slide_factory_brief",
      { id: 99, r2Key: "uploads/abc.pdf", filename: "q1.pdf" },
      CTX,
    );
    expect((result.result as Record<string, unknown>).error).toMatch(/new/);
    expect(mockUpdateSlideFactoryRun).not.toHaveBeenCalled();
  });

  it("missing r2Key: returns validation error", async () => {
    const result = await dispatchRebeccaTool(
      "record_slide_factory_brief",
      { id: 99, filename: "q1.pdf" },
      CTX,
    );
    expect((result.result as Record<string, unknown>).error).toBeDefined();
    expect(mockUpdateSlideFactoryRun).not.toHaveBeenCalled();
  });
});

// ── accept_slide_factory_brief ────────────────────────────────────────────────

describe("accept_slide_factory_brief", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSlideFactoryRun.mockResolvedValue(
      makeRun({ id: 99, status: "new", briefR2Key: "uploads/abc.pdf" }),
    );
    mockUpdateSlideFactoryRun.mockResolvedValue(makeRun({ id: 99, status: "ingesting" }));
  });

  it("happy path: transitions to ingesting, fires Lorenzo fire-and-forget, emits dataChanged", async () => {
    const result = await dispatchRebeccaTool("accept_slide_factory_brief", { id: 99 }, CTX);
    const r = result.result as Record<string, unknown>;
    expect(r.status).toBe("ingesting");
    expect(result.dataChanged).toMatchObject({ entityType: "slide_factory_run", entityId: 99 });
    // Lorenzo fired asynchronously — just confirm updateSlideFactoryRun was called with ingesting
    expect(mockUpdateSlideFactoryRun).toHaveBeenCalledWith(
      99,
      expect.objectContaining({ status: "ingesting" }),
    );
  });

  it("no brief recorded: returns error without transitioning", async () => {
    mockGetSlideFactoryRun.mockResolvedValue(makeRun({ id: 99, status: "new", briefR2Key: null }));
    const result = await dispatchRebeccaTool("accept_slide_factory_brief", { id: 99 }, CTX);
    expect((result.result as Record<string, unknown>).error).toMatch(/no brief/i);
    expect(mockUpdateSlideFactoryRun).not.toHaveBeenCalled();
  });

  it("wrong status: returns error without transitioning", async () => {
    mockGetSlideFactoryRun.mockResolvedValue(
      makeRun({ id: 99, status: "ingested", briefR2Key: "uploads/abc.pdf" }),
    );
    const result = await dispatchRebeccaTool("accept_slide_factory_brief", { id: 99 }, CTX);
    expect((result.result as Record<string, unknown>).error).toMatch(/new/);
    expect(mockUpdateSlideFactoryRun).not.toHaveBeenCalled();
  });
});

// ── assign_slide_factory_properties ──────────────────────────────────────────

describe("assign_slide_factory_properties", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSlideFactoryRun.mockResolvedValue(makeRun({ id: 99, status: "ingested" }));
    mockUpdateSlideFactoryRun.mockResolvedValue(makeRun({ id: 99, status: "drafting" }));
    mockGetProperty.mockResolvedValue({ id: 52, userId: 7 });
  });

  it("happy path: assigns properties, transitions to drafting, fires Lucca, emits dataChanged", async () => {
    const result = await dispatchRebeccaTool(
      "assign_slide_factory_properties",
      { id: 99, slide1PropertyId: 52 },
      CTX,
    );
    const r = result.result as Record<string, unknown>;
    expect(r.status).toBe("drafting");
    expect(result.dataChanged).toMatchObject({ entityType: "slide_factory_run", entityId: 99 });
    expect(mockUpdateSlideFactoryRun).toHaveBeenCalledWith(
      99,
      expect.objectContaining({ status: "drafting", slide1PropertyId: 52 }),
    );
  });

  it("wrong status: returns error without writing", async () => {
    mockGetSlideFactoryRun.mockResolvedValue(makeRun({ id: 99, status: "draft_review" }));
    const result = await dispatchRebeccaTool(
      "assign_slide_factory_properties",
      { id: 99, slide1PropertyId: 52 },
      CTX,
    );
    expect((result.result as Record<string, unknown>).error).toMatch(/ingested/);
    expect(mockUpdateSlideFactoryRun).not.toHaveBeenCalled();
  });

  it("property not owned by caller: returns error without writing", async () => {
    mockGetProperty.mockResolvedValue({ id: 52, userId: 999 });
    const result = await dispatchRebeccaTool(
      "assign_slide_factory_properties",
      { id: 99, slide1PropertyId: 52 },
      CTX,
    );
    expect((result.result as Record<string, unknown>).error).toMatch(/not found or not owned/i);
    expect(mockUpdateSlideFactoryRun).not.toHaveBeenCalled();
  });
});

// ── update_slide_factory_slot ─────────────────────────────────────────────────

describe("update_slide_factory_slot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSlideFactoryRun.mockResolvedValue(makeDraftReviewRun(false));
    mockUpdateSlideFactoryRun.mockResolvedValue(undefined);
  });

  it("happy path — update value: writes updated slot and emits dataChanged", async () => {
    const result = await dispatchRebeccaTool(
      "update_slide_factory_slot",
      { id: 99, slotKey: "slide1.headerSubtitle", value: "Revised text" },
      CTX,
    );
    expect(result.dataChanged).toMatchObject({ entityType: "slide_factory_run", entityId: 99 });
    const r = result.result as Record<string, unknown>;
    expect(r.slotKey).toBe("slide1.headerSubtitle");
  });

  it("happy path — approve only: sets approved + approvedAt without changing value", async () => {
    const result = await dispatchRebeccaTool(
      "update_slide_factory_slot",
      { id: 99, slotKey: "slide1.headerSubtitle", approved: true },
      CTX,
    );
    const r = result.result as Record<string, unknown>;
    const slot = r.slot as Record<string, unknown>;
    expect(slot.approved).toBe(true);
    expect(slot.approvedAt).toBeDefined();
  });

  it("slot not found: returns error without writing", async () => {
    const result = await dispatchRebeccaTool(
      "update_slide_factory_slot",
      { id: 99, slotKey: "slide3.conceptParagraph", value: "New text" },
      CTX,
    );
    expect((result.result as Record<string, unknown>).error).toMatch(/not found/i);
    expect(mockUpdateSlideFactoryRun).not.toHaveBeenCalled();
  });

  it("wrong status (building): returns error without writing", async () => {
    mockGetSlideFactoryRun.mockResolvedValue(makeRun({ id: 99, status: "building" }));
    const result = await dispatchRebeccaTool(
      "update_slide_factory_slot",
      { id: 99, slotKey: "slide1.headerSubtitle", value: "Text" },
      CTX,
    );
    expect((result.result as Record<string, unknown>).error).toMatch(/draft_review/);
    expect(mockUpdateSlideFactoryRun).not.toHaveBeenCalled();
  });

  it("complete run — slot edit stamps source as 'admin-override'", async () => {
    mockGetSlideFactoryRun.mockResolvedValue(
      makeRun({
        id: 99,
        status: "complete",
        luccaDraft: {
          "slide1.headerSubtitle": {
            value: "Original text",
            approved: true,
            approvedAt: "2026-05-07T00:00:00.000Z",
            source: "lucca" as const,
          },
        },
      }),
    );
    const result = await dispatchRebeccaTool(
      "update_slide_factory_slot",
      { id: 99, slotKey: "slide1.headerSubtitle", value: "Overridden text" },
      CTX,
    );
    expect(result.dataChanged).toMatchObject({ entityType: "slide_factory_run", entityId: 99 });
    const call = mockUpdateSlideFactoryRun.mock.calls[0][1] as {
      luccaDraft: Record<string, { source: string; value: string }>;
    };
    expect(call.luccaDraft["slide1.headerSubtitle"].source).toBe("admin-override");
    expect(call.luccaDraft["slide1.headerSubtitle"].value).toBe("Overridden text");
  });

  it("neither value nor approved provided: returns error", async () => {
    const result = await dispatchRebeccaTool(
      "update_slide_factory_slot",
      { id: 99, slotKey: "slide1.headerSubtitle" },
      CTX,
    );
    expect((result.result as Record<string, unknown>).error).toBeDefined();
    expect(mockUpdateSlideFactoryRun).not.toHaveBeenCalled();
  });
});

// ── approve_all_slide_factory_slots ───────────────────────────────────────────

describe("approve_all_slide_factory_slots", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSlideFactoryRun.mockResolvedValue(makeDraftReviewRun(false));
    mockUpdateSlideFactoryRun.mockResolvedValue(undefined);
  });

  it("happy path: marks all slots approved and emits dataChanged", async () => {
    const result = await dispatchRebeccaTool("approve_all_slide_factory_slots", { id: 99 }, CTX);
    const r = result.result as Record<string, unknown>;
    expect(r.slotsApproved).toBe(1);
    expect(result.dataChanged).toMatchObject({ entityType: "slide_factory_run", entityId: 99 });
    const call = mockUpdateSlideFactoryRun.mock.calls[0][1] as Record<string, unknown>;
    const draft = call.luccaDraft as Record<string, { approved: boolean }>;
    expect(draft["slide1.headerSubtitle"].approved).toBe(true);
  });

  it("wrong status: returns error without writing", async () => {
    mockGetSlideFactoryRun.mockResolvedValue(makeRun({ id: 99, status: "building" }));
    const result = await dispatchRebeccaTool("approve_all_slide_factory_slots", { id: 99 }, CTX);
    expect((result.result as Record<string, unknown>).error).toMatch(/draft_review/);
    expect(mockUpdateSlideFactoryRun).not.toHaveBeenCalled();
  });
});

// ── trigger_slide_factory_build ───────────────────────────────────────────────

describe("trigger_slide_factory_build", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSlideFactoryRun.mockResolvedValue(makeDraftReviewRun(true));
    mockUpdateSlideFactoryRun.mockResolvedValue(makeRun({ id: 99, status: "building" }));
  });

  it("happy path: transitions to building, fires Marco fire-and-forget, emits dataChanged", async () => {
    const result = await dispatchRebeccaTool("trigger_slide_factory_build", { id: 99 }, CTX);
    const r = result.result as Record<string, unknown>;
    expect(r.status).toBe("building");
    expect(result.dataChanged).toMatchObject({ entityType: "slide_factory_run", entityId: 99 });
    expect(mockUpdateSlideFactoryRun).toHaveBeenCalledWith(99, { status: "building" });
    // Marco is fired asynchronously — assert the mock was called (fire-and-forget)
    expect((runMarco as Mock)).toHaveBeenCalledWith(99);
  });

  it("unapproved slots: returns error with slot list, does not fire Marco", async () => {
    mockGetSlideFactoryRun.mockResolvedValue(makeDraftReviewRun(false));
    const result = await dispatchRebeccaTool("trigger_slide_factory_build", { id: 99 }, CTX);
    const r = result.result as Record<string, unknown>;
    expect(r.error).toMatch(/not yet approved/);
    expect(r.unapprovedSlots).toBeDefined();
    expect(mockUpdateSlideFactoryRun).not.toHaveBeenCalled();
    expect((runMarco as Mock)).not.toHaveBeenCalled();
  });

  it("wrong status: returns error without firing Marco", async () => {
    mockGetSlideFactoryRun.mockResolvedValue(makeRun({ id: 99, status: "building" }));
    const result = await dispatchRebeccaTool("trigger_slide_factory_build", { id: 99 }, CTX);
    expect((result.result as Record<string, unknown>).error).toMatch(/draft_review/);
    expect((runMarco as Mock)).not.toHaveBeenCalled();
  });
});

// ── produce_slide_factory_deck ────────────────────────────────────────────────

describe("produce_slide_factory_deck", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSlideFactoryRun.mockResolvedValue(
      makeRun({ id: 99, status: "complete", deckR2Key: null }),
    );
  });

  it("happy path: calls Franco, returns { ok: true, deckR2Key } and emits dataChanged", async () => {
    (runFranco as Mock).mockResolvedValue({ deckR2Key: "factory-runs/99/deck.pdf" });
    const result = await dispatchRebeccaTool(
      "produce_slide_factory_deck",
      { runId: 99 },
      CTX,
    );
    const r = result.result as Record<string, unknown>;
    expect(r.ok).toBe(true);
    expect(r.deckR2Key).toBe("factory-runs/99/deck.pdf");
    expect(result.dataChanged).toMatchObject({
      entityType: "slide_factory_run",
      entityId: 99,
    });
    expect(runFranco).toHaveBeenCalledWith(99, { caller: "rebecca" });
  });

  it("error path: Franco throws → returns { ok: false, error } (still emits dataChanged so panel re-renders)", async () => {
    (runFranco as Mock).mockRejectedValue(new Error("Playwright disconnected"));
    const result = await dispatchRebeccaTool(
      "produce_slide_factory_deck",
      { runId: 99 },
      CTX,
    );
    const r = result.result as Record<string, unknown>;
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Playwright disconnected/);
    expect(result.dataChanged).toMatchObject({
      entityType: "slide_factory_run",
      entityId: 99,
    });
  });

  it("run not found: returns error without calling Franco", async () => {
    mockGetSlideFactoryRun.mockResolvedValue(null);
    const result = await dispatchRebeccaTool(
      "produce_slide_factory_deck",
      { runId: 9999 },
      CTX,
    );
    expect((result.result as Record<string, unknown>).error).toMatch(/9999/);
    expect(runFranco).not.toHaveBeenCalled();
    expect(result.dataChanged).toBeUndefined();
  });

  it("invalid runId: returns error without calling storage or Franco", async () => {
    const result = await dispatchRebeccaTool(
      "produce_slide_factory_deck",
      { runId: "not-a-number" },
      CTX,
    );
    expect((result.result as Record<string, unknown>).error).toBeDefined();
    expect(mockGetSlideFactoryRun).not.toHaveBeenCalled();
    expect(runFranco).not.toHaveBeenCalled();
  });
});

// ── rebuild_slide_factory_deck ────────────────────────────────────────────────

describe("rebuild_slide_factory_deck", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSlideFactoryRun.mockResolvedValue(
      makeRun({ id: 99, status: "complete", deckR2Key: "factory-runs/99/deck.pdf" }),
    );
    mockUpdateSlideFactoryRun.mockResolvedValue(makeRun({ id: 99, status: "rebuilding" }));
  });

  it("happy path: transitions to rebuilding, fires Franco, emits dataChanged", async () => {
    (runFranco as Mock).mockResolvedValue({ deckR2Key: "factory-runs/99/deck.pdf" });
    const result = await dispatchRebeccaTool("rebuild_slide_factory_deck", { id: 99 }, CTX);
    const r = result.result as Record<string, unknown>;
    expect(r.status).toBe("rebuilding");
    expect(r.message).toMatch(/rebuild started/i);
    expect(result.dataChanged).toMatchObject({ entityType: "slide_factory_run", entityId: 99 });
    expect(mockUpdateSlideFactoryRun).toHaveBeenCalledWith(99, { status: "rebuilding" });
    // Flush microtasks so the fire-and-forget IIFE executes
    await Promise.resolve();
    await Promise.resolve();
    expect(runFranco).toHaveBeenCalledWith(99, { caller: "rebuild", skipDeckKeyWrite: true });
  });

  it("wrong status (building): returns error without firing Franco", async () => {
    mockGetSlideFactoryRun.mockResolvedValue(makeRun({ id: 99, status: "building" }));
    const result = await dispatchRebeccaTool("rebuild_slide_factory_deck", { id: 99 }, CTX);
    expect((result.result as Record<string, unknown>).error).toMatch(/complete/);
    expect(mockUpdateSlideFactoryRun).not.toHaveBeenCalled();
  });

  it("already rebuilding: returns 409-style error", async () => {
    mockGetSlideFactoryRun.mockResolvedValue(makeRun({ id: 99, status: "rebuilding" }));
    const result = await dispatchRebeccaTool("rebuild_slide_factory_deck", { id: 99 }, CTX);
    expect((result.result as Record<string, unknown>).error).toMatch(/already in progress/);
    expect(mockUpdateSlideFactoryRun).not.toHaveBeenCalled();
  });

  it("run not found: returns error without calling update or Franco", async () => {
    mockGetSlideFactoryRun.mockResolvedValue(null);
    const result = await dispatchRebeccaTool("rebuild_slide_factory_deck", { id: 9999 }, CTX);
    expect((result.result as Record<string, unknown>).error).toMatch(/9999/);
    expect(mockUpdateSlideFactoryRun).not.toHaveBeenCalled();
  });

  it("invalid id: returns error without calling storage", async () => {
    const result = await dispatchRebeccaTool("rebuild_slide_factory_deck", { id: "bad" }, CTX);
    expect((result.result as Record<string, unknown>).error).toBeDefined();
    expect(mockGetSlideFactoryRun).not.toHaveBeenCalled();
  });
});

// ── Integration: create → record_brief sequence ───────────────────────────────

describe("integration — create_run + record_slide_factory_brief sequence", () => {
  it("both tools emit dataChanged for the same run id", async () => {
    vi.clearAllMocks();
    mockCreateSlideFactoryRun.mockResolvedValue(makeRun({ id: 55, status: "new" }));
    mockGetSlideFactoryRun.mockResolvedValue(makeRun({ id: 55, status: "new" }));
    mockUpdateSlideFactoryRun.mockResolvedValue(makeRun({ id: 55, status: "new", briefFilename: "brief.pdf" }));

    const createResult = await dispatchRebeccaTool("create_slide_factory_run", {}, CTX);
    const recordResult = await dispatchRebeccaTool(
      "record_slide_factory_brief",
      { id: 55, r2Key: "uploads/brief.pdf", filename: "brief.pdf" },
      CTX,
    );

    expect(createResult.dataChanged?.entityId).toBe(55);
    expect(recordResult.dataChanged?.entityId).toBe(55);
    expect(createResult.dataChanged?.entityType).toBe("slide_factory_run");
    expect(recordResult.dataChanged?.entityType).toBe("slide_factory_run");
  });
});
