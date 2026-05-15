/**
 * Plan 2026-05-13-002 Unit U6 — agent-native parity smoke test for the
 * As-Improved (post-renovation hypothesis) property fields.
 *
 * Even though `update_property` / `patch_property` accept the new
 * `*Improved` typed columns by construction (they're picked into
 * `updatePropertySchema` in `lib/db/src/schema/properties.ts`), the parity
 * map needs an explicit smoke test that proves the round-trip:
 *
 *   patch_property({ id, fields: { fbVenuesImproved, descriptionImproved } })
 *     → storage.updateProperty receives those fields
 *     → get_property reflects them on the `asImproved` envelope.
 *
 * Storage is mocked at the module level (matching the convention in
 * `rebecca-tools.test.ts`) so no live DB connection is needed.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Module mocks — hoisted before any import that loads the mocked modules.
// ---------------------------------------------------------------------------

const mockGetProperty = vi.fn();
const mockUpdateProperty = vi.fn();

vi.mock("../storage", () => ({
  storage: {
    getProperty: (...a: unknown[]) => mockGetProperty(...a),
    updateProperty: (...a: unknown[]) => mockUpdateProperty(...a),
  },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { dispatchRebeccaTool } from "../chat/rebecca-tools";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CTX_USER = { userId: 1 };

function makeProperty(overrides: Record<string, unknown> = {}) {
  return {
    id: 42,
    userId: 1,
    name: "Catskills Inn",
    country: "US",
    type: "hotel",
    startAdr: 200,
    maxOccupancy: 20,
    description: "Legacy free-text description.",
    descriptionPurchased: "As-Purchased: 30-room boutique inn.",
    fbVenues: 1,
    fbSeats: 40,
    eventSpaceSqft: 800,
    totalBuildingSqft: 12_000,
    fbVenuesImproved: null,
    fbSeatsImproved: null,
    eventSpaceSqftImproved: null,
    totalBuildingSqftImproved: null,
    descriptionImproved: null,
    plannedReopeningYear: null,
    descriptorsPurchased: null,
    descriptorsImproved: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// patch_property — As-Improved write path
// ---------------------------------------------------------------------------

describe("dispatchRebeccaTool — patch_property writes As-Improved fields", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetProperty.mockResolvedValue(makeProperty());
    mockUpdateProperty.mockResolvedValue(undefined);
  });

  it("accepts fbVenuesImproved + descriptionImproved and forwards both to storage", async () => {
    const result = await dispatchRebeccaTool(
      "patch_property",
      {
        id: 42,
        fields: {
          fbVenuesImproved: 3,
          descriptionImproved:
            "Post-reno hypothesis: 3 F&B venues including a wine bar and rooftop café.",
        },
      },
      CTX_USER,
    );

    const r = result.result as Record<string, unknown>;
    expect(r.success).toBe(true);
    const updated = r.updated as string[];
    expect(updated).toEqual(
      expect.arrayContaining(["fbVenuesImproved", "descriptionImproved"]),
    );
    expect(r.skipped).toBeUndefined();

    expect(mockUpdateProperty).toHaveBeenCalledOnce();
    const [, patch] = mockUpdateProperty.mock.calls[0] as [
      number,
      Record<string, unknown>,
    ];
    expect(patch.fbVenuesImproved).toBe(3);
    expect(patch.descriptionImproved).toContain("Post-reno hypothesis");
  });

  it("accepts the full As-Improved descriptor set in a single patch", async () => {
    const result = await dispatchRebeccaTool(
      "patch_property",
      {
        id: 42,
        fields: {
          fbVenuesImproved: 4,
          fbSeatsImproved: 120,
          eventSpaceSqftImproved: 2_400,
          totalBuildingSqftImproved: 18_000,
          plannedReopeningYear: 2027,
          descriptionImproved: "Post-reno: full F&B + event programming.",
        },
      },
      CTX_USER,
    );

    const r = result.result as Record<string, unknown>;
    expect(r.success).toBe(true);
    const updated = r.updated as string[];
    for (const f of [
      "fbVenuesImproved",
      "fbSeatsImproved",
      "eventSpaceSqftImproved",
      "totalBuildingSqftImproved",
      "plannedReopeningYear",
      "descriptionImproved",
    ]) {
      expect(updated).toContain(f);
    }
    expect(r.skipped).toBeUndefined();
    expect(mockUpdateProperty).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// get_property — As-Improved read path
// ---------------------------------------------------------------------------

describe("dispatchRebeccaTool — get_property surfaces As-Improved values", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns asImproved descriptors from typed *Improved columns", async () => {
    mockGetProperty.mockResolvedValue(
      makeProperty({
        fbVenuesImproved: 3,
        fbSeatsImproved: 96,
        eventSpaceSqftImproved: 1_800,
        totalBuildingSqftImproved: 16_500,
        plannedReopeningYear: 2027,
        descriptionImproved: "Post-reno: 3 venues + larger event space.",
      }),
    );

    const result = await dispatchRebeccaTool(
      "get_property",
      { id: 42 },
      CTX_USER,
    );
    const property = (result.result as { property: Record<string, unknown> })
      .property;
    const asImproved = property.asImproved as Record<string, unknown>;

    expect(asImproved.fbVenues).toBe(3);
    expect(asImproved.fbSeats).toBe(96);
    expect(asImproved.eventSpaceSqft).toBe(1_800);
    expect(asImproved.totalBuildingSqft).toBe(16_500);
    expect(asImproved.plannedReopeningYear).toBe(2027);
    expect(asImproved.description).toContain("Post-reno");
  });

  it("falls back to As-Purchased twin when As-Improved column is null", async () => {
    mockGetProperty.mockResolvedValue(makeProperty());

    const result = await dispatchRebeccaTool(
      "get_property",
      { id: 42 },
      CTX_USER,
    );
    const property = (result.result as { property: Record<string, unknown> })
      .property;
    const asImproved = property.asImproved as Record<string, unknown>;
    const asPurchased = property.asPurchased as Record<string, unknown>;

    expect(asImproved.fbVenues).toBe(asPurchased.fbVenues);
    expect(asImproved.fbSeats).toBe(asPurchased.fbSeats);
    expect(asImproved.eventSpaceSqft).toBe(asPurchased.eventSpaceSqft);
    expect(asImproved.totalBuildingSqft).toBe(asPurchased.totalBuildingSqft);
    expect(asImproved.plannedReopeningYear).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Round-trip — patch then get
// ---------------------------------------------------------------------------

describe("As-Improved round-trip — patch_property → get_property", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("values written via patch_property surface on the next get_property", async () => {
    let stored = makeProperty();
    mockGetProperty.mockImplementation(async () => stored);
    mockUpdateProperty.mockImplementation(
      async (_id: number, patch: Record<string, unknown>) => {
        stored = { ...stored, ...patch };
      },
    );

    const patchResult = await dispatchRebeccaTool(
      "patch_property",
      {
        id: 42,
        fields: {
          fbVenuesImproved: 5,
          descriptionImproved: "Post-reno: F&B-led repositioning.",
        },
      },
      CTX_USER,
    );
    expect((patchResult.result as Record<string, unknown>).success).toBe(true);

    const getResult = await dispatchRebeccaTool(
      "get_property",
      { id: 42 },
      CTX_USER,
    );
    const asImproved = (
      (getResult.result as { property: Record<string, unknown> }).property
        .asImproved as Record<string, unknown>
    );
    expect(asImproved.fbVenues).toBe(5);
    expect(asImproved.description).toContain("F&B-led");
  });
});
