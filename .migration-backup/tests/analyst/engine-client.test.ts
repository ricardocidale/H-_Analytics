/**
 * Tests for engine/analyst/cognitive/engine-client.ts — Phase 5B read path.
 *
 * Exercises each miss-reason path + the hit path. Pure unit tests with
 * mocked deps (no DB, no orchestrator).
 */
import { describe, it, expect } from "vitest";
import {
  tryCacheRead,
  type ConsultRequest,
  type EngineClientDeps,
  type ResearchRunSlim,
  type GuidanceSlim,
  type MissReason,
} from "../../engine/analyst/cognitive/engine-client";
import {
  computeCacheKey,
  type VerdictCacheKey,
} from "../../engine/analyst/cognitive/cache-keys";

// ──────────────────────────────────────────────────────────────────────────
// Fixtures

const FIXED_NOW = new Date("2026-04-20T12:00:00Z");

const BASE_KEY: VerdictCacheKey = {
  scenarioId: null,
  entityType: "property",
  entityId: 42,
  fieldGroup: ["adr", "occupancy"],
  personaHash: "persona-lb-luxury-us",
  inputContextHash: "inputs-v1-abc",
  engineVersion: "v2",
};

const BASE_HASHED = computeCacheKey(BASE_KEY);

function freshRun(overrides: Partial<ResearchRunSlim> = {}): ResearchRunSlim {
  return {
    id: 101,
    cacheKey: BASE_HASHED,
    cacheInputsHash: BASE_KEY.inputContextHash,
    status: "complete",
    completedAt: new Date(FIXED_NOW.getTime() - 60 * 60 * 1000), // 1h old
    modelPrimary: "claude-opus-4-7",
    tier: 1,
    ...overrides,
  };
}

function liveGuidance(overrides: Partial<GuidanceSlim> = {}): GuidanceSlim {
  return {
    assumptionKey: "adr",
    valueLow: 180,
    valueMid: 200,
    valueHigh: 220,
    confidence: "high",
    sourceName: "STR HOST",
    sourceDate: "2026-Q1",
    reasoning: "Aspen luxury hotel comps range $180–220 ADR.",
    supersededAt: null,
    ...overrides,
  };
}

function makeDeps(partial: Partial<EngineClientDeps> = {}): EngineClientDeps {
  return {
    findRunByCacheKey: async () => null,
    findGuidanceByRunId: async () => [],
    now: () => FIXED_NOW,
    ...partial,
  };
}

function makeRequest(
  overrides: Partial<ConsultRequest> = {}
): ConsultRequest {
  return { cacheKey: BASE_KEY, ...overrides };
}

// ──────────────────────────────────────────────────────────────────────────
// Miss paths

describe("engine-client — miss paths", () => {
  it("fresh_miss: no row matches the cache key", async () => {
    const result = await tryCacheRead(
      makeRequest(),
      makeDeps({ findRunByCacheKey: async () => null }),
    );
    expect(result.hit).toBe(false);
    if (!result.hit) expect(result.missReason).toBe<MissReason>("fresh_miss");
  });

  it("not_complete: row found but status is pending/failed/running", async () => {
    const result = await tryCacheRead(
      makeRequest(),
      makeDeps({
        findRunByCacheKey: async () => freshRun({ status: "pending" }),
      }),
    );
    expect(result.hit).toBe(false);
    if (!result.hit) expect(result.missReason).toBe<MissReason>("not_complete");
  });

  it("ttl_expired: row completed before TTL window", async () => {
    const oldCompleted = new Date(
      FIXED_NOW.getTime() - 31 * 24 * 60 * 60 * 1000,
    ); // 31 days
    const result = await tryCacheRead(
      makeRequest(),
      makeDeps({
        findRunByCacheKey: async () => freshRun({ completedAt: oldCompleted }),
      }),
    );
    expect(result.hit).toBe(false);
    if (!result.hit) expect(result.missReason).toBe<MissReason>("ttl_expired");
  });

  it("ttl_expired: completedAt is null (anomaly — treat as expired)", async () => {
    const result = await tryCacheRead(
      makeRequest(),
      makeDeps({
        findRunByCacheKey: async () => freshRun({ completedAt: null }),
      }),
    );
    expect(result.hit).toBe(false);
    if (!result.hit) expect(result.missReason).toBe<MissReason>("ttl_expired");
  });

  it("inputs_changed: run's cacheInputsHash differs from the key's (defensive)", async () => {
    const result = await tryCacheRead(
      makeRequest(),
      makeDeps({
        findRunByCacheKey: async () =>
          freshRun({ cacheInputsHash: "stale-hash" }),
      }),
    );
    expect(result.hit).toBe(false);
    if (!result.hit) expect(result.missReason).toBe<MissReason>("inputs_changed");
  });

  it("superseded: all guidance rows have supersededAt set", async () => {
    const past = new Date(FIXED_NOW.getTime() - 5 * 60 * 1000);
    const result = await tryCacheRead(
      makeRequest(),
      makeDeps({
        findRunByCacheKey: async () => freshRun(),
        findGuidanceByRunId: async () => [
          liveGuidance({ supersededAt: past }),
          liveGuidance({ assumptionKey: "occupancy", supersededAt: past }),
        ],
      }),
    );
    expect(result.hit).toBe(false);
    if (!result.hit) expect(result.missReason).toBe<MissReason>("superseded");
  });

  it("no_guidance: run is fresh but has zero matching guidance rows", async () => {
    const result = await tryCacheRead(
      makeRequest(),
      makeDeps({
        findRunByCacheKey: async () => freshRun(),
        findGuidanceByRunId: async () => [],
      }),
    );
    expect(result.hit).toBe(false);
    if (!result.hit) expect(result.missReason).toBe<MissReason>("no_guidance");
  });

  it("explicit_bypass: request forces a miss even with a fresh cache", async () => {
    const result = await tryCacheRead(
      makeRequest({ explicitBypass: true }),
      makeDeps({
        findRunByCacheKey: async () => freshRun(),
        findGuidanceByRunId: async () => [liveGuidance()],
      }),
    );
    expect(result.hit).toBe(false);
    if (!result.hit) expect(result.missReason).toBe<MissReason>("explicit_bypass");
  });

  it("explicit_bypass: does NOT call findRunByCacheKey (short-circuits)", async () => {
    let called = 0;
    await tryCacheRead(
      makeRequest({ explicitBypass: true }),
      makeDeps({
        findRunByCacheKey: async () => {
          called++;
          return freshRun();
        },
      }),
    );
    expect(called).toBe(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Hit path

describe("engine-client — hit path", () => {
  it("returns hit with non-superseded guidance rows", async () => {
    const liveRow1 = liveGuidance({ assumptionKey: "adr" });
    const liveRow2 = liveGuidance({ assumptionKey: "occupancy", valueMid: 0.72 });
    const supersededRow = liveGuidance({
      assumptionKey: "legacy-field",
      supersededAt: new Date(FIXED_NOW.getTime() - 24 * 60 * 60 * 1000),
    });

    const result = await tryCacheRead(
      makeRequest(),
      makeDeps({
        findRunByCacheKey: async () => freshRun(),
        findGuidanceByRunId: async () => [liveRow1, liveRow2, supersededRow],
      }),
    );

    expect(result.hit).toBe(true);
    if (result.hit) {
      expect(result.runId).toBe(101);
      expect(result.modelPrimary).toBe("claude-opus-4-7");
      expect(result.tier).toBe(1);
      expect(result.guidance).toHaveLength(2); // superseded filtered out
      expect(result.guidance.map((g) => g.assumptionKey).sort()).toEqual([
        "adr",
        "occupancy",
      ]);
    }
  });

  it("hit preserves completedAt timestamp for observability", async () => {
    const runCompletedAt = new Date(FIXED_NOW.getTime() - 45 * 60 * 1000);
    const result = await tryCacheRead(
      makeRequest(),
      makeDeps({
        findRunByCacheKey: async () =>
          freshRun({ completedAt: runCompletedAt }),
        findGuidanceByRunId: async () => [liveGuidance()],
      }),
    );
    expect(result.hit).toBe(true);
    if (result.hit) {
      expect(result.completedAt.getTime()).toBe(runCompletedAt.getTime());
    }
  });

  it("hit ignores cacheInputsHash null (back-compat for pre-5C rows)", async () => {
    // Rows written before Phase 5C will have null cache_inputs_hash.
    // Should not cause inputs_changed miss.
    const result = await tryCacheRead(
      makeRequest(),
      makeDeps({
        findRunByCacheKey: async () =>
          freshRun({ cacheInputsHash: null }),
        findGuidanceByRunId: async () => [liveGuidance()],
      }),
    );
    expect(result.hit).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Gate ordering + edge cases

describe("engine-client — gate ordering", () => {
  it("cacheKey hashing is deterministic across consult calls", async () => {
    // Same VerdictCacheKey → same hashed lookup key both times
    const keys: string[] = [];
    const deps = makeDeps({
      findRunByCacheKey: async (hashedKey) => {
        keys.push(hashedKey);
        return null;
      },
    });
    await tryCacheRead(makeRequest(), deps);
    await tryCacheRead(makeRequest(), deps);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[0]).toMatch(/^[0-9a-f]{64}$/);
  });

  it("ttl check fires before inputs_changed (earlier gate wins)", async () => {
    // Row is both old AND has mismatched inputs hash.
    const result = await tryCacheRead(
      makeRequest(),
      makeDeps({
        findRunByCacheKey: async () =>
          freshRun({
            completedAt: new Date(FIXED_NOW.getTime() - 31 * 24 * 60 * 60 * 1000),
            cacheInputsHash: "stale-hash",
          }),
      }),
    );
    expect(result.hit).toBe(false);
    if (!result.hit) expect(result.missReason).toBe<MissReason>("ttl_expired");
  });

  it("ttlMs=0 disables time-axis (content-axis still enforced)", async () => {
    const veryOld = new Date(
      FIXED_NOW.getTime() - 365 * 24 * 60 * 60 * 1000,
    );
    const result = await tryCacheRead(
      makeRequest(),
      makeDeps({
        ttlMs: 0,
        findRunByCacheKey: async () => freshRun({ completedAt: veryOld }),
        findGuidanceByRunId: async () => [liveGuidance()],
      }),
    );
    expect(result.hit).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Phase 5B v2 — verdict reconstruction + consultCognitive

import {
  consultCognitive,
  type ConsultCognitiveRequest,
} from "../../engine/analyst/cognitive/engine-client";
import {
  reconstructDimensionsFromGuidance,
  type DimensionInput,
} from "../../engine/analyst/cognitive/verdict-reconstructor";

function adrInput(overrides: Partial<DimensionInput> = {}): DimensionInput {
  return {
    field: "adr",
    userValue: 200,
    isNumericField: true,
    unit: "$",
    ...overrides,
  };
}

describe("verdict-reconstructor — severity rules", () => {
  it("happy path: numeric input inside range → ok / within-range", () => {
    const dims = reconstructDimensionsFromGuidance(
      [liveGuidance()],
      [adrInput({ userValue: 200 })],
      { specialistId: "mgmt-co.funding", now: () => FIXED_NOW },
    );
    expect(dims).toHaveLength(1);
    expect(dims[0].severity).toBe("ok");
    expect(dims[0].intent).toBe("within-range");
    expect(dims[0].range).toEqual({ low: 180, mid: 200, high: 220, unit: "$" });
    expect(dims[0].qualityScore).toBe(78);
    expect(dims[0].evidence).toHaveLength(1);
  });

  it("user value above range with high confidence → warning / above-range", () => {
    const dims = reconstructDimensionsFromGuidance(
      [liveGuidance({ confidence: "high" })],
      [adrInput({ userValue: 350 })],
      { specialistId: "mgmt-co.funding", now: () => FIXED_NOW },
    );
    expect(dims[0].severity).toBe("warning");
    expect(dims[0].intent).toBe("above-range");
    expect(dims[0].range).not.toBeNull();
  });

  it("user value above range with LOW confidence → caps at advisory (range null per ADR-003 inv 4)", () => {
    const dims = reconstructDimensionsFromGuidance(
      [liveGuidance({ confidence: "low" })],
      [adrInput({ userValue: 350 })],
      { specialistId: "mgmt-co.funding", now: () => FIXED_NOW },
    );
    expect(dims[0].severity).toBe("advisory");
    // qualityScore=28 is below CONVICTION_FLOOR; non-ok ⇒ range goes null
    expect(dims[0].range).toBeNull();
    expect(dims[0].qualityScore).toBe(28);
  });

  it("user value below range → warning / below-range", () => {
    const dims = reconstructDimensionsFromGuidance(
      [liveGuidance()],
      [adrInput({ userValue: 100 })],
      { specialistId: "mgmt-co.funding", now: () => FIXED_NOW },
    );
    expect(dims[0].severity).toBe("warning");
    expect(dims[0].intent).toBe("below-range");
  });

  it("null userValue → ok / missing-data", () => {
    const dims = reconstructDimensionsFromGuidance(
      [liveGuidance()],
      [adrInput({ userValue: null })],
      { specialistId: "mgmt-co.funding", now: () => FIXED_NOW },
    );
    expect(dims[0].severity).toBe("ok");
    expect(dims[0].intent).toBe("missing-data");
  });

  it("non-numeric field with severityOverride → override wins", () => {
    const dims = reconstructDimensionsFromGuidance(
      [liveGuidance({ assumptionKey: "brandFit", valueLow: null, valueMid: null, valueHigh: null })],
      [
        {
          field: "brandFit",
          userValue: null,
          isNumericField: false,
          unit: "",
          severityOverride: "warning",
        },
      ],
      { specialistId: "mgmt-co.icp", now: () => FIXED_NOW },
    );
    expect(dims[0].severity).toBe("warning");
    expect(dims[0].isNumericField).toBe(false);
  });

  it("confidence null → qualityScore defaults to 50", () => {
    const dims = reconstructDimensionsFromGuidance(
      [liveGuidance({ confidence: null })],
      [adrInput({ userValue: 200 })],
      { specialistId: "mgmt-co.funding", now: () => FIXED_NOW },
    );
    expect(dims[0].qualityScore).toBe(50);
  });

  it("severityOverride 'block' wins even when value is inside range", () => {
    const dims = reconstructDimensionsFromGuidance(
      [liveGuidance()],
      [adrInput({ userValue: 200, severityOverride: "block" })],
      { specialistId: "mgmt-co.funding", now: () => FIXED_NOW },
    );
    expect(dims[0].severity).toBe("block");
    expect(dims[0].intent).toBe("block");
  });

  it("inputs whose field has no matching guidance row are skipped", () => {
    const dims = reconstructDimensionsFromGuidance(
      [liveGuidance({ assumptionKey: "adr" })],
      [adrInput(), adrInput({ field: "doesNotExist" })],
      { specialistId: "mgmt-co.funding", now: () => FIXED_NOW },
    );
    expect(dims).toHaveLength(1);
    expect(dims[0].field).toBe("adr");
  });
});

describe("consultCognitive — HIT path returns reconstructed dimensions", () => {
  function makeCogRequest(
    overrides: Partial<ConsultCognitiveRequest> = {}
  ): ConsultCognitiveRequest {
    return {
      cacheKey: BASE_KEY,
      dimensionInputs: [adrInput()],
      specialistId: "mgmt-co.funding",
      ...overrides,
    };
  }

  it("HIT: returns dimensions + cognitiveRunId derived from runId", async () => {
    const result = await consultCognitive(
      makeCogRequest(),
      makeDeps({
        findRunByCacheKey: async () => freshRun(),
        findGuidanceByRunId: async () => [liveGuidance()],
      }),
    );
    expect(result.hit).toBe(true);
    if (result.hit) {
      expect(result.dimensions).toHaveLength(1);
      expect(result.dimensions[0].severity).toBe("ok");
      expect(result.cognitiveRunId).toBe("101");
      expect(result.modelPrimary).toBe("claude-opus-4-7");
    }
  });

  it("MISS fresh_miss: no reconstruction performed; same shape as tryCacheRead miss", async () => {
    const result = await consultCognitive(
      makeCogRequest(),
      makeDeps({ findRunByCacheKey: async () => null }),
    );
    expect(result.hit).toBe(false);
    if (!result.hit) expect(result.missReason).toBe<MissReason>("fresh_miss");
  });

  it("MISS ttl_expired: stale completed run produces ttl_expired miss", async () => {
    const stale = new Date(FIXED_NOW.getTime() - 31 * 24 * 60 * 60 * 1000);
    const result = await consultCognitive(
      makeCogRequest(),
      makeDeps({
        findRunByCacheKey: async () => freshRun({ completedAt: stale }),
      }),
    );
    expect(result.hit).toBe(false);
    if (!result.hit) expect(result.missReason).toBe<MissReason>("ttl_expired");
  });

  it("MISS explicit_bypass: even a fresh complete run yields explicit_bypass", async () => {
    const result = await consultCognitive(
      makeCogRequest({ explicitBypass: true }),
      makeDeps({
        findRunByCacheKey: async () => freshRun(),
        findGuidanceByRunId: async () => [liveGuidance()],
      }),
    );
    expect(result.hit).toBe(false);
    if (!result.hit) expect(result.missReason).toBe<MissReason>("explicit_bypass");
  });
});
