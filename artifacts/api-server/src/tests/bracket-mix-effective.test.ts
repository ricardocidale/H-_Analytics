/**
 * Phase B effective-mix service tests
 *
 * U6 of the ICP bracket-mix peer-derived rebuild plan. Covers:
 *   - effectiveBracketMix returns override mix when override is active (AE2)
 *   - effectiveBracketMix returns global mix when no override (AE3)
 *   - effectiveBracketMix returns equal-weight + provisional when no rows (AE1)
 *   - writeEffectiveBracketMix(kind='override-set') links the FK
 *   - writeEffectiveBracketMix(kind='manual-assign') with no override patches
 *     bracket_mix directly (no run row written)
 *   - writeEffectiveBracketMix(kind='manual-assign') with active override
 *     upgrades to override (Option A): creates a NEW bracket_mix_runs row +
 *     links FK
 *   - clearBracketMixOverride re-mirrors latest global_default (R8)
 *   - clearBracketMixOverride on a row without an override is a no-op
 */
import { describe, it, expect } from "vitest";
import {
  effectiveBracketMix,
  writeEffectiveBracketMix,
  clearBracketMixOverride,
} from "../services/bracketMix/effective";

interface GaRow {
  id: number;
  bracketMixOverrideRunId: number | null;
  bracketMix?: unknown;
}

interface RunRow {
  id: number;
  targetKind: string;
  targetId: number | null;
  mixValue: { entries: Array<{ id: string; weight: number }>; evidence?: string };
  runAt: Date;
  provisional?: boolean;
}

interface FakeDbState {
  ga: GaRow[];
  runs: RunRow[];
  brackets: Array<{ slug: string; name: string; archetypeLabel: string; customerType: string }>;
  nextRunId: number;
  inserts: RunRow[];
  updates: Array<{ table: string; id: number; set: Record<string, unknown> }>;
}

const ACTIVE_BRACKETS = [
  { slug: "boutique-upscale-hotel",     name: "Boutique Upscale Hotel",     archetypeLabel: "Hotel · Upscale",      customerType: "hotel" },
  { slug: "branded-full-service-hotel", name: "Branded Full-Service Hotel", archetypeLabel: "Hotel · Full Service", customerType: "hotel" },
  { slug: "performance-str-cluster",    name: "Performance STR Cluster",    archetypeLabel: "STR · Performance",    customerType: "str" },
];

function newState(opts: Partial<FakeDbState> = {}): FakeDbState {
  return {
    ga: opts.ga ?? [],
    runs: opts.runs ?? [],
    brackets: opts.brackets ?? ACTIVE_BRACKETS,
    nextRunId: opts.nextRunId ?? 9000,
    inserts: opts.inserts ?? [],
    updates: opts.updates ?? [],
  };
}

function makeFakeDb(state: FakeDbState) {
  function buildSelectChain(intent: "ga" | "runs-by-id" | "runs-by-kind" | "brackets") {
    return {
      from: () => ({
        where: (_cond: unknown) => {
          if (intent === "ga") return state.ga.slice(0, 1);
          if (intent === "runs-by-id") return state.runs.slice(0, 1);
          if (intent === "brackets") return state.brackets;
          return {
            orderBy: () => ({
              limit: () => state.runs.filter((r) => r.targetKind === "global_default").slice(0, 1),
            }),
          };
        },
      }),
    };
  }

  return {
    select: (cols: Record<string, unknown>) => {
      const keys = Object.keys(cols);
      if (keys.includes("bracketMixOverrideRunId")) return buildSelectChain("ga");
      if (keys.includes("mixValue")) {
        // Distinguish "look up by id" (no orderBy) vs "latest global_default" (with orderBy)
        return {
          from: () => ({
            where: (_cond: unknown) => {
              const ret = {
                orderBy: () => ({
                  limit: () => state.runs.filter((r) => r.targetKind === "global_default").slice(0, 1),
                }),
              };
              // Tag the array as "by-id" when iterated directly.
              const byId = state.runs.length > 0 ? [state.runs[state.runs.length - 1]] : [];
              return Object.assign(byId, ret);
            },
          }),
        };
      }
      if (keys.includes("customerType")) return buildSelectChain("brackets");
      return buildSelectChain("brackets");
    },
    transaction: async (cb: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        select: (cols: Record<string, unknown>) => {
          const keys = Object.keys(cols);
          if (keys.includes("bracketMixOverrideRunId")) return buildSelectChain("ga");
          if (keys.includes("mixValue")) {
            return {
              from: () => ({
                where: (_cond: unknown) => ({
                  orderBy: () => ({
                    limit: () => state.runs.filter((r) => r.targetKind === "global_default").slice(0, 1),
                  }),
                }),
              }),
            };
          }
          return buildSelectChain("brackets");
        },
        insert: (_table: unknown) => ({
          values: (values: Record<string, unknown>) => ({
            returning: () => {
              const id = state.nextRunId++;
              const runRow: RunRow = {
                id,
                targetKind: String(values.targetKind),
                targetId: (values.targetId ?? null) as number | null,
                mixValue: values.mixValue as RunRow["mixValue"],
                runAt: new Date(),
                provisional: Boolean(values.provisional),
              };
              state.runs.push(runRow);
              state.inserts.push(runRow);
              return [{ id }];
            },
          }),
        }),
        update: (_table: unknown) => ({
          set: (values: Record<string, unknown>) => ({
            where: (cond: unknown) => {
              const id =
                typeof cond === "object" && cond !== null && "right" in (cond as Record<string, unknown>)
                  ? Number((cond as { right: unknown }).right)
                  : state.ga[0]?.id ?? 0;
              const row = state.ga.find((g) => g.id === id);
              if (row) {
                if (values.bracketMix !== undefined) row.bracketMix = values.bracketMix;
                if ("bracketMixOverrideRunId" in values) {
                  row.bracketMixOverrideRunId = values.bracketMixOverrideRunId as number | null;
                }
              }
              state.updates.push({ table: "global_assumptions", id, set: values });
            },
          }),
        }),
      };
      return cb(tx);
    },
  };
}

const OVERRIDE_RUN = {
  id: 1234,
  targetKind: "company",
  targetId: 1,
  mixValue: {
    entries: [
      { id: "boutique-upscale-hotel", weight: 0.7 },
      { id: "branded-full-service-hotel", weight: 0.3 },
    ],
    evidence: "Tiago override",
  },
  runAt: new Date("2026-05-13T00:00:00.000Z"),
};

const GLOBAL_RUN = {
  id: 5678,
  targetKind: "global_default",
  targetId: null,
  mixValue: {
    entries: [
      { id: "boutique-upscale-hotel", weight: 0.5 },
      { id: "performance-str-cluster", weight: 0.5 },
    ],
    evidence: "Hugo aggregate",
  },
  runAt: new Date("2026-05-13T00:00:00.000Z"),
};

// ── effectiveBracketMix tests ──────────────────────────────────────────────

describe("effectiveBracketMix — read path", () => {
  it("AE2: override active → returns override mix with source='override'", async () => {
    const state = newState({
      ga: [{ id: 1, bracketMixOverrideRunId: 1234, bracketMix: null }],
      runs: [OVERRIDE_RUN],
    });
    const db = makeFakeDb(state);
    const result = await effectiveBracketMix(1, db as unknown as Parameters<typeof effectiveBracketMix>[1]);
    expect(result.source).toBe("override");
    expect(result.provisional).toBe(false);
    expect(result.runId).toBe(1234);
  });

  it("AE3: no override + global_default exists → returns global mix with source='global'", async () => {
    const state = newState({
      ga: [{ id: 1, bracketMixOverrideRunId: null, bracketMix: null }],
      runs: [GLOBAL_RUN],
    });
    const db = makeFakeDb(state);
    const result = await effectiveBracketMix(1, db as unknown as Parameters<typeof effectiveBracketMix>[1]);
    expect(result.source).toBe("global");
    expect(result.provisional).toBe(false);
    expect(result.runId).toBe(5678);
  });

  it("AE1: no override + no global run → returns equal-weight provisional", async () => {
    const state = newState({
      ga: [{ id: 1, bracketMixOverrideRunId: null, bracketMix: null }],
      runs: [],
    });
    const db = makeFakeDb(state);
    const result = await effectiveBracketMix(1, db as unknown as Parameters<typeof effectiveBracketMix>[1]);
    expect(result.source).toBe("provisional");
    expect(result.provisional).toBe(true);
    expect(result.runId).toBeNull();
    expect(result.mix.entries.every((e) => Math.abs(e.weight - 1 / ACTIVE_BRACKETS.length) < 1e-9)).toBe(true);
  });
});

// ── writeEffectiveBracketMix tests ──────────────────────────────────────────

describe("writeEffectiveBracketMix — shared writer", () => {
  it("kind='override-set': mirrors mix to ga.bracket_mix AND sets bracket_mix_override_run_id", async () => {
    const state = newState({
      ga: [{ id: 1, bracketMixOverrideRunId: null, bracketMix: null }],
    });
    const db = makeFakeDb(state);
    const result = await writeEffectiveBracketMix(
      {
        companyId: 1,
        mix: OVERRIDE_RUN.mixValue as unknown as Parameters<typeof writeEffectiveBracketMix>[0]["mix"],
        kind: "override-set",
        overrideRunId: 1234,
      },
      db as unknown as Parameters<typeof writeEffectiveBracketMix>[1],
    );
    expect(result.runId).toBe(1234);
    expect(result.source).toBe("override");
    expect(state.ga[0].bracketMixOverrideRunId).toBe(1234);
    expect(state.ga[0].bracketMix).toEqual(OVERRIDE_RUN.mixValue);
    // No new bracket_mix_runs row — caller supplied an existing run id.
    expect(state.inserts).toHaveLength(0);
  });

  it("kind='manual-assign' + no override: patches ga.bracket_mix directly, no run row written", async () => {
    const state = newState({
      ga: [{ id: 1, bracketMixOverrideRunId: null, bracketMix: null }],
    });
    const db = makeFakeDb(state);
    const newMix = { entries: [{ id: "boutique-upscale-hotel", weight: 1.0 }], evidence: "test" };
    const result = await writeEffectiveBracketMix(
      {
        companyId: 1,
        mix: newMix as unknown as Parameters<typeof writeEffectiveBracketMix>[0]["mix"],
        kind: "manual-assign",
      },
      db as unknown as Parameters<typeof writeEffectiveBracketMix>[1],
    );
    expect(result.runId).toBeNull();
    expect(result.source).toBe("global");
    expect(state.inserts).toHaveLength(0);
    expect(state.ga[0].bracketMixOverrideRunId).toBeNull();
    expect(state.ga[0].bracketMix).toEqual(newMix);
  });

  it("kind='manual-assign' + override active: UPGRADES to override (Option A)", async () => {
    const state = newState({
      ga: [{ id: 1, bracketMixOverrideRunId: 999, bracketMix: { entries: [] } }],
    });
    const db = makeFakeDb(state);
    const newMix = { entries: [{ id: "performance-str-cluster", weight: 1.0 }], evidence: "manual upgrade" };
    const result = await writeEffectiveBracketMix(
      {
        companyId: 1,
        mix: newMix as unknown as Parameters<typeof writeEffectiveBracketMix>[0]["mix"],
        kind: "manual-assign",
        evidenceLabel: "test upgrade",
      },
      db as unknown as Parameters<typeof writeEffectiveBracketMix>[1],
    );
    // Option A: new run row inserted, FK updated to point at it.
    expect(state.inserts).toHaveLength(1);
    expect(state.inserts[0].targetKind).toBe("company");
    expect(state.inserts[0].targetId).toBe(1);
    expect(result.source).toBe("override");
    expect(result.runId).toBe(state.inserts[0].id);
    expect(state.ga[0].bracketMixOverrideRunId).toBe(state.inserts[0].id);
  });
});

// ── clearBracketMixOverride tests ──────────────────────────────────────────

describe("clearBracketMixOverride", () => {
  it("active override: clears FK + re-mirrors latest global_default into ga.bracket_mix (R8)", async () => {
    const state = newState({
      ga: [{ id: 1, bracketMixOverrideRunId: 1234, bracketMix: { sentinel: "override-was-here" } }],
      runs: [GLOBAL_RUN],
    });
    const db = makeFakeDb(state);
    const result = await clearBracketMixOverride(1, db as unknown as Parameters<typeof clearBracketMixOverride>[1]);
    expect(result.wasActive).toBe(true);
    expect(result.mirroredFromRunId).toBe(5678);
    expect(state.ga[0].bracketMixOverrideRunId).toBeNull();
    expect(state.ga[0].bracketMix).toEqual(GLOBAL_RUN.mixValue);
  });

  it("no active override: idempotent no-op", async () => {
    const state = newState({
      ga: [{ id: 1, bracketMixOverrideRunId: null, bracketMix: { keep: true } }],
      runs: [GLOBAL_RUN],
    });
    const db = makeFakeDb(state);
    const result = await clearBracketMixOverride(1, db as unknown as Parameters<typeof clearBracketMixOverride>[1]);
    expect(result.wasActive).toBe(false);
    expect(result.mirroredFromRunId).toBeNull();
    // bracket_mix is untouched.
    expect(state.ga[0].bracketMix).toEqual({ keep: true });
  });
});
