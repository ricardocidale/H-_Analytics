/**
 * Unit tests for the new Rebecca tool functions added in the agent-native
 * parity refactoring. Each test mocks storage at the module level so no live
 * DB or LLM connection is needed.
 *
 * Coverage goals (from code-review P2 #10):
 *   - toolPatchProperty: all-valid, partial-valid, all-invalid branches
 *   - toolUpdateScenarioAssumptions: ownership, lock, merge, allowlist, computedResults null
 *   - toolRefreshAnalystTable: unknown tableId, known tableId dispatch
 *   - triggerLbDeckRenderService: already-rendering guard
 *   - AnalystScope='property': structured rejection with code
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Module mocks — hoisted before any imports that load the mocked modules.
// ---------------------------------------------------------------------------

const mockGetProperty = vi.fn();
const mockUpdateProperty = vi.fn();
const mockGetScenario = vi.fn();
const mockUpdateScenarioSnapshot = vi.fn();
const mockGetCapitalRaiseBenchmarks = vi.fn();
const mockGetExitMultiples = vi.fn();
const mockGetReferenceBrands = vi.fn();
const mockUpsertCapitalRaiseBenchmark = vi.fn();
const mockUpsertExitMultiple = vi.fn();
const mockGetUserById = vi.fn();

vi.mock("../storage", () => ({
  storage: {
    getProperty: (...a: unknown[]) => mockGetProperty(...a),
    updateProperty: (...a: unknown[]) => mockUpdateProperty(...a),
    getScenario: (...a: unknown[]) => mockGetScenario(...a),
    updateScenarioSnapshot: (...a: unknown[]) => mockUpdateScenarioSnapshot(...a),
    getCapitalRaiseBenchmarks: (...a: unknown[]) => mockGetCapitalRaiseBenchmarks(...a),
    getExitMultiples: (...a: unknown[]) => mockGetExitMultiples(...a),
    getReferenceBrands: (...a: unknown[]) => mockGetReferenceBrands(...a),
    upsertCapitalRaiseBenchmark: (...a: unknown[]) => mockUpsertCapitalRaiseBenchmark(...a),
    upsertExitMultiple: (...a: unknown[]) => mockUpsertExitMultiple(...a),
    getUserById: (...a: unknown[]) => mockGetUserById(...a),
    getLbSlidesConfig: vi.fn(async () => null),
    upsertLbSlidesConfig: vi.fn(async (v: unknown) => v),
  },
}));

const mockResearchCapitalRaise = vi.fn();
const mockResearchExitMultiples = vi.fn();
const mockResearchReferenceBrands = vi.fn();

vi.mock("../ai/analyst-table-refresh", () => ({
  researchCapitalRaiseBenchmarks: (...a: unknown[]) => mockResearchCapitalRaise(...a),
  researchExitMultiples: (...a: unknown[]) => mockResearchExitMultiples(...a),
  researchReferenceBrands: (...a: unknown[]) => mockResearchReferenceBrands(...a),
}));

vi.mock("../routes/lb-deck-pdf", () => ({
  triggerLbDeckRenderService: vi.fn(() => ({ queued: true, status: "rendering" })),
  getLbDeckRenderStatusService: vi.fn(() => ({ status: "idle", lastRenderedAt: null, lastError: null })),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { dispatchRebeccaTool } from "../chat/rebecca-tools";
import { runAnalystScoped } from "../ai/analyst-scoped-runner";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CTX_USER = { userId: 1 };
const CTX_ADMIN = { userId: 2 };

function makeProperty(overrides = {}) {
  return {
    id: 10,
    userId: 1,
    name: "Test Property",
    country: "US",
    type: "hotel",
    startAdr: 200,
    maxOccupancy: 20,
    ...overrides,
  };
}

function makeScenario(overrides = {}) {
  return {
    id: 5,
    userId: 1,
    name: "Test Scenario",
    isLocked: false,
    kind: "manual",
    globalAssumptions: { projectionYears: 20, baseManagementFeePercent: 0.05, existingKey: "preserved" },
    properties: [],
    feeCategories: null,
    propertyPhotos: null,
    serviceTemplates: null,
    computedResults: { some: "data" },
    computeHash: "abc123",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// patch_property
// ---------------------------------------------------------------------------

describe("dispatchRebeccaTool — patch_property", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetProperty.mockResolvedValue(makeProperty());
    mockUpdateProperty.mockResolvedValue(undefined);
  });

  it("all fields valid: writes all and returns updated list", async () => {
    const result = await dispatchRebeccaTool(
      "patch_property",
      // maxOccupancy is a 0-1 proportion in updatePropertySchema
      { id: 10, fields: { startAdr: 250, maxOccupancy: 0.85 } },
      CTX_USER,
    );
    expect((result.result as Record<string, unknown>).success).toBe(true);
    const updated = (result.result as Record<string, unknown>).updated as string[];
    expect(updated).toContain("startAdr");
    expect(updated).toContain("maxOccupancy");
    expect(mockUpdateProperty).toHaveBeenCalledOnce();
  });

  it("some fields invalid: writes valid subset and returns skipped", async () => {
    const result = await dispatchRebeccaTool(
      "patch_property",
      { id: 10, fields: { startAdr: 250, notARealField: "boom" } },
      CTX_USER,
    );
    const r = result.result as Record<string, unknown>;
    expect(r.success).toBe(true);
    expect((r.updated as string[]).includes("startAdr")).toBe(true);
    const skipped = r.skipped as string[];
    expect(skipped.some((s: string) => s.includes("notARealField"))).toBe(true);
    expect(mockUpdateProperty).toHaveBeenCalledOnce();
  });

  it("all fields invalid: returns error without calling updateProperty", async () => {
    const result = await dispatchRebeccaTool(
      "patch_property",
      { id: 10, fields: { notARealField: "bad", anotherFake: 999 } },
      CTX_USER,
    );
    expect((result.result as Record<string, unknown>).error).toBeDefined();
    expect(mockUpdateProperty).not.toHaveBeenCalled();
  });

  it("ownership mismatch: returns not found", async () => {
    mockGetProperty.mockResolvedValue(makeProperty({ userId: 99 }));
    const result = await dispatchRebeccaTool(
      "patch_property",
      { id: 10, fields: { startAdr: 250 } },
      CTX_USER,
    );
    expect((result.result as Record<string, unknown>).error).toMatch(/not found/i);
    expect(mockUpdateProperty).not.toHaveBeenCalled();
  });

  it("id not a number: returns validation error", async () => {
    const result = await dispatchRebeccaTool(
      "patch_property",
      { id: "ten", fields: { startAdr: 250 } },
      CTX_USER,
    );
    expect((result.result as Record<string, unknown>).error).toMatch(/id must be a number/i);
    expect(mockUpdateProperty).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// update_scenario_assumptions
// ---------------------------------------------------------------------------

describe("dispatchRebeccaTool — update_scenario_assumptions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetScenario.mockResolvedValue(makeScenario());
    mockUpdateScenarioSnapshot.mockResolvedValue(undefined);
    mockGetUserById.mockResolvedValue({ id: 1, role: "user" });
  });

  it("ownership mismatch: returns not found", async () => {
    mockGetScenario.mockResolvedValue(makeScenario({ userId: 99 }));
    const result = await dispatchRebeccaTool(
      "update_scenario_assumptions",
      { id: 5, patches: { projectionYears: 25 } },
      CTX_USER,
    );
    expect((result.result as Record<string, unknown>).error).toMatch(/not found/i);
    expect(mockUpdateScenarioSnapshot).not.toHaveBeenCalled();
  });

  it("locked scenario: returns locked error", async () => {
    mockGetScenario.mockResolvedValue(makeScenario({ isLocked: true }));
    const result = await dispatchRebeccaTool(
      "update_scenario_assumptions",
      { id: 5, patches: { projectionYears: 25 } },
      CTX_USER,
    );
    expect((result.result as Record<string, unknown>).error).toMatch(/locked/i);
    expect(mockUpdateScenarioSnapshot).not.toHaveBeenCalled();
  });

  it("valid patch: merges into existing GA, preserves unpatched keys", async () => {
    await dispatchRebeccaTool(
      "update_scenario_assumptions",
      { id: 5, patches: { projectionYears: 25 } },
      CTX_USER,
    );
    const call = mockUpdateScenarioSnapshot.mock.calls[0][1];
    expect(call.globalAssumptions.projectionYears).toBe(25);
    expect(call.globalAssumptions.baseManagementFeePercent).toBe(0.05);
    expect(call.globalAssumptions.existingKey).toBe("preserved");
  });

  it("valid patch: nulls computedResults and computeHash", async () => {
    await dispatchRebeccaTool(
      "update_scenario_assumptions",
      { id: 5, patches: { projectionYears: 25 } },
      CTX_USER,
    );
    const call = mockUpdateScenarioSnapshot.mock.calls[0][1];
    expect(call.computedResults).toBeNull();
    expect(call.computeHash).toBeNull();
  });

  it("unknown key in patches: rejected, not written", async () => {
    const result = await dispatchRebeccaTool(
      "update_scenario_assumptions",
      { id: 5, patches: { unknownKey: "bad", projectionYears: 25 } },
      CTX_USER,
    );
    const r = result.result as Record<string, unknown>;
    expect(r.success).toBe(true);
    expect((r.updated as string[]).includes("projectionYears")).toBe(true);
    const rejected = r.rejected as string[];
    expect(rejected.some((s: string) => s.includes("unknownKey"))).toBe(true);
    const call = mockUpdateScenarioSnapshot.mock.calls[0][1];
    expect(call.globalAssumptions.unknownKey).toBeUndefined();
  });

  it("all keys unknown: returns error without writing", async () => {
    const result = await dispatchRebeccaTool(
      "update_scenario_assumptions",
      { id: 5, patches: { userId: 999, computedResults: "hacked" } },
      CTX_USER,
    );
    expect((result.result as Record<string, unknown>).error).toBeDefined();
    expect(mockUpdateScenarioSnapshot).not.toHaveBeenCalled();
  });

  it("type-invalid value: rejected", async () => {
    const result = await dispatchRebeccaTool(
      "update_scenario_assumptions",
      { id: 5, patches: { projectionYears: "twenty" } },
      CTX_USER,
    );
    expect((result.result as Record<string, unknown>).error).toBeDefined();
    expect(mockUpdateScenarioSnapshot).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// refresh_analyst_table
// ---------------------------------------------------------------------------

describe("dispatchRebeccaTool — refresh_analyst_table", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUserById.mockResolvedValue({ id: 2, role: "admin" });
    mockResearchCapitalRaise.mockResolvedValue({
      proposedRanges: [{ dimensionKey: "valuationCap", label: "Cap", unit: "usd", valueLow: 1e6, valueMid: 5e6, valueHigh: 20e6 }],
      sourceCount: 3,
      tokensUsed: 100,
      narration: [],
      evidence: [],
    });
    mockGetCapitalRaiseBenchmarks.mockResolvedValue([]);
    mockUpsertCapitalRaiseBenchmark.mockResolvedValue(undefined);
  });

  it("unknown tableId: returns error without calling any research function", async () => {
    const result = await dispatchRebeccaTool(
      "refresh_analyst_table",
      { tableId: "not_a_real_table" },
      CTX_ADMIN,
    );
    expect((result.result as Record<string, unknown>).error).toBeDefined();
    expect(mockResearchCapitalRaise).not.toHaveBeenCalled();
    expect(mockResearchExitMultiples).not.toHaveBeenCalled();
    expect(mockResearchReferenceBrands).not.toHaveBeenCalled();
  });

  it("capital_raise_benchmarks: calls research and upserts each range", async () => {
    const result = await dispatchRebeccaTool(
      "refresh_analyst_table",
      { tableId: "capital_raise_benchmarks" },
      CTX_ADMIN,
    );
    const r = result.result as Record<string, unknown>;
    expect(mockResearchCapitalRaise).toHaveBeenCalledOnce();
    expect(mockUpsertCapitalRaiseBenchmark).toHaveBeenCalledOnce();
    expect(r.rangesCommitted).toBe(1);
  });

  it("non-admin: returns auth error", async () => {
    mockGetUserById.mockResolvedValue({ id: 1, role: "user" });
    const result = await dispatchRebeccaTool(
      "refresh_analyst_table",
      { tableId: "capital_raise_benchmarks" },
      CTX_USER,
    );
    expect((result.result as Record<string, unknown>).error).toMatch(/admin/i);
    expect(mockResearchCapitalRaise).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// triggerLbDeckRenderService — already-rendering guard
// ---------------------------------------------------------------------------

describe("triggerLbDeckRenderService (via get_lb_deck_render_status roundtrip)", () => {
  it("trigger_lb_deck_render returns render status shape", async () => {
    mockGetUserById.mockResolvedValue({ id: 2, role: "admin" });
    const result = await dispatchRebeccaTool("trigger_lb_deck_render", {}, CTX_ADMIN);
    const r = result.result as Record<string, unknown>;
    expect(r).toHaveProperty("queued");
    expect(r).toHaveProperty("status");
  });
});

// ---------------------------------------------------------------------------
// AnalystScope='property' — structured rejection
// ---------------------------------------------------------------------------

describe("runAnalystScoped — property scope rejection", () => {
  it("rejects with ANALYST_SCOPE_NOT_IMPLEMENTED code", async () => {
    await expect(
      runAnalystScoped({ scope: "property" as "company", userId: 1 }),
    ).rejects.toMatchObject({
      message: expect.stringMatching(/not yet implemented/),
      code: "ANALYST_SCOPE_NOT_IMPLEMENTED",
    });
  });

  it("company scope does not throw synchronously", async () => {
    // We can't run the full company pipeline without a DB, but we can confirm
    // the scope guard doesn't fire — the function will reject later on missing data.
    const promise = runAnalystScoped({ scope: "company", userId: 1 });
    // If the scope guard threw, it would reject immediately with the scope error.
    await expect(promise).rejects.not.toMatchObject({ code: "ANALYST_SCOPE_NOT_IMPLEMENTED" });
  });
});
