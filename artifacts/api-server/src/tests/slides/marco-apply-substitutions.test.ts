/**
 * Marco's `apply_substitutions` tool — Factory v2 U8.
 *
 * Verifies the orchestration handler that assembles all 6 slides' cached
 * substitution entries (written by `dispatch_slide_team`) into one
 * Carlo-validated SubstitutionMap, composes the U6 slide-6 image entry,
 * and caches the validated map for U7 to consume.
 *
 * Test scenarios:
 *   - dispatch_slide_team caches the team's substitutionEntries
 *   - apply_substitutions concatenates all 6 slides + the U6 image entry
 *   - apply_substitutions surfaces a Carlo error when an entry is malformed
 *   - apply_substitutions tolerates a U6 image-composition failure
 *     (logs a warning and produces a map without the slide-6 entry)
 *   - clearRunPayloads removes the assembled-map cache on terminal error
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

// ── Mocks (declared BEFORE any module import that pulls them) ───────────────

vi.mock("../../storage/slide-factory-runs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../storage/slide-factory-runs")>();
  return {
    ...actual,
    getSlideFactoryRunById: vi.fn(),
    updateSlideFactoryRun: vi.fn(),
    updateAgentResult: vi.fn(),
  };
});

vi.mock("../../slides/swarms/dispatch", () => ({
  dispatchSlideTeam: vi.fn(),
}));

vi.mock("../../slides/slide-6-report-builder", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../slides/slide-6-report-builder")>();
  return {
    ...actual,
    buildSlide6ImageSubstitutionEntry: vi.fn(),
  };
});

vi.mock("../../logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { getSlideFactoryRunById } from "../../storage/slide-factory-runs";
import { dispatchSlideTeam } from "../../slides/swarms/dispatch";
import { buildSlide6ImageSubstitutionEntry } from "../../slides/slide-6-report-builder";
import {
  dispatchMarcoTool,
  clearRunPayloads,
  getAssembledSubstitutionMap,
  getCachedSubstitutionEntries,
} from "../../slides/marco-tools";
import type { SubstitutionEntry } from "../../slides/pptx-substitution-types";

// ── Fixtures ────────────────────────────────────────────────────────────────

const RUN_ID = 42;

function makeRun(overrides: Record<string, unknown> = {}) {
  return {
    id: RUN_ID,
    status: "building",
    slide1PropertyId: null,
    slide2PropertyId: 11,
    slide3PropertyId: 12,
    slide4PropertyId: 13,
    slide5PropertyId: 14,
    luccaDraft: {},
    agentResults: {},
    briefR2Key: null,
    ...overrides,
  };
}

function makeSlideEntry(
  slideNumber: number,
  shapeId: string,
  text: string,
): SubstitutionEntry {
  return {
    slideNumber,
    shapeId,
    op: "text",
    slotKey: `slide${slideNumber}.test`,
    payload: { text },
  };
}

function makeImageEntry(): SubstitutionEntry {
  return {
    slideNumber: 6,
    shapeId: "Picture 1",
    op: "image",
    slotKey: "slide6.incomeStatement",
    payload: {
      image: Buffer.from("fake-png-bytes"),
      mimeType: "image/png",
      fitMode: "letterbox",
    },
  };
}

async function dispatchSlide(slideNumber: number, entries: SubstitutionEntry[]) {
  (dispatchSlideTeam as Mock).mockResolvedValueOnce({
    slideNumber,
    status: "ok",
    payloadV2: { slideNumber },
    substitutionEntries: entries,
    notes: null,
  });
  await dispatchMarcoTool(
    "dispatch_slide_team",
    { runId: RUN_ID, slideNumber },
    { runId: RUN_ID },
  );
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("Marco / dispatch_slide_team — substitutionEntries cache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRunPayloads(RUN_ID);
    (getSlideFactoryRunById as Mock).mockResolvedValue(makeRun());
  });

  it("populates the per-slide substitutionEntries cache", async () => {
    const entries: SubstitutionEntry[] = [
      makeSlideEntry(1, "Slide1HeaderSubtitle", "Hello"),
    ];
    await dispatchSlide(1, entries);
    const cached = getCachedSubstitutionEntries(RUN_ID, 1);
    expect(cached).toEqual(entries);
  });

  it("tolerates a team that omits substitutionEntries (backward compat)", async () => {
    (dispatchSlideTeam as Mock).mockResolvedValueOnce({
      slideNumber: 1,
      status: "ok",
      payloadV2: {},
      notes: null,
      // substitutionEntries: omitted — simulates a stub team
    });
    await dispatchMarcoTool(
      "dispatch_slide_team",
      { runId: RUN_ID, slideNumber: 1 },
      { runId: RUN_ID },
    );
    const cached = getCachedSubstitutionEntries(RUN_ID, 1);
    expect(cached).toEqual([]);
  });
});

describe("Marco / apply_substitutions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRunPayloads(RUN_ID);
    (getSlideFactoryRunById as Mock).mockResolvedValue(makeRun());
  });

  it("assembles a Carlo-valid map from all 6 slides + the U6 image entry, caches it", async () => {
    // Dispatch 6 slides, each contributing 1 entry.
    await dispatchSlide(1, [makeSlideEntry(1, "Shape1", "Slide 1 text")]);
    await dispatchSlide(2, [makeSlideEntry(2, "Shape2", "Slide 2 text")]);
    await dispatchSlide(3, [makeSlideEntry(3, "Shape3", "Slide 3 text")]);
    await dispatchSlide(4, [makeSlideEntry(4, "Shape4", "Slide 4 text")]);
    await dispatchSlide(5, [makeSlideEntry(5, "Shape5", "Slide 5 text")]);
    await dispatchSlide(6, [makeSlideEntry(6, "Shape6", "Slide 6 disclaimer")]);

    // U6's image helper returns a valid image entry.
    (buildSlide6ImageSubstitutionEntry as Mock).mockResolvedValueOnce(
      makeImageEntry(),
    );

    const out = await dispatchMarcoTool(
      "apply_substitutions",
      {},
      { runId: RUN_ID },
    );

    expect(out.result).toMatchObject({
      ok: true,
      slide6ImageIncluded: true,
    });
    const result = out.result as {
      entriesCount: number;
      slidesAddressed: number[];
    };
    // 6 text entries + 1 image entry
    const EXPECTED_TOTAL_ENTRIES = 7;
    expect(result.entriesCount).toBe(EXPECTED_TOTAL_ENTRIES);
    expect(result.slidesAddressed).toEqual([1, 2, 3, 4, 5, 6]);

    const cached = getAssembledSubstitutionMap(RUN_ID);
    expect(cached).toHaveLength(EXPECTED_TOTAL_ENTRIES);
  });

  it("Carlo rejects the assembly when a cached entry is malformed", async () => {
    // Dispatch with one malformed entry (text op carrying an empty string).
    const bad: SubstitutionEntry = {
      slideNumber: 1,
      shapeId: "Shape1",
      op: "text",
      payload: { text: "" }, // Zod min(1) rejects empty
    } as SubstitutionEntry;
    await dispatchSlide(1, [bad]);

    (buildSlide6ImageSubstitutionEntry as Mock).mockResolvedValueOnce(
      makeImageEntry(),
    );

    const out = await dispatchMarcoTool(
      "apply_substitutions",
      {},
      { runId: RUN_ID },
    );
    expect(out.result).toMatchObject({
      error: expect.stringContaining("Carlo rejected"),
    });
    // Cache should NOT be populated on failure.
    expect(getAssembledSubstitutionMap(RUN_ID)).toBeUndefined();
  });

  it("tolerates a U6 image-composition failure — map still validates without the image entry", async () => {
    await dispatchSlide(1, [makeSlideEntry(1, "Shape1", "Slide 1 text")]);
    (buildSlide6ImageSubstitutionEntry as Mock).mockRejectedValueOnce(
      new Error("engine failed: synthetic"),
    );
    const out = await dispatchMarcoTool(
      "apply_substitutions",
      {},
      { runId: RUN_ID },
    );
    expect(out.result).toMatchObject({
      ok: true,
      slide6ImageIncluded: false,
    });
  });

  it("returns error when the run cannot be found", async () => {
    (getSlideFactoryRunById as Mock).mockResolvedValue(null);
    const out = await dispatchMarcoTool(
      "apply_substitutions",
      {},
      { runId: 9999 },
    );
    expect(out.result).toMatchObject({
      error: expect.stringContaining("Run 9999 not found"),
    });
  });

  it("clearRunPayloads removes the assembled-map cache", async () => {
    await dispatchSlide(1, [makeSlideEntry(1, "Shape1", "Slide 1 text")]);
    (buildSlide6ImageSubstitutionEntry as Mock).mockResolvedValueOnce(
      makeImageEntry(),
    );
    await dispatchMarcoTool("apply_substitutions", {}, { runId: RUN_ID });
    expect(getAssembledSubstitutionMap(RUN_ID)).toBeDefined();
    clearRunPayloads(RUN_ID);
    expect(getAssembledSubstitutionMap(RUN_ID)).toBeUndefined();
    expect(getCachedSubstitutionEntries(RUN_ID, 1)).toBeUndefined();
  });
});
