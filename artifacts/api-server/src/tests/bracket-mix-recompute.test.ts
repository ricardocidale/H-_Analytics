/**
 * Phase B bracket-mix recomputeGlobalDefault orchestrator tests
 *
 * U5 of the ICP bracket-mix peer-derived rebuild plan. Covers AE2
 * (override-protect), AE5 (recompute writes both rows), feature-flag
 * routing, override-protect skip, and per-path failure independence.
 *
 * Execution posture: test-first for the dual-run write path per plan
 * `Execution note`.
 */
import { describe, it, expect } from "vitest";
import {
  recomputeGlobalDefault,
  type RecomputeDeps,
} from "../services/bracketMix/recomputeGlobalDefault";
import type { ActiveBracket, PeerRow } from "../ai/ambient/minions/hugo";

const ACTIVE_BRACKETS: ActiveBracket[] = [
  { slug: "boutique-upscale-hotel",       name: "Boutique Upscale Hotel",     archetypeLabel: "Hotel · Upscale",       customerType: "hotel" },
  { slug: "branded-full-service-hotel",   name: "Branded Full-Service Hotel", archetypeLabel: "Hotel · Full Service",  customerType: "hotel" },
  { slug: "performance-str-cluster",      name: "Performance STR Cluster",    archetypeLabel: "STR · Performance",     customerType: "str" },
  { slug: "agritourism-experiential-lodge", name: "Agritourism & Experiential Lodge", archetypeLabel: "Hotel · Experiential", customerType: "hotel" },
];

const ACTIVE_PEER_WITH_SPLIT: PeerRow = {
  id: 1,
  isActive: true,
  rosterSizeEstimate: 50,
  brandArchetypeSplit: {
    entries: [
      { bracketSlug: "boutique-upscale-hotel", weight: 0.6 },
      { bracketSlug: "branded-full-service-hotel", weight: 0.4 },
    ],
  },
};

interface FakeGa {
  id: number;
  bracketMixOverrideRunId: number | null;
  // After updates, this is set to the new mix value.
  bracketMix: unknown | null;
}

type Captured = {
  bracketMixRunsInserts: Array<Record<string, unknown>>;
  bracketMixDualRunDiffsInserts: Array<Record<string, unknown>>;
  gaUpdates: Array<{ id: number; set: Record<string, unknown> }>;
};

function makeFakeDb(opts: {
  ga: FakeGa[];
  captured: Captured;
  nextRunId: () => number;
  nextDiffId: () => number;
}) {
  return {
    select: () => ({
      from: () => ({
        // Used by the orchestrator inline call; the deps closures override the
        // real GA listing path. This default is unused in these tests.
        where: () => [],
      }),
    }),
    transaction: async (cb: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        insert: (table: { _: { name?: string }; [k: string]: unknown }) => ({
          values: (values: Record<string, unknown>) => ({
            returning: () => {
              // Decide which counter to bump by inspecting the captured shape.
              if ("targetKind" in values) {
                const id = opts.nextRunId();
                opts.captured.bracketMixRunsInserts.push({ ...values });
                return [{ id }];
              }
              const id = opts.nextDiffId();
              opts.captured.bracketMixDualRunDiffsInserts.push({ ...values });
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
                  : 0;
              opts.captured.gaUpdates.push({ id, set: values });
              const row = opts.ga.find((g) => g.id === id);
              if (row) row.bracketMix = values.bracketMix;
            },
          }),
        }),
      };
      return cb(tx);
    },
  };
}

function makeDeps(args: {
  peers?: PeerRow[];
  legacyMix?: unknown;
  legacyThrows?: boolean;
  ga?: FakeGa[];
  flag?: boolean;
  captured: Captured;
  nextRunId?: () => number;
  nextDiffId?: () => number;
}): RecomputeDeps {
  const ga = args.ga ?? [{ id: 1, bracketMixOverrideRunId: null, bracketMix: null }];
  let _runId = 1000;
  let _diffId = 2000;
  const nextRunId = args.nextRunId ?? (() => _runId++);
  const nextDiffId = args.nextDiffId ?? (() => _diffId++);
  const fakeDb = makeFakeDb({ ga, captured: args.captured, nextRunId, nextDiffId });

  return {
    db: fakeDb as unknown as RecomputeDeps["db"],
    loadPeers: async () => args.peers ?? [],
    loadActiveBrackets: async () => ACTIVE_BRACKETS,
    loadGlobalAssumptionsRows: async () => ga as unknown as Awaited<ReturnType<RecomputeDeps["loadGlobalAssumptionsRows"]>>,
    loadProperties: async () => {
      if (args.legacyThrows) throw new Error("simulated legacy load failure");
      return [] as Awaited<ReturnType<RecomputeDeps["loadProperties"]>>;
    },
    isPhaseBEnabled: () => args.flag ?? true,
  };
}

function freshCaptured(): Captured {
  return {
    bracketMixRunsInserts: [],
    bracketMixDualRunDiffsInserts: [],
    gaUpdates: [],
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("recomputeGlobalDefault — dual-run write path (AE5)", () => {
  it("flag on, no override: writes runs + diff + updates ga.bracket_mix to Hugo's value", async () => {
    const captured = freshCaptured();
    const deps = makeDeps({
      peers: [ACTIVE_PEER_WITH_SPLIT],
      ga: [{ id: 1, bracketMixOverrideRunId: null, bracketMix: null }],
      flag: true,
      captured,
    });
    const summary = await recomputeGlobalDefault(deps);

    expect(captured.bracketMixRunsInserts).toHaveLength(1);
    expect(captured.bracketMixRunsInserts[0].targetKind).toBe("global_default");
    expect(captured.bracketMixRunsInserts[0].targetId).toBeNull();
    expect(captured.bracketMixDualRunDiffsInserts).toHaveLength(1);
    expect(captured.gaUpdates).toHaveLength(1);
    expect(summary.phaseBRunId).toBe(1000);
    expect(summary.phaseBProvisional).toBe(false);
    expect(summary.globalAssumptionsUpdated).toBe(1);
    expect(summary.skippedOverrides).toBe(0);
  });

  it("flag on, override active: writes runs + diff but SKIPS the ga update (AE2)", async () => {
    const captured = freshCaptured();
    const deps = makeDeps({
      peers: [ACTIVE_PEER_WITH_SPLIT],
      ga: [{ id: 1, bracketMixOverrideRunId: 999, bracketMix: { sentinel: true } }],
      flag: true,
      captured,
    });
    const summary = await recomputeGlobalDefault(deps);

    expect(captured.bracketMixRunsInserts).toHaveLength(1);
    expect(captured.bracketMixDualRunDiffsInserts).toHaveLength(1);
    // ga.bracket_mix is NOT touched when override is active.
    expect(captured.gaUpdates).toHaveLength(0);
    expect(summary.skippedOverrides).toBe(1);
    expect(summary.globalAssumptionsUpdated).toBe(0);
  });

  it("flag off: writes diff but routes legacy mix into ga.bracket_mix", async () => {
    const captured = freshCaptured();
    const deps = makeDeps({
      peers: [ACTIVE_PEER_WITH_SPLIT],
      ga: [{ id: 1, bracketMixOverrideRunId: null, bracketMix: null }],
      flag: false,
      captured,
    });
    const summary = await recomputeGlobalDefault(deps);

    expect(summary.phaseBFlagEnabled).toBe(false);
    expect(captured.gaUpdates).toHaveLength(1);
    // The mix written is the legacy classifier's output (assignBrackets on
    // an empty portfolio returns the EMPTY_PORTFOLIO_DEFAULT_MIX). We just
    // confirm the *Phase B* mix was NOT chosen for the ga write.
    const written = captured.gaUpdates[0].set.bracketMix as { evidence?: string } | null;
    expect(written).not.toBeNull();
    expect(written?.evidence).toMatch(/portfolio/i);
  });
});

describe("recomputeGlobalDefault — cold start (R4)", () => {
  it("no peers researched: provisional=true, NO run row written, diff row still produced", async () => {
    const captured = freshCaptured();
    const deps = makeDeps({
      peers: [],
      ga: [{ id: 1, bracketMixOverrideRunId: null, bracketMix: null }],
      flag: true,
      captured,
    });
    const summary = await recomputeGlobalDefault(deps);

    expect(summary.phaseBProvisional).toBe(true);
    expect(summary.phaseBRunId).toBeNull();
    expect(captured.bracketMixRunsInserts).toHaveLength(0);
    expect(captured.bracketMixDualRunDiffsInserts).toHaveLength(1);
    // The diff row still records the cold-start Phase B value.
    const diff = captured.bracketMixDualRunDiffsInserts[0];
    expect(diff.phaseBMix).not.toBeNull();
    expect(diff.phaseBRunId).toBeNull();
  });
});

describe("recomputeGlobalDefault — error path independence", () => {
  it("legacy throws: Phase B side still produces run + diff with legacy_mix=null + notes", async () => {
    const captured = freshCaptured();
    const deps = makeDeps({
      peers: [ACTIVE_PEER_WITH_SPLIT],
      ga: [{ id: 1, bracketMixOverrideRunId: null, bracketMix: null }],
      flag: true,
      legacyThrows: true,
      captured,
    });
    const summary = await recomputeGlobalDefault(deps);

    expect(summary.phaseBMix).not.toBeNull();
    expect(summary.legacyMix).toBeNull();
    expect(captured.bracketMixRunsInserts).toHaveLength(1);
    expect(captured.bracketMixDualRunDiffsInserts).toHaveLength(1);
    const diff = captured.bracketMixDualRunDiffsInserts[0];
    expect(diff.legacyMix).toBeNull();
    expect(diff.notes).toMatch(/Legacy classifier failure/);
  });
});
