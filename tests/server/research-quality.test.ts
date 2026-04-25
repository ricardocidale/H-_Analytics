/**
 * Locks the per-Specialist research-quality formula and the gap-code strings.
 *
 * The score blends five signals (resource health, missing fields, freshness,
 * availability, confidence) with documented weights summing to 100. The gap
 * codes (`required_resources_failing`, `research_stale`, etc.) are part of
 * the public API the AI Intelligence UI keys off of — a typo or weight tweak
 * would silently break gap rendering and shift every score in the system.
 *
 * Each test asserts an exact integer score for a deterministic synthetic
 * world, so a future refactor of `computeSpecialistResearchQuality` that
 * rebalances weights or changes a multiplier formula fails CI loudly. Gap
 * vocabulary is locked separately.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Storage mock ────────────────────────────────────────────────────────────
// `computeSpecialistResearchQuality` only touches these five storage methods.
// Each is a vi.fn so individual tests can shape the synthetic world.
const getOrCreateSpecialistConfig = vi.fn();
const listSpecialistAssignments = vi.fn();
const getAdminResourceById = vi.fn();
const getLatestHealthCheck = vi.fn();
const getResearchRunsForSpecialist = vi.fn();

vi.mock("../../server/storage", () => ({
  storage: {
    getOrCreateSpecialistConfig: (id: string) => getOrCreateSpecialistConfig(id),
    listSpecialistAssignments: (id: string) => listSpecialistAssignments(id),
    getAdminResourceById: (id: number) => getAdminResourceById(id),
    getLatestHealthCheck: (id: number) => getLatestHealthCheck(id),
    getResearchRunsForSpecialist: (id: string, limit?: number) =>
      getResearchRunsForSpecialist(id, limit),
  },
}));

import { computeSpecialistResearchQuality } from "../../server/ai/research-quality";

// ── Test fixtures ───────────────────────────────────────────────────────────
// We use `mgmt-co.icp-intelligence` because it has both required assignments
// (model + api) AND non-empty candidateFields (3 of them), exercising both
// the resource-health and missing-fields signal paths in a single specialist.
const SPECIALIST_ID = "mgmt-co.icp-intelligence";

const MODEL_RESOURCE_ID = 101;
const API_RESOURCE_ID = 202;

// Documented weights (kept in this test for explicit comparison — if these
// drift from the implementation the per-weight isolation tests below fail).
const W_RESOURCES = 35;
const W_FIELDS = 20;
const W_FRESHNESS = 15;
const W_AVAILABILITY = 10;
const W_CONFIDENCE = 20;

function buildAssignmentRows(
  opts: { modelResourceId?: number | null; apiResourceId?: number | null } = {},
) {
  const { modelResourceId = MODEL_RESOURCE_ID, apiResourceId = API_RESOURCE_ID } = opts;
  return [
    {
      id: 1,
      specialistId: SPECIALIST_ID,
      assignmentKind: "model",
      assignmentSlug: "primary-llm",
      assignmentRole: "synthesis",
      required: true,
      resourceId: modelResourceId,
      materializedAt: new Date(),
    },
    {
      id: 2,
      specialistId: SPECIALIST_ID,
      assignmentKind: "api",
      assignmentSlug: "web-search",
      assignmentRole: null,
      required: true,
      resourceId: apiResourceId,
      materializedAt: new Date(),
    },
  ];
}

function buildResource(id: number, kind: "model" | "api", slug: string) {
  return {
    id,
    kind,
    slug,
    displayName: slug,
    description: null,
    config: {},
    secretRef: null,
    version: 1,
    lastHealthStatus: "green",
    lastCheckedAt: new Date(),
    createdByUserId: null,
    updatedByUserId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function okHealthCheck(resourceId: number, kind: "model" | "api" = "api") {
  return {
    id: resourceId,
    resourceId,
    kind,
    status: "ok" as const,
    latencyMs: 10,
    errorCode: null,
    errorMessage: null,
    triggeredByUserId: null,
    checkedAt: new Date(),
  };
}

function failHealthCheck(resourceId: number, kind: "model" | "api" = "api") {
  return {
    id: resourceId,
    resourceId,
    kind,
    status: "fail" as const,
    latencyMs: null,
    errorCode: "HTTP_500",
    errorMessage: "boom",
    triggeredByUserId: null,
    checkedAt: new Date(),
  };
}

beforeEach(() => {
  getOrCreateSpecialistConfig.mockReset();
  listSpecialistAssignments.mockReset();
  getAdminResourceById.mockReset();
  getLatestHealthCheck.mockReset();
  getResearchRunsForSpecialist.mockReset();

  // Sensible defaults: a happy-path world. Individual tests override fields.
  getOrCreateSpecialistConfig.mockResolvedValue({
    specialistId: SPECIALIST_ID,
    refreshCadenceDays: 30,
    fieldRequirements: {},
    lastObservedMissing: [],
  });
  listSpecialistAssignments.mockResolvedValue(buildAssignmentRows());
  getAdminResourceById.mockImplementation(async (id: number) => {
    if (id === MODEL_RESOURCE_ID) return buildResource(id, "model", "primary-llm");
    if (id === API_RESOURCE_ID) return buildResource(id, "api", "web-search");
    return undefined;
  });
  // Default: every resource has a fresh "ok" probe → derives "green".
  getLatestHealthCheck.mockImplementation(async (resourceId: number) =>
    okHealthCheck(resourceId, resourceId === MODEL_RESOURCE_ID ? "model" : "api"),
  );
  // Default: one fresh, fully-confident completed run.
  getResearchRunsForSpecialist.mockResolvedValue([
    {
      id: 1,
      specialistId: SPECIALIST_ID,
      status: "completed",
      completedAt: new Date(),
      metadata: { confidence: 1 },
    },
  ]);
});

describe("computeSpecialistResearchQuality — score formula", () => {
  it("yields exact score 100 with zero gaps when every signal is green", async () => {
    const result = await computeSpecialistResearchQuality(SPECIALIST_ID);
    // 35 + 20 + 15 + 10 + 20 = 100 with all multipliers = 1.
    expect(result.score).toBe(100);
    expect(result.gaps).toEqual([]);
    expect(result.signals.requiredResources.healthy).toBe(2);
    expect(result.signals.requiredResources.failing).toBe(0);
    expect(result.signals.confidence.combined).toBe(1);
  });

  // ── Per-weight isolation ─────────────────────────────────────────────────
  // Each test below zeroes out exactly one signal and asserts score equals
  // 100 minus that signal's weight. Together they pin every weight in the
  // implementation: any rebalancing (e.g. resources 35→25) flips its score.

  it("locks the resource-health weight at exactly 35 (both required resources red → score 65)", async () => {
    getLatestHealthCheck.mockImplementation(async (resourceId: number) =>
      failHealthCheck(resourceId, resourceId === MODEL_RESOURCE_ID ? "model" : "api"),
    );

    const result = await computeSpecialistResearchQuality(SPECIALIST_ID);

    // 0*35 + 1*20 + 1*15 + 1*10 + 1*20 = 65
    expect(result.score).toBe(100 - W_RESOURCES);
    expect(result.score).toBe(65);
    expect(result.signals.requiredResources.failing).toBe(2);
  });

  it("locks the missing-fields weight at exactly 20 (all 3 candidates hard-missing → score 80)", async () => {
    // mgmt-co.icp-intelligence declares 3 candidateFields. With all 3 hard +
    // observed-missing: penalty = min(1, 3/3) = 1 → fieldsMultiplier = 0.
    getOrCreateSpecialistConfig.mockResolvedValue({
      specialistId: SPECIALIST_ID,
      refreshCadenceDays: 30,
      fieldRequirements: {
        companyTaxRate: "hard",
        baseManagementFee: "hard",
        incentiveManagementFee: "hard",
      },
      lastObservedMissing: [
        "companyTaxRate",
        "baseManagementFee",
        "incentiveManagementFee",
      ],
    });

    const result = await computeSpecialistResearchQuality(SPECIALIST_ID);

    // 1*35 + 0*20 + 1*15 + 1*10 + 1*20 = 80
    expect(result.score).toBe(100 - W_FIELDS);
    expect(result.score).toBe(80);
    expect(result.signals.missingFields.hardOff).toBe(3);
  });

  it("locks the freshness weight at exactly 15 (run age past ceiling → score 85)", async () => {
    // Cadence 30d, age 60d. ceiling = max(60, 14) = 60. ageDays >= ceiling
    // → freshnessMultiplier = 0. Run still counts for availability + confidence.
    const sixtyDaysAgo = new Date(Date.now() - 60 * 86_400_000);
    getResearchRunsForSpecialist.mockResolvedValue([
      {
        id: 1,
        specialistId: SPECIALIST_ID,
        status: "completed",
        completedAt: sixtyDaysAgo,
        metadata: { confidence: 1 },
      },
    ]);

    const result = await computeSpecialistResearchQuality(SPECIALIST_ID);

    // 1*35 + 1*20 + 0*15 + 1*10 + 1*20 = 85
    expect(result.score).toBe(100 - W_FRESHNESS);
    expect(result.score).toBe(85);
  });

  it("locks the confidence weight at exactly 20 (self-reported 0 with full reliability → score 90)", async () => {
    // 1 completed run with confidence=0 → reliability=1, selfReported=0,
    // combined=0.5. confidenceMultiplier * 20 = 10 → loses 10 of 20 weight.
    // Score = 100 - 0.5 * 20 = 90. This pins the confidence weight at 20:
    // changing it to 25 would flip score to 87.5→88, etc.
    getResearchRunsForSpecialist.mockResolvedValue([
      {
        id: 1,
        specialistId: SPECIALIST_ID,
        status: "completed",
        completedAt: new Date(),
        metadata: { confidence: 0 },
      },
    ]);

    const result = await computeSpecialistResearchQuality(SPECIALIST_ID);

    expect(result.score).toBe(100 - W_CONFIDENCE / 2);
    expect(result.score).toBe(90);
    expect(result.signals.confidence.selfReported).toBe(0);
    expect(result.signals.confidence.combined).toBe(0.5);
  });

  it("locks availability + freshness + confidence weights together (no runs at all → score 55)", async () => {
    // Zero runs zeroes three signals at once: no completed run drops
    // freshness (15) and availability (10), and reliability collapses to 0
    // with no self-reported confidence → confidence weight (20) lost too.
    // Score = 35 + 20 + 0 + 0 + 0 = 55.
    getResearchRunsForSpecialist.mockResolvedValue([]);

    const result = await computeSpecialistResearchQuality(SPECIALIST_ID);

    expect(result.score).toBe(W_RESOURCES + W_FIELDS);
    expect(result.score).toBe(55);
    expect(result.signals.runHistory.totalRuns).toBe(0);
    expect(result.signals.confidence.combined).toBe(0);
  });

  it("locks the combined formula on a mixed scenario (every signal partial → score 68)", async () => {
    // Deterministic mixed-signal world that exercises every multiplier:
    //   - 1 of 2 required resources failing  → resources mult = 0.5 → 17.5
    //   - 1 of 3 candidate fields hard-miss   → fields mult = 2/3   → 13.333...
    //   - cadence 30d, age 45d (mid-range)    → freshness mult = 0.5 → 7.5
    //   - 1 completed run                     → availability = 1     → 10
    //   - reliability 1 + selfReported 1      → confidence mult = 1   → 20
    // Sum = 17.5 + 13.333... + 7.5 + 10 + 20 = 68.333... → Math.round → 68.
    getLatestHealthCheck.mockImplementation(async (resourceId: number) => {
      if (resourceId === API_RESOURCE_ID) return failHealthCheck(resourceId, "api");
      return okHealthCheck(resourceId, "model");
    });
    getOrCreateSpecialistConfig.mockResolvedValue({
      specialistId: SPECIALIST_ID,
      refreshCadenceDays: 30,
      fieldRequirements: { companyTaxRate: "hard" },
      lastObservedMissing: ["companyTaxRate"],
    });
    const fortyFiveDaysAgo = new Date(Date.now() - 45 * 86_400_000);
    getResearchRunsForSpecialist.mockResolvedValue([
      {
        id: 1,
        specialistId: SPECIALIST_ID,
        status: "completed",
        completedAt: fortyFiveDaysAgo,
        metadata: { confidence: 1 },
      },
    ]);

    const result = await computeSpecialistResearchQuality(SPECIALIST_ID);

    expect(result.score).toBe(68);
  });
});

describe("computeSpecialistResearchQuality — gap codes", () => {
  it("emits exactly `required_resources_failing` (critical) when one required resource probe is red", async () => {
    getLatestHealthCheck.mockImplementation(async (resourceId: number) => {
      if (resourceId === API_RESOURCE_ID) return failHealthCheck(resourceId, "api");
      return okHealthCheck(resourceId, "model");
    });

    const result = await computeSpecialistResearchQuality(SPECIALIST_ID);

    // Score: 0.5*35 + 20 + 15 + 10 + 20 = 82.5 → Math.round → 83.
    expect(result.score).toBe(83);

    const codes = result.gaps.map((g) => g.code);
    expect(codes).toEqual(["required_resources_failing"]);
    expect(result.gaps[0].severity).toBe("critical");
    expect(result.signals.requiredResources.failing).toBe(1);
    expect(result.signals.requiredResources.healthy).toBe(1);
  });

  it("emits `research_stale` and severity scales with age past cadence (critical vs warning)", async () => {
    // Critical: cadence 7d, age 60d. ageDays > cadenceDays*2 → critical.
    // Score: 1*35 + 1*20 + 0*15 + 1*10 + 1*20 = 85 (run still counts as fresh
    // for availability + confidence; only freshness is zero past ceiling).
    const sixtyDaysAgo = new Date(Date.now() - 60 * 86_400_000);
    getOrCreateSpecialistConfig.mockResolvedValue({
      specialistId: SPECIALIST_ID,
      refreshCadenceDays: 7,
      fieldRequirements: {},
      lastObservedMissing: [],
    });
    getResearchRunsForSpecialist.mockResolvedValue([
      {
        id: 1,
        specialistId: SPECIALIST_ID,
        status: "completed",
        completedAt: sixtyDaysAgo,
        metadata: { confidence: 1 },
      },
    ]);

    const criticalRun = await computeSpecialistResearchQuality(SPECIALIST_ID);
    expect(criticalRun.score).toBe(85);
    const criticalGap = criticalRun.gaps.find((g) => g.code === "research_stale");
    expect(criticalGap).toBeDefined();
    expect(criticalGap!.severity).toBe("critical");

    // Warning: cadence 30d, age 45d. 45 > 30 but ≤ 60 → severity "warning".
    // Freshness mult = 1 - (45-30)/30 = 0.5 → 7.5.
    // Score = 35 + 20 + 7.5 + 10 + 20 = 92.5 → Math.round → 93.
    const fortyFiveDaysAgo = new Date(Date.now() - 45 * 86_400_000);
    getOrCreateSpecialistConfig.mockResolvedValue({
      specialistId: SPECIALIST_ID,
      refreshCadenceDays: 30,
      fieldRequirements: {},
      lastObservedMissing: [],
    });
    getResearchRunsForSpecialist.mockResolvedValue([
      {
        id: 2,
        specialistId: SPECIALIST_ID,
        status: "completed",
        completedAt: fortyFiveDaysAgo,
        metadata: { confidence: 1 },
      },
    ]);

    const warningRun = await computeSpecialistResearchQuality(SPECIALIST_ID);
    expect(warningRun.score).toBe(93);
    const warningGap = warningRun.gaps.find((g) => g.code === "research_stale");
    expect(warningGap).toBeDefined();
    expect(warningGap!.severity).toBe("warning");
  });

  it("emits `hard_required_fields_missing` (critical) when a hard field is observed missing", async () => {
    getOrCreateSpecialistConfig.mockResolvedValue({
      specialistId: SPECIALIST_ID,
      refreshCadenceDays: 30,
      fieldRequirements: {
        // `companyTaxRate` is one of the 3 catalog-declared candidate fields
        // for mgmt-co.icp-intelligence. Marking it "hard" + observed-missing
        // is the canonical critical-gap setup.
        companyTaxRate: "hard",
      },
      lastObservedMissing: ["companyTaxRate"],
    });

    const result = await computeSpecialistResearchQuality(SPECIALIST_ID);

    // 1*35 + (2/3)*20 + 1*15 + 1*10 + 1*20 = 93.333... → Math.round → 93.
    expect(result.score).toBe(93);
    const codes = result.gaps.map((g) => g.code);
    expect(codes).toEqual(["hard_required_fields_missing"]);
    expect(result.gaps[0].severity).toBe("critical");
    expect(result.signals.missingFields.hardOff).toBe(1);
  });

  it("locks the full set of gap-code strings so a UI-breaking typo fails CI", async () => {
    // The UI keys off these exact strings. Renames should be deliberate and
    // accompanied by a coordinated UI change — this set acts as the contract.
    const KNOWN_GAP_CODES = new Set([
      "required_resources_failing",
      "required_assignment_unbound",
      "hard_required_fields_missing",
      "recommended_fields_missing",
      "no_successful_run",
      "research_stale",
      "required_resources_unprobed",
      "low_run_reliability",
      "low_self_reported_confidence",
    ]);

    // Force as many gap paths as possible: one unbound assignment, one bound
    // assignment that has never been probed, hard + recommended fields
    // observed missing, no completed runs, three failed runs.
    listSpecialistAssignments.mockResolvedValue([
      {
        id: 1, specialistId: SPECIALIST_ID, assignmentKind: "model",
        assignmentSlug: "primary-llm", assignmentRole: "synthesis",
        required: true, resourceId: null, materializedAt: new Date(),
      },
      {
        id: 2, specialistId: SPECIALIST_ID, assignmentKind: "api",
        assignmentSlug: "web-search", assignmentRole: null,
        required: true, resourceId: API_RESOURCE_ID, materializedAt: new Date(),
      },
    ]);
    getLatestHealthCheck.mockResolvedValue(undefined); // no probe → "gray"
    getOrCreateSpecialistConfig.mockResolvedValue({
      specialistId: SPECIALIST_ID,
      refreshCadenceDays: 7,
      fieldRequirements: {
        companyTaxRate: "hard",
        baseManagementFee: "recommended",
      },
      lastObservedMissing: ["companyTaxRate", "baseManagementFee"],
    });
    getResearchRunsForSpecialist.mockResolvedValue([
      { id: 1, specialistId: SPECIALIST_ID, status: "failed", completedAt: null, metadata: null },
      { id: 2, specialistId: SPECIALIST_ID, status: "failed", completedAt: null, metadata: null },
      { id: 3, specialistId: SPECIALIST_ID, status: "failed", completedAt: null, metadata: null },
    ]);

    const result = await computeSpecialistResearchQuality(SPECIALIST_ID);

    // Every emitted code must belong to the locked vocabulary.
    for (const gap of result.gaps) {
      expect(KNOWN_GAP_CODES.has(gap.code)).toBe(true);
    }
    // The high-signal codes that this synthetic world targets must all fire.
    const codes = new Set(result.gaps.map((g) => g.code));
    expect(codes.has("required_assignment_unbound")).toBe(true);
    expect(codes.has("hard_required_fields_missing")).toBe(true);
    expect(codes.has("recommended_fields_missing")).toBe(true);
    expect(codes.has("no_successful_run")).toBe(true);
    expect(codes.has("low_run_reliability")).toBe(true);
    // Output is capped at 6 gaps — this contract is also worth pinning.
    expect(result.gaps.length).toBeLessThanOrEqual(6);
  });
});
