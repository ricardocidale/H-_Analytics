/**
 * Tests for server/data/research-reference-urls.ts
 *
 * Pure constant validation — no mocking needed.
 */
import { describe, it, expect } from "vitest";

import {
  HOSPITALITY_REFERENCE_URLS,
  REFERENCE_URL_GROUPS,
} from "../../server/data/research-reference-urls";

describe("research-reference-urls", () => {
  // ── 1. HOSPITALITY_REFERENCE_URLS has expected keys ────────────────────
  it("contains expected reference URL keys", () => {
    const keys = Object.keys(HOSPITALITY_REFERENCE_URLS);

    const expectedKeys = [
      "str_trend_report",
      "cbre_cap_rate_survey",
      "hvs_publications",
      "fred_api_docs",
      "irs_depreciation",
      "usali_12th",
      "damodaran_country_risk",
      "global_wellness_institute",
      "costar_analytics",
      "walk_score_methodology",
    ];

    for (const key of expectedKeys) {
      expect(keys).toContain(key);
    }

    // Should have a substantial number of URLs
    expect(keys.length).toBeGreaterThanOrEqual(30);
  });

  // ── 2. All URLs are valid format ───────────────────────────────────────
  it("all URLs start with https://", () => {
    const entries = Object.entries(HOSPITALITY_REFERENCE_URLS);
    expect(entries.length).toBeGreaterThan(0);

    for (const [key, url] of entries) {
      expect(url, `URL for "${key}" should start with https://`).toMatch(/^https:\/\//);
    }
  });

  // ── 3. REFERENCE_URL_GROUPS maps to valid contexts ─────────────────────
  describe("REFERENCE_URL_GROUPS", () => {
    it("has expected group keys", () => {
      const groupKeys = Object.keys(REFERENCE_URL_GROUPS);

      const expectedGroups = [
        "adr_research",
        "cap_rate_research",
        "operating_cost_research",
        "macro_economic_research",
        "tax_depreciation_research",
        "wellness_vertical_research",
        "comp_set_research",
        "location_quality_research",
        "regulatory_research",
      ];

      for (const group of expectedGroups) {
        expect(groupKeys, `Missing group: ${group}`).toContain(group);
      }
    });

    it("each group has a non-empty array of valid URL keys", () => {
      const validKeys = new Set(Object.keys(HOSPITALITY_REFERENCE_URLS));

      for (const [groupName, urlKeys] of Object.entries(REFERENCE_URL_GROUPS)) {
        expect(
          Array.isArray(urlKeys),
          `${groupName} should be an array`,
        ).toBe(true);
        expect(
          urlKeys.length,
          `${groupName} should not be empty`,
        ).toBeGreaterThan(0);

        for (const key of urlKeys) {
          expect(
            validKeys.has(key),
            `Group "${groupName}" references unknown URL key "${key}"`,
          ).toBe(true);
        }
      }
    });
  });
});
