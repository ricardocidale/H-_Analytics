/**
 * Tests for server/ai/exit-vertical-suggestion.ts
 *
 * The suggestion helper is a pure function (Property[] + ExitMultiple[] →
 * suggestion). Verifies:
 *   - empty inputs return null,
 *   - hospitality-named verticals beat unrelated SaaS-style verticals,
 *   - dominant quality tier and ADR drive the keyword score,
 *   - selecting a vertical that no longer exists returns the best alternative
 *     (graceful degradation handled in the route + UI; here we just confirm
 *     the helper picks something deterministically when keywords match).
 */
import { describe, it, expect } from "vitest";
import { suggestIndustryVertical } from "../../server/ai/exit-vertical-suggestion";
import type { Property, ExitMultiple } from "@shared/schema";

let idSeq = 1;

function makeProperty(overrides: Partial<Property> = {}): Property {
  const id = idSeq++;
  return {
    id,
    userId: 1,
    name: `Property ${id}`,
    location: "Test",
    city: "Test City",
    country: "United States",
    market: "Test",
    imageUrl: "https://example.com/img.jpg",
    status: "active",
    acquisitionDate: "2025-01-01",
    operationsStartDate: "2025-06-01",
    purchasePrice: 2_000_000,
    buildingImprovements: 500_000,
    landValuePercent: 0.20,
    roomCount: 50,
    startAdr: 220,
    qualityTier: "upscale",
    hospitalityType: "hotel",
    isActive: true,
    ...overrides,
  } as Property;
}

const hospitalityVerticals: Pick<ExitMultiple, "dimensionKey" | "label">[] = [
  { dimensionKey: "boutique-luxury", label: "Boutique Luxury Hotel" },
  { dimensionKey: "upscale-lifestyle", label: "Upscale Lifestyle Hotel" },
  { dimensionKey: "select-service", label: "Select Service Hotel" },
  { dimensionKey: "economy-limited", label: "Economy Limited Service" },
  { dimensionKey: "resort", label: "Full-Service Resort" },
];

const saasVerticals: Pick<ExitMultiple, "dimensionKey" | "label">[] = [
  { dimensionKey: "saas", label: "SaaS (revenue multiple)" },
  { dimensionKey: "ecommerce", label: "E-commerce (revenue multiple)" },
  { dimensionKey: "marketplace", label: "Marketplace (GMV-take multiple)" },
  { dimensionKey: "fintech", label: "Fintech (revenue multiple)" },
  { dimensionKey: "healthtech", label: "Healthtech (revenue multiple)" },
];

describe("suggestIndustryVertical", () => {
  beforeEach(() => { idSeq = 1; });

  it("returns null when no verticals are available", () => {
    const out = suggestIndustryVertical([makeProperty()], []);
    expect(out).toBeNull();
  });

  it("returns null when the user has no properties", () => {
    const out = suggestIndustryVertical([], hospitalityVerticals);
    expect(out).toBeNull();
  });

  it("ignores archived properties when building the profile", () => {
    const out = suggestIndustryVertical(
      [makeProperty({ isActive: false, qualityTier: "luxury", startAdr: 800 })],
      hospitalityVerticals,
    );
    // No active properties → null.
    expect(out).toBeNull();
  });

  it("luxury small-format portfolio → boutique-luxury vertical wins", () => {
    const out = suggestIndustryVertical(
      [
        makeProperty({ qualityTier: "luxury", startAdr: 600, roomCount: 25 }),
        makeProperty({ qualityTier: "luxury", startAdr: 550, roomCount: 30 }),
      ],
      hospitalityVerticals,
    );
    expect(out).not.toBeNull();
    expect(out!.dimensionKey).toBe("boutique-luxury");
    expect(out!.rationale).toMatch(/luxury/i);
  });

  it("midscale select-service portfolio → select-service vertical wins", () => {
    const out = suggestIndustryVertical(
      [
        makeProperty({ qualityTier: "midscale", startAdr: 140, roomCount: 120 }),
        makeProperty({ qualityTier: "midscale", startAdr: 150, roomCount: 110 }),
      ],
      hospitalityVerticals,
    );
    expect(out).not.toBeNull();
    expect(["select-service", "economy-limited"]).toContain(out!.dimensionKey);
  });

  it("resort hospitality type → resort vertical wins over generic hotel labels", () => {
    // Larger room count avoids the "boutique/lifestyle" auto-tags so the test
    // isolates the hospitality-type signal. The resort-named vertical accumulates
    // hits on both `hospitalityType` and `locationType` keywords and wins
    // against an unrelated SaaS-style alternative.
    const verticals = [
      { dimensionKey: "saas", label: "SaaS" },
      { dimensionKey: "resort", label: "Full-Service Resort Hotel" },
    ];
    const out = suggestIndustryVertical(
      [
        makeProperty({
          hospitalityType: "resort",
          locationType: "resort",
          qualityTier: "upscale",
          startAdr: 250,
          roomCount: 250,
        }),
      ],
      verticals,
    );
    expect(out).not.toBeNull();
    expect(out!.dimensionKey).toBe("resort");
  });

  it("falls back gracefully when the only verticals are unrelated (SaaS-style)", () => {
    const out = suggestIndustryVertical(
      [makeProperty({ qualityTier: "upscale", startAdr: 250 })],
      saasVerticals,
    );
    // No keyword hits — but a deterministic suggestion is still returned with
    // a "no close match" rationale so the UI can render it.
    expect(out).not.toBeNull();
    expect(out!.dimensionKey).toBeTruthy();
    expect(out!.rationale).toMatch(/no vertical closely matches/i);
  });

  it("rationale includes the matched keywords for transparency", () => {
    const out = suggestIndustryVertical(
      [makeProperty({ qualityTier: "luxury", startAdr: 600, roomCount: 25 })],
      hospitalityVerticals,
    );
    expect(out!.rationale).toMatch(/matched on/i);
  });
});

import { beforeEach } from "vitest";
