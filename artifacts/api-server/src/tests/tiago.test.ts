/**
 * Tiago — Bracket-Mix Specialist unit tests
 *
 * Phase B U3 of the ICP bracket-mix peer-derived rebuild plan.
 *
 * The module exposes injectable `deps` for testability. These tests cover:
 *   - LLM output Zod validation (Carlo-style)
 *   - weights-sum-to-1.0 invariant
 *   - hydrateBracketMix produces engine-readable BracketMixData
 *   - unknown bracket slugs are silently dropped (R3 deterministic skip)
 *   - parse failure path returns {ok: false, errors[]}
 *   - successful runForPeer persists run row + updates peer pointer atomically
 *   - GroundedResearchService unavailable → returns failure cleanly
 */
import { describe, it, expect } from "vitest";
import {
  runForPeer,
  runForCompanyOverride,
  __testing,
  type TiagoDeps,
} from "../ai/ambient/specialists/tiago";
import type { BracketMixData } from "@workspace/db";

const { parseLlmOutput, assertWeightsSumToOne, hydrateBracketMix, LlmOutputSchema } = __testing;

// ── Mock fixtures ──────────────────────────────────────────────────────────

const ACTIVE_BRACKETS = [
  { slug: "boutique-upscale-hotel",       name: "Boutique Upscale Hotel",     archetypeLabel: "Hotel · Upscale",    customerType: "hotel" },
  { slug: "branded-full-service-hotel",   name: "Branded Full-Service Hotel", archetypeLabel: "Hotel · Full Service", customerType: "hotel" },
  { slug: "performance-str-cluster",      name: "Performance STR Cluster",    archetypeLabel: "STR · Performance",  customerType: "str" },
  { slug: "agritourism-experiential-lodge", name: "Agritourism & Experiential Lodge", archetypeLabel: "Hotel · Experiential", customerType: "hotel" },
];

const VALID_LLM_OUTPUT = {
  brandArchetypeSplit: {
    entries: [
      { bracketSlug: "boutique-upscale-hotel", weight: 0.5 },
      { bracketSlug: "branded-full-service-hotel", weight: 0.5 },
    ],
  },
  rosterSizeEstimate: 42,
  splitEvidence: {
    citations: [
      { url: "https://example.com/a", title: "A", snippet: "..." },
    ],
    sampleProperties: [
      { name: "Property 1", bracketSlug: "boutique-upscale-hotel", url: "https://example.com/p1" },
      { name: "Property 2", bracketSlug: "boutique-upscale-hotel", url: "https://example.com/p2" },
      { name: "Property 3", bracketSlug: "branded-full-service-hotel" },
      { name: "Property 4", bracketSlug: "branded-full-service-hotel" },
      { name: "Property 5", bracketSlug: "branded-full-service-hotel" },
    ],
  },
};

// ── Fake `db` builder — only models the operations Tiago actually invokes ──

type CapturedInsert = {
  table: "bracket_mix_runs";
  values: Record<string, unknown>;
  returnedId: number;
};
type CapturedUpdate = {
  table: "icp_peer_companies";
  set: Record<string, unknown>;
  whereId: number | null;
};

function makeFakeDb(opts: {
  peers: Array<{ id: number; name: string; nicheTags: string[] | null }>;
  inserts: CapturedInsert[];
  updates: CapturedUpdate[];
  nextRunId: () => number;
  failInsert?: boolean;
  failUpdate?: boolean;
}) {
  // The select() chain Tiago uses:
  //   db.select(...).from(icpPeerCompanies).where(eq(...))      → [peer | undefined]
  //   db.select(...).from(icpBrackets).where(eq(...))           → ACTIVE_BRACKETS
  // The transaction(tx => ...) shape:
  //   tx.insert(bracketMixRuns).values(...).returning(...)      → [{ id }]
  //   tx.update(icpPeerCompanies).set(...).where(eq(...))       → void

  function makeSelectChain(tableName: "icp_peer_companies" | "icp_brackets") {
    return {
      from: () => ({
        where: () => {
          if (tableName === "icp_peer_companies") {
            return opts.peers.length > 0 ? [opts.peers[0]] : [];
          }
          return ACTIVE_BRACKETS;
        },
      }),
    };
  }

  function makeTxInsert(): {
    insert: (table: { _: { name?: string } } | unknown) => {
      values: (v: Record<string, unknown>) => { returning: () => Array<{ id: number }> };
    };
    update: (table: unknown) => {
      set: (v: Record<string, unknown>) => { where: (cond: unknown) => void };
    };
  } {
    return {
      insert: (_table) => ({
        values: (values) => ({
          returning: () => {
            if (opts.failInsert) throw new Error("simulated insert failure");
            const id = opts.nextRunId();
            opts.inserts.push({ table: "bracket_mix_runs", values, returnedId: id });
            return [{ id }];
          },
        }),
      }),
      update: (_table) => ({
        set: (values) => ({
          where: (cond) => {
            if (opts.failUpdate) throw new Error("simulated update failure");
            // Extract the peer id from the eq() condition shape Drizzle produces.
            // For tests, we don't bother decoding it — we just record the call.
            const whereId =
              typeof cond === "object" && cond !== null && "right" in (cond as Record<string, unknown>)
                ? Number((cond as { right: unknown }).right)
                : null;
            opts.updates.push({ table: "icp_peer_companies", set: values, whereId });
          },
        }),
      }),
    };
  }

  return {
    // Top-level select used for read-only fetches outside a transaction.
    select: (cols: Record<string, { _: { name?: string }; name?: string }>) => {
      // Hack: infer which table by inspecting which columns were requested.
      const keys = Object.keys(cols);
      if (keys.includes("nicheTags")) return makeSelectChain("icp_peer_companies");
      return makeSelectChain("icp_brackets");
    },
    transaction: async (cb: (tx: unknown) => Promise<unknown>) => {
      const tx = makeTxInsert();
      return cb(tx);
    },
  };
}

function makeDeps(overrides: Partial<TiagoDeps> = {}): TiagoDeps {
  return {
    db: {} as TiagoDeps["db"],
    groundedSearch: async () => [
      {
        query: "stub",
        answer: "Boutique upscale, ~42 properties",
        sources: [{ url: "https://example.com/a", title: "A", snippet: "..." }],
      },
    ],
    callLlm: async () => JSON.stringify(VALID_LLM_OUTPUT),
    resolveLlm: async () => ({ vendor: "anthropic", modelId: "claude-test", modelSlug: "claude-test" }),
    ...overrides,
  };
}

// ── Zod validation tests ───────────────────────────────────────────────────

describe("Tiago — LLM output validation (Carlo-style)", () => {
  it("parseLlmOutput accepts a valid JSON payload", () => {
    const result = parseLlmOutput(JSON.stringify(VALID_LLM_OUTPUT));
    expect(result.rosterSizeEstimate).toBe(42);
    expect(result.brandArchetypeSplit.entries).toHaveLength(2);
  });

  it("parseLlmOutput tolerates leading/trailing text around the JSON object", () => {
    const wrapped = `Here is the answer:\n${JSON.stringify(VALID_LLM_OUTPUT)}\nEnd.`;
    const result = parseLlmOutput(wrapped);
    expect(result.rosterSizeEstimate).toBe(42);
  });

  it("parseLlmOutput throws on missing JSON object", () => {
    expect(() => parseLlmOutput("no json here")).toThrow();
  });

  it("LlmOutputSchema rejects fewer than 5 sample properties (R1 lower bound)", () => {
    const tooFew = {
      ...VALID_LLM_OUTPUT,
      splitEvidence: {
        ...VALID_LLM_OUTPUT.splitEvidence,
        sampleProperties: VALID_LLM_OUTPUT.splitEvidence.sampleProperties.slice(0, 3),
      },
    };
    expect(() => LlmOutputSchema.parse(tooFew)).toThrow();
  });

  it("LlmOutputSchema rejects more than 10 sample properties (R1 upper bound)", () => {
    const tooMany = {
      ...VALID_LLM_OUTPUT,
      splitEvidence: {
        ...VALID_LLM_OUTPUT.splitEvidence,
        sampleProperties: Array.from({ length: 11 }, (_, i) => ({
          name: `Property ${i + 1}`,
          bracketSlug: "boutique-upscale-hotel",
        })),
      },
    };
    expect(() => LlmOutputSchema.parse(tooMany)).toThrow();
  });

  it("LlmOutputSchema rejects negative weights", () => {
    const negative = {
      ...VALID_LLM_OUTPUT,
      brandArchetypeSplit: {
        entries: [
          { bracketSlug: "boutique-upscale-hotel", weight: -0.1 },
          { bracketSlug: "branded-full-service-hotel", weight: 1.1 },
        ],
      },
    };
    expect(() => LlmOutputSchema.parse(negative)).toThrow();
  });
});

describe("Tiago — weights sum invariant", () => {
  it("accepts weights summing to 1.0 within epsilon", () => {
    expect(() =>
      assertWeightsSumToOne({
        entries: [
          { bracketSlug: "a", weight: 0.4 },
          { bracketSlug: "b", weight: 0.6 },
        ],
      }),
    ).not.toThrow();
  });

  it("rejects weights summing to less than 1.0", () => {
    expect(() =>
      assertWeightsSumToOne({
        entries: [{ bracketSlug: "a", weight: 0.8 }],
      }),
    ).toThrow(/sum to 1\.0/);
  });

  it("rejects weights summing to more than 1.0", () => {
    expect(() =>
      assertWeightsSumToOne({
        entries: [
          { bracketSlug: "a", weight: 0.6 },
          { bracketSlug: "b", weight: 0.6 },
        ],
      }),
    ).toThrow(/sum to 1\.0/);
  });
});

// ── hydrateBracketMix tests ────────────────────────────────────────────────

describe("Tiago — hydrateBracketMix (R3 deterministic skip)", () => {
  it("hydrates entries with engine-readable BracketEntry fields", () => {
    const split = {
      entries: [
        { bracketSlug: "boutique-upscale-hotel", weight: 0.6 },
        { bracketSlug: "performance-str-cluster", weight: 0.4 },
      ],
    };
    const mix: BracketMixData = hydrateBracketMix(split, ACTIVE_BRACKETS, "test");

    expect(mix.entries).toHaveLength(2);
    expect(mix.entries[0]).toMatchObject({
      id: "boutique-upscale-hotel",
      name: "Boutique Upscale Hotel",
      archetypeLabel: "Hotel · Upscale",
      serviceConsumption: "hotel",
      weight: 0.6,
    });
    expect(mix.entries[1].serviceConsumption).toBe("str");
    expect(mix.assignedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("silently drops unknown bracket slugs (R3 — deterministic skip)", () => {
    const split = {
      entries: [
        { bracketSlug: "boutique-upscale-hotel", weight: 0.5 },
        { bracketSlug: "phantom-archetype", weight: 0.5 },
      ],
    };
    const mix = hydrateBracketMix(split, ACTIVE_BRACKETS, "test");
    expect(mix.entries).toHaveLength(1);
    expect(mix.entries[0].id).toBe("boutique-upscale-hotel");
  });
});

// ── runForPeer integration paths ───────────────────────────────────────────

describe("Tiago — runForPeer (happy + failure paths)", () => {
  it("happy path: persists run row + updates peer pointer; weights normalize to 1.0", async () => {
    const inserts: CapturedInsert[] = [];
    const updates: CapturedUpdate[] = [];
    let nextId = 1000;
    const fakeDb = makeFakeDb({
      peers: [{ id: 7, name: "Auberge Resorts", nicheTags: ["luxury"] }],
      inserts,
      updates,
      nextRunId: () => nextId++,
    });

    const result = await runForPeer(7, makeDeps({ db: fakeDb as unknown as TiagoDeps["db"] }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.runId).toBe(1000);

    // Exactly one bracket_mix_runs insert with target_kind='peer'.
    expect(inserts).toHaveLength(1);
    expect(inserts[0].values.targetKind).toBe("peer");
    expect(inserts[0].values.targetId).toBe(7);
    expect(inserts[0].values.provisional).toBe(false);

    // Mix in the insert has hydrated BracketEntry fields.
    const mix = inserts[0].values.mixValue as BracketMixData;
    expect(mix.entries.map((e) => e.weight).reduce((a, b) => a + b, 0)).toBeCloseTo(1.0);

    // Exactly one peer update with the new lastResearchRunId.
    expect(updates).toHaveLength(1);
    expect(updates[0].set.lastResearchRunId).toBe(1000);
    expect(updates[0].set.brandArchetypeSplit).toBeDefined();
  });

  it("peer not found → returns failure without writes", async () => {
    const inserts: CapturedInsert[] = [];
    const updates: CapturedUpdate[] = [];
    const fakeDb = makeFakeDb({
      peers: [],
      inserts,
      updates,
      nextRunId: () => 1,
    });

    const result = await runForPeer(999, makeDeps({ db: fakeDb as unknown as TiagoDeps["db"] }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toMatch(/peer 999 not found/);
    expect(inserts).toHaveLength(0);
    expect(updates).toHaveLength(0);
  });

  it("malformed LLM output → returns failure; no run row written", async () => {
    const inserts: CapturedInsert[] = [];
    const updates: CapturedUpdate[] = [];
    const fakeDb = makeFakeDb({
      peers: [{ id: 7, name: "Test Peer", nicheTags: null }],
      inserts,
      updates,
      nextRunId: () => 1,
    });
    const deps = makeDeps({
      db: fakeDb as unknown as TiagoDeps["db"],
      callLlm: async () => "this is not JSON",
    });

    const result = await runForPeer(7, deps);

    expect(result.ok).toBe(false);
    expect(inserts).toHaveLength(0);
    expect(updates).toHaveLength(0);
  });

  it("GroundedResearchService unavailable → returns failure; previous pointer preserved", async () => {
    const inserts: CapturedInsert[] = [];
    const updates: CapturedUpdate[] = [];
    const fakeDb = makeFakeDb({
      peers: [{ id: 7, name: "Test Peer", nicheTags: null }],
      inserts,
      updates,
      nextRunId: () => 1,
    });
    const deps = makeDeps({
      db: fakeDb as unknown as TiagoDeps["db"],
      groundedSearch: async () => {
        throw new Error("Tavily unavailable");
      },
    });

    const result = await runForPeer(7, deps);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toMatch(/Tavily unavailable/);
    expect(inserts).toHaveLength(0);
    expect(updates).toHaveLength(0);
  });
});

describe("Tiago — runForCompanyOverride", () => {
  it("empty comp set → returns failure without writes", async () => {
    const inserts: CapturedInsert[] = [];
    const updates: CapturedUpdate[] = [];
    const fakeDb = makeFakeDb({
      peers: [],
      inserts,
      updates,
      nextRunId: () => 1,
    });

    const result = await runForCompanyOverride(
      42,
      [],
      makeDeps({ db: fakeDb as unknown as TiagoDeps["db"] }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toMatch(/at least one slug/);
  });

  it("happy path: persists run with target_kind='company' and target_id=companyId", async () => {
    const inserts: CapturedInsert[] = [];
    const updates: CapturedUpdate[] = [];
    let nextId = 2000;
    const fakeDb = makeFakeDb({
      peers: [],
      inserts,
      updates,
      nextRunId: () => nextId++,
    });

    const result = await runForCompanyOverride(
      42,
      ["auberge-resorts", "kimpton"],
      makeDeps({ db: fakeDb as unknown as TiagoDeps["db"] }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.runId).toBe(2000);

    expect(inserts).toHaveLength(1);
    expect(inserts[0].values.targetKind).toBe("company");
    expect(inserts[0].values.targetId).toBe(42);
    // company-override runs do NOT touch icp_peer_companies — U6 handles binding to global_assumptions.
    expect(updates).toHaveLength(0);
  });
});
