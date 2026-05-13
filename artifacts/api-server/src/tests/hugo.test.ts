/**
 * Hugo — Bracket-Mix Aggregator Minion tests
 *
 * Phase B U4 of the ICP bracket-mix peer-derived rebuild plan. Pure
 * deterministic — no DB, no LLM, no I/O. Covers AE1 (cold start) and AE4
 * (byte-identical determinism).
 */
import { describe, it, expect } from "vitest";
import { aggregate, type ActiveBracket, type PeerRow } from "../ai/ambient/minions/hugo";

const ACTIVE_BRACKETS: ActiveBracket[] = [
  { slug: "boutique-upscale-hotel",       name: "Boutique Upscale Hotel",     archetypeLabel: "Hotel · Upscale",       customerType: "hotel" },
  { slug: "branded-full-service-hotel",   name: "Branded Full-Service Hotel", archetypeLabel: "Hotel · Full Service",  customerType: "hotel" },
  { slug: "performance-str-cluster",      name: "Performance STR Cluster",    archetypeLabel: "STR · Performance",     customerType: "str" },
  { slug: "agritourism-experiential-lodge", name: "Agritourism & Experiential Lodge", archetypeLabel: "Hotel · Experiential", customerType: "hotel" },
];

const FIXED_NOW = new Date("2026-05-13T00:00:00.000Z");

function peer(overrides: Partial<PeerRow>): PeerRow {
  return {
    id: 1,
    isActive: true,
    rosterSizeEstimate: 10,
    brandArchetypeSplit: null,
    ...overrides,
  };
}

describe("Hugo aggregator — cold start (AE1)", () => {
  it("zero researched peers → equal-weight, provisional=true, no contributing peers", () => {
    const result = aggregate({
      peers: [],
      activeBrackets: ACTIVE_BRACKETS,
      evidenceLabel: "test",
      now: FIXED_NOW,
    });

    expect(result.provisional).toBe(true);
    expect(result.contributingPeerIds).toEqual([]);
    expect(result.totalRosterEstimate).toBe(0);
    expect(result.mix.entries).toHaveLength(4);
    for (const entry of result.mix.entries) {
      expect(entry.weight).toBeCloseTo(0.25);
    }
  });

  it("peers exist but none have a non-null split → still cold start", () => {
    const result = aggregate({
      peers: [
        peer({ id: 1, brandArchetypeSplit: null }),
        peer({ id: 2, brandArchetypeSplit: null }),
      ],
      activeBrackets: ACTIVE_BRACKETS,
      evidenceLabel: "test",
      now: FIXED_NOW,
    });
    expect(result.provisional).toBe(true);
  });

  it("peers with non-null split but zero roster_size_estimate → cold start (R3 zero-weight rule)", () => {
    const result = aggregate({
      peers: [
        peer({
          id: 1,
          rosterSizeEstimate: 0,
          brandArchetypeSplit: {
            entries: [{ bracketSlug: "boutique-upscale-hotel", weight: 1.0 }],
          },
        }),
      ],
      activeBrackets: ACTIVE_BRACKETS,
      evidenceLabel: "test",
      now: FIXED_NOW,
    });
    expect(result.provisional).toBe(true);
  });

  it("evidence label tags cold-start results explicitly", () => {
    const result = aggregate({
      peers: [],
      activeBrackets: ACTIVE_BRACKETS,
      evidenceLabel: "Hugo recompute",
      now: FIXED_NOW,
    });
    expect(result.mix.evidence).toMatch(/cold-start equal-weight \(provisional\)/);
  });
});

describe("Hugo aggregator — normal path", () => {
  it("one peer with split → weighted result equals that peer's split", () => {
    const result = aggregate({
      peers: [
        peer({
          id: 7,
          rosterSizeEstimate: 50,
          brandArchetypeSplit: {
            entries: [
              { bracketSlug: "boutique-upscale-hotel", weight: 0.7 },
              { bracketSlug: "branded-full-service-hotel", weight: 0.3 },
            ],
          },
        }),
      ],
      activeBrackets: ACTIVE_BRACKETS,
      evidenceLabel: "test",
      now: FIXED_NOW,
    });

    expect(result.provisional).toBe(false);
    expect(result.contributingPeerIds).toEqual([7]);
    expect(result.totalRosterEstimate).toBe(50);
    const bySlug = new Map(result.mix.entries.map((e) => [e.id, e.weight]));
    expect(bySlug.get("boutique-upscale-hotel")).toBeCloseTo(0.7);
    expect(bySlug.get("branded-full-service-hotel")).toBeCloseTo(0.3);
  });

  it("two peers with different splits → roster-weighted average sums to 1.0", () => {
    const result = aggregate({
      peers: [
        peer({
          id: 1,
          rosterSizeEstimate: 100,
          brandArchetypeSplit: {
            entries: [
              { bracketSlug: "boutique-upscale-hotel", weight: 1.0 },
            ],
          },
        }),
        peer({
          id: 2,
          rosterSizeEstimate: 100,
          brandArchetypeSplit: {
            entries: [
              { bracketSlug: "performance-str-cluster", weight: 1.0 },
            ],
          },
        }),
      ],
      activeBrackets: ACTIVE_BRACKETS,
      evidenceLabel: "test",
      now: FIXED_NOW,
    });

    expect(result.provisional).toBe(false);
    expect(result.totalRosterEstimate).toBe(200);
    expect(result.contributingPeerIds).toEqual([1, 2]);
    const total = result.mix.entries.reduce((s, e) => s + e.weight, 0);
    expect(total).toBeCloseTo(1.0);
    const bySlug = new Map(result.mix.entries.map((e) => [e.id, e.weight]));
    expect(bySlug.get("boutique-upscale-hotel")).toBeCloseTo(0.5);
    expect(bySlug.get("performance-str-cluster")).toBeCloseTo(0.5);
  });

  it("brackets in peer splits not in activeBrackets are silently dropped (R3)", () => {
    const result = aggregate({
      peers: [
        peer({
          id: 1,
          rosterSizeEstimate: 100,
          brandArchetypeSplit: {
            entries: [
              { bracketSlug: "boutique-upscale-hotel", weight: 0.5 },
              { bracketSlug: "phantom-archetype-not-in-catalog", weight: 0.5 },
            ],
          },
        }),
      ],
      activeBrackets: ACTIVE_BRACKETS,
      evidenceLabel: "test",
      now: FIXED_NOW,
    });

    expect(result.provisional).toBe(false);
    // The phantom slug's weight is normalized out; boutique becomes 100%
    // of the surviving weight pool.
    const total = result.mix.entries.reduce((s, e) => s + e.weight, 0);
    expect(total).toBeCloseTo(1.0);
    expect(result.mix.entries.find((e) => e.id === "boutique-upscale-hotel")?.weight).toBeCloseTo(1.0);
    expect(result.mix.entries.find((e) => e.id === "phantom-archetype-not-in-catalog")).toBeUndefined();
  });

  it("output entries preserve activeBrackets iteration order", () => {
    const result = aggregate({
      peers: [
        peer({
          id: 1,
          rosterSizeEstimate: 100,
          brandArchetypeSplit: {
            entries: [
              { bracketSlug: "performance-str-cluster", weight: 0.4 },
              { bracketSlug: "boutique-upscale-hotel", weight: 0.6 },
            ],
          },
        }),
      ],
      activeBrackets: ACTIVE_BRACKETS,
      evidenceLabel: "test",
      now: FIXED_NOW,
    });
    // ACTIVE_BRACKETS lists boutique-upscale-hotel first, performance-str-cluster third.
    const ids = result.mix.entries.map((e) => e.id);
    expect(ids.indexOf("boutique-upscale-hotel")).toBeLessThan(ids.indexOf("performance-str-cluster"));
  });

  it("STR brackets get serviceConsumption='str'; hotels get 'hotel'", () => {
    const result = aggregate({
      peers: [
        peer({
          id: 1,
          rosterSizeEstimate: 100,
          brandArchetypeSplit: {
            entries: [
              { bracketSlug: "performance-str-cluster", weight: 0.4 },
              { bracketSlug: "branded-full-service-hotel", weight: 0.6 },
            ],
          },
        }),
      ],
      activeBrackets: ACTIVE_BRACKETS,
      evidenceLabel: "test",
      now: FIXED_NOW,
    });
    const bySlug = new Map(result.mix.entries.map((e) => [e.id, e.serviceConsumption]));
    expect(bySlug.get("performance-str-cluster")).toBe("str");
    expect(bySlug.get("branded-full-service-hotel")).toBe("hotel");
  });

  it("inactive peers are excluded from the aggregation (R3 explicit filter)", () => {
    const result = aggregate({
      peers: [
        peer({
          id: 1,
          isActive: false,
          rosterSizeEstimate: 100,
          brandArchetypeSplit: {
            entries: [{ bracketSlug: "boutique-upscale-hotel", weight: 1.0 }],
          },
        }),
        peer({
          id: 2,
          isActive: true,
          rosterSizeEstimate: 50,
          brandArchetypeSplit: {
            entries: [{ bracketSlug: "performance-str-cluster", weight: 1.0 }],
          },
        }),
      ],
      activeBrackets: ACTIVE_BRACKETS,
      evidenceLabel: "test",
      now: FIXED_NOW,
    });
    expect(result.contributingPeerIds).toEqual([2]);
    expect(result.totalRosterEstimate).toBe(50);
  });
});

describe("Hugo aggregator — determinism (R3 / AE4)", () => {
  it("byte-identical output for identical inputs", () => {
    const inputs = {
      peers: [
        peer({
          id: 11,
          rosterSizeEstimate: 30,
          brandArchetypeSplit: {
            entries: [
              { bracketSlug: "boutique-upscale-hotel", weight: 0.4 },
              { bracketSlug: "performance-str-cluster", weight: 0.6 },
            ],
          },
        }),
        peer({
          id: 12,
          rosterSizeEstimate: 70,
          brandArchetypeSplit: {
            entries: [{ bracketSlug: "branded-full-service-hotel", weight: 1.0 }],
          },
        }),
      ],
      activeBrackets: ACTIVE_BRACKETS,
      evidenceLabel: "determinism-check",
      now: FIXED_NOW,
    };
    const a = aggregate(inputs);
    const b = aggregate(inputs);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
