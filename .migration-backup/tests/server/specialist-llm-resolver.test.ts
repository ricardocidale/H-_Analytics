/**
 * Task #501 — per-Specialist LLM/workflow override resolver + runtime gate.
 *
 * The resolver lives at `server/ai/specialist-llm-resolver.ts` and is the
 * single source of truth for:
 *   • `resolveSpecialistOrchestratorOverrides` — per-row Analyst-A/B,
 *     synthesis, fallback, primary model + multi-model toggle
 *   • `resolveSpecialistPolicyThresholds` — relaxation engine knobs
 *     (`minEvidenceScore`, `minCompCount`, `relaxationMaxLevel`,
 *     `stalenessThresholdHours`)
 *   • `resolveSpecialistRuntimeLimits` — concurrency + token budgets
 *   • `checkSpecialistRuntimeGate` — pre-dispatch gate that combines the
 *     above with live `research_runs` queries
 *
 * These tests stub `server/storage` so we can drive every resolution
 * branch without touching the database. They guard the contract the
 * route handler in `server/routes/research.ts` and the
 * `runAnalystScoped` helper in `server/ai/analyst-scoped-runner.ts`
 * both rely on (a `{ allowed: false, reason, limit, observed }` shape
 * for refusals; a 3-step Specialist→pipeline→hardcoded fallback chain
 * for resolutions).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../../server/storage", () => ({
  storage: {
    getSpecialistConfig: vi.fn(),
    getAdminResourceById: vi.fn(),
    getPipelinePolicies: vi.fn(),
    countRunningResearchRunsForSpecialist: vi.fn(),
    sumTokensUsedForSpecialistSince: vi.fn(),
    getAdminResourceBySlug: vi.fn(),
  },
}));

import { storage } from "../../server/storage";
import {
  resolveSpecialistOrchestratorOverrides,
  resolveSpecialistPolicyThresholds,
  resolveSpecialistRuntimeLimits,
  checkSpecialistRuntimeGate,
  getSpecialistGlobalLlmDefaults,
  HARDCODED_LLM_DEFAULTS,
  HARDCODED_WORKFLOW_DEFAULTS,
} from "../../server/ai/specialist-llm-resolver";

const mockStorage = storage as unknown as {
  getSpecialistConfig: ReturnType<typeof vi.fn>;
  getAdminResourceById: ReturnType<typeof vi.fn>;
  getPipelinePolicies: ReturnType<typeof vi.fn>;
  countRunningResearchRunsForSpecialist: ReturnType<typeof vi.fn>;
  sumTokensUsedForSpecialistSince: ReturnType<typeof vi.fn>;
  getAdminResourceBySlug: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  mockStorage.getSpecialistConfig.mockReset();
  mockStorage.getAdminResourceById.mockReset();
  mockStorage.getPipelinePolicies.mockReset().mockResolvedValue([]);
  mockStorage.countRunningResearchRunsForSpecialist.mockReset().mockResolvedValue(0);
  mockStorage.sumTokensUsedForSpecialistSince.mockReset().mockResolvedValue(0);
  mockStorage.getAdminResourceBySlug.mockReset().mockResolvedValue(null);
});

describe("resolveSpecialistOrchestratorOverrides", () => {
  it("returns undefined when specialistId is null/undefined", async () => {
    expect(await resolveSpecialistOrchestratorOverrides(null)).toBeUndefined();
    expect(await resolveSpecialistOrchestratorOverrides(undefined)).toBeUndefined();
    expect(mockStorage.getSpecialistConfig).not.toHaveBeenCalled();
  });

  it("returns undefined when no config row exists", async () => {
    mockStorage.getSpecialistConfig.mockResolvedValue(null);
    expect(await resolveSpecialistOrchestratorOverrides("foo")).toBeUndefined();
  });

  it("returns undefined when config row has no model overrides AND no multiModelEnabled toggle", async () => {
    mockStorage.getSpecialistConfig.mockResolvedValue({
      modelResourceId: null,
      analystAModelResourceId: null,
      analystBModelResourceId: null,
      synthesisModelResourceId: null,
      fallbackModelResourceId: null,
      multiModelEnabled: null,
    });
    expect(await resolveSpecialistOrchestratorOverrides("foo")).toBeUndefined();
  });

  it("resolves AdminResource ids to model slugs", async () => {
    mockStorage.getSpecialistConfig.mockResolvedValue({
      modelResourceId: 1,
      analystAModelResourceId: 2,
      analystBModelResourceId: 3,
      synthesisModelResourceId: 4,
      fallbackModelResourceId: 5,
      multiModelEnabled: true,
    });
    const slugByIdMap: Record<number, { kind: string; slug: string }> = {
      1: { kind: "model", slug: "gpt-5" },
      2: { kind: "model", slug: "gemini-2.5-flash" },
      3: { kind: "model", slug: "claude-sonnet-4-5" },
      4: { kind: "model", slug: "claude-opus-4-6" },
      5: { kind: "model", slug: "gpt-4o" },
    };
    mockStorage.getAdminResourceById.mockImplementation(async (id: number) => slugByIdMap[id] ?? null);

    const out = await resolveSpecialistOrchestratorOverrides("foo");
    expect(out).toEqual({
      primaryModel: "gpt-5",
      analystAModel: "gemini-2.5-flash",
      analystBModel: "claude-sonnet-4-5",
      synthesisModel: "claude-opus-4-6",
      fallbackModel: "gpt-4o",
      multiModelEnabled: true,
    });
  });

  it("propagates multiModelEnabled=false even when no models are set", async () => {
    mockStorage.getSpecialistConfig.mockResolvedValue({
      modelResourceId: null,
      analystAModelResourceId: null,
      analystBModelResourceId: null,
      synthesisModelResourceId: null,
      fallbackModelResourceId: null,
      multiModelEnabled: false,
    });
    const out = await resolveSpecialistOrchestratorOverrides("foo");
    expect(out).toBeDefined();
    expect(out?.multiModelEnabled).toBe(false);
  });

  it("ignores AdminResource rows whose kind is not 'model'", async () => {
    mockStorage.getSpecialistConfig.mockResolvedValue({
      modelResourceId: 1,
      analystAModelResourceId: null,
      analystBModelResourceId: null,
      synthesisModelResourceId: null,
      fallbackModelResourceId: null,
      multiModelEnabled: null,
    });
    mockStorage.getAdminResourceById.mockResolvedValue({ kind: "tool", slug: "should-not-leak" });
    const out = await resolveSpecialistOrchestratorOverrides("foo");
    expect(out?.primaryModel).toBeUndefined();
  });
});

describe("resolveSpecialistPolicyThresholds", () => {
  it("falls back to hardcoded defaults when nothing is configured", async () => {
    const out = await resolveSpecialistPolicyThresholds("foo");
    expect(out.minEvidenceScore).toBe(HARDCODED_WORKFLOW_DEFAULTS.minEvidenceScore);
    expect(out.minCompCount).toBe(HARDCODED_WORKFLOW_DEFAULTS.minCompCount);
    expect(out.relaxationMaxLevel).toBe(HARDCODED_WORKFLOW_DEFAULTS.relaxationMaxLevel);
    expect(out.stalenessThresholdHours).toBe(HARDCODED_WORKFLOW_DEFAULTS.stalenessThresholdHours);
  });

  it("prefers tier1 pipeline policy over hardcoded defaults", async () => {
    mockStorage.getPipelinePolicies.mockResolvedValue([
      { policyKey: "tier1_property", tier: 1, minEvidenceScore: 0.55, minCompCount: 7, relaxationMaxLevel: 4, stalenessThresholdHours: 240 },
    ]);
    const out = await resolveSpecialistPolicyThresholds("foo");
    expect(out.minEvidenceScore).toBe(0.55);
    expect(out.minCompCount).toBe(7);
    expect(out.relaxationMaxLevel).toBe(4);
    expect(out.stalenessThresholdHours).toBe(240);
  });

  it("prefers Specialist workflowOverrides over tier1 pipeline policy", async () => {
    mockStorage.getPipelinePolicies.mockResolvedValue([
      { policyKey: "tier1_property", tier: 1, minEvidenceScore: 0.55, minCompCount: 7, relaxationMaxLevel: 4, stalenessThresholdHours: 240 },
    ]);
    mockStorage.getSpecialistConfig.mockResolvedValue({
      workflowOverrides: { minEvidenceScore: 0.8, minCompCount: 12, relaxationMaxLevel: 2, stalenessThresholdHours: 48 },
    });
    const out = await resolveSpecialistPolicyThresholds("foo");
    expect(out.minEvidenceScore).toBe(0.8);
    expect(out.minCompCount).toBe(12);
    expect(out.relaxationMaxLevel).toBe(2);
    expect(out.stalenessThresholdHours).toBe(48);
  });

  it("clamps relaxationMaxLevel to 5", async () => {
    mockStorage.getSpecialistConfig.mockResolvedValue({
      workflowOverrides: { relaxationMaxLevel: 99 },
    });
    const out = await resolveSpecialistPolicyThresholds("foo");
    expect(out.relaxationMaxLevel).toBe(5);
  });
});

describe("resolveSpecialistRuntimeLimits", () => {
  it("falls back to hardcoded defaults when nothing is configured", async () => {
    const out = await resolveSpecialistRuntimeLimits("foo");
    expect(out.maxConcurrentRuns).toBe(HARDCODED_WORKFLOW_DEFAULTS.maxConcurrentRuns);
    expect(out.dailyTokenBudget).toBe(HARDCODED_WORKFLOW_DEFAULTS.dailyTokenBudget);
    expect(out.monthlyTokenBudget).toBe(HARDCODED_WORKFLOW_DEFAULTS.monthlyTokenBudget);
  });

  it("prefers Specialist workflowOverrides when set", async () => {
    mockStorage.getPipelinePolicies.mockResolvedValue([
      { policyKey: "tier1_property", tier: 1, maxConcurrentRuns: 5, dailyTokenBudget: 500, monthlyTokenBudget: 5000 },
    ]);
    mockStorage.getSpecialistConfig.mockResolvedValue({
      workflowOverrides: { maxConcurrentRuns: 1, dailyTokenBudget: 100, monthlyTokenBudget: 1000 },
    });
    const out = await resolveSpecialistRuntimeLimits("foo");
    expect(out).toEqual({ maxConcurrentRuns: 1, dailyTokenBudget: 100, monthlyTokenBudget: 1000 });
  });

  it("falls through to tier1 policy when Specialist overrides are unset", async () => {
    mockStorage.getPipelinePolicies.mockResolvedValue([
      { policyKey: "tier1_property", tier: 1, maxConcurrentRuns: 5, dailyTokenBudget: 500, monthlyTokenBudget: 5000 },
    ]);
    mockStorage.getSpecialistConfig.mockResolvedValue({ workflowOverrides: null });
    const out = await resolveSpecialistRuntimeLimits("foo");
    expect(out).toEqual({ maxConcurrentRuns: 5, dailyTokenBudget: 500, monthlyTokenBudget: 5000 });
  });
});

describe("getSpecialistGlobalLlmDefaults", () => {
  it("resolves analystA label from DB resource when ID is set (and returns the ID)", async () => {
    mockStorage.getPipelinePolicies.mockResolvedValue([
      {
        policyKey: "tier1_property", tier: 1,
        analystAModelResourceId: 42,
        analystBModelResourceId: null, synthesisModelResourceId: null, fallbackModelResourceId: null,
      },
    ]);
    mockStorage.getAdminResourceById.mockImplementation(async (id: number) =>
      id === 42
        ? { id: 42, kind: "model", slug: "gemini-2.5-pro", displayName: "Gemini 2.5 Pro" }
        : null,
    );
    const out = await getSpecialistGlobalLlmDefaults();
    expect(out.analystAModelLabel).toBe("Gemini 2.5 Pro");
    expect(out.analystAModelResourceId).toBe(42);
    // Slug fallback must not have been invoked for the A slot
    expect(mockStorage.getAdminResourceBySlug).not.toHaveBeenCalledWith("model", HARDCODED_LLM_DEFAULTS.analystAModel);
  });

  it("resolves all four labels by ID when all four resource IDs are set", async () => {
    mockStorage.getPipelinePolicies.mockResolvedValue([
      {
        policyKey: "tier1_property", tier: 1,
        analystAModelResourceId: 1, analystBModelResourceId: 2,
        synthesisModelResourceId: 3, fallbackModelResourceId: 4,
      },
    ]);
    const resourceMap: Record<number, { id: number; kind: string; slug: string; displayName: string }> = {
      1: { id: 1, kind: "model", slug: "gemini-a", displayName: "Gemini A" },
      2: { id: 2, kind: "model", slug: "claude-b", displayName: "Claude B" },
      3: { id: 3, kind: "model", slug: "opus-s", displayName: "Opus S" },
      4: { id: 4, kind: "model", slug: "fallback-f", displayName: "Fallback F" },
    };
    mockStorage.getAdminResourceById.mockImplementation(async (id: number) => resourceMap[id] ?? null);
    const out = await getSpecialistGlobalLlmDefaults();
    expect(out.analystAModelLabel).toBe("Gemini A");
    expect(out.analystBModelLabel).toBe("Claude B");
    expect(out.synthesisModelLabel).toBe("Opus S");
    expect(out.fallbackModelLabel).toBe("Fallback F");
    expect(mockStorage.getAdminResourceBySlug).not.toHaveBeenCalled();
  });

  it("falls back to slug lookup when the resource row kind is not 'model'", async () => {
    mockStorage.getPipelinePolicies.mockResolvedValue([
      {
        policyKey: "tier1_property", tier: 1,
        analystAModelResourceId: 99,
        analystBModelResourceId: null, synthesisModelResourceId: null, fallbackModelResourceId: null,
      },
    ]);
    // Row exists but is a non-model resource — must NOT leak its displayName
    mockStorage.getAdminResourceById.mockResolvedValue({ id: 99, kind: "tool", slug: "bad-tool", displayName: "Should Not Appear" });
    mockStorage.getAdminResourceBySlug.mockResolvedValue({ displayName: "Gemini 2.5 Flash (slug)" });
    const out = await getSpecialistGlobalLlmDefaults();
    expect(out.analystAModelLabel).toBe("Gemini 2.5 Flash (slug)");
    expect(out.analystAModelLabel).not.toBe("Should Not Appear");
    expect(mockStorage.getAdminResourceBySlug).toHaveBeenCalledWith("model", HARDCODED_LLM_DEFAULTS.analystAModel);
  });
});

describe("checkSpecialistRuntimeGate", () => {
  it("allows runs when no specialistId is provided (preserves pre-Task-501 behavior)", async () => {
    const result = await checkSpecialistRuntimeGate(null);
    expect(result).toEqual({ allowed: true });
    expect(mockStorage.countRunningResearchRunsForSpecialist).not.toHaveBeenCalled();
    expect(mockStorage.sumTokensUsedForSpecialistSince).not.toHaveBeenCalled();
  });

  it("allows runs when no overrides are set and there is no in-flight work", async () => {
    const result = await checkSpecialistRuntimeGate("foo");
    expect(result).toEqual({ allowed: true });
  });

  it("blocks when concurrent runs equal the limit", async () => {
    mockStorage.getSpecialistConfig.mockResolvedValue({
      workflowOverrides: { maxConcurrentRuns: 2 },
    });
    mockStorage.countRunningResearchRunsForSpecialist.mockResolvedValue(2);
    const result = await checkSpecialistRuntimeGate("foo");
    expect(result).toEqual({
      allowed: false,
      reason: "maxConcurrentRuns",
      limit: 2,
      observed: 2,
    });
    // Token budgets should not even be queried once concurrency fails
    expect(mockStorage.sumTokensUsedForSpecialistSince).not.toHaveBeenCalled();
  });

  it("blocks when daily token budget is exceeded", async () => {
    mockStorage.getSpecialistConfig.mockResolvedValue({
      workflowOverrides: { dailyTokenBudget: 1000 },
    });
    mockStorage.sumTokensUsedForSpecialistSince.mockImplementation(async (_id: string, since: Date) => {
      // The daily window is 24h ago; everything before that lives in the
      // monthly query. The first call in the gate is the daily window.
      const ageHrs = (Date.now() - since.getTime()) / (60 * 60 * 1000);
      return ageHrs <= 25 ? 1500 : 0;
    });
    const result = await checkSpecialistRuntimeGate("foo");
    expect(result).toEqual({
      allowed: false,
      reason: "dailyTokenBudget",
      limit: 1000,
      observed: 1500,
    });
  });

  it("blocks when monthly token budget is exceeded but daily is fine", async () => {
    mockStorage.getSpecialistConfig.mockResolvedValue({
      workflowOverrides: { dailyTokenBudget: 100_000, monthlyTokenBudget: 50_000 },
    });
    mockStorage.sumTokensUsedForSpecialistSince.mockImplementation(async (_id: string, since: Date) => {
      const ageHrs = (Date.now() - since.getTime()) / (60 * 60 * 1000);
      // Daily: 5k spent (under 100k cap). Monthly: 60k spent (over 50k cap).
      return ageHrs <= 25 ? 5000 : 60_000;
    });
    const result = await checkSpecialistRuntimeGate("foo");
    expect(result).toEqual({
      allowed: false,
      reason: "monthlyTokenBudget",
      limit: 50_000,
      observed: 60_000,
    });
  });

  it("allows when all gates pass with custom limits", async () => {
    mockStorage.getSpecialistConfig.mockResolvedValue({
      workflowOverrides: { maxConcurrentRuns: 5, dailyTokenBudget: 10_000, monthlyTokenBudget: 100_000 },
    });
    mockStorage.countRunningResearchRunsForSpecialist.mockResolvedValue(2);
    mockStorage.sumTokensUsedForSpecialistSince.mockResolvedValue(1000);
    const result = await checkSpecialistRuntimeGate("foo");
    expect(result).toEqual({ allowed: true });
  });
});
