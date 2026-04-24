/**
 * P6a follow-up — per-Specialist allow-list for admin-authored
 * requiredFields keys.
 *
 * Three concerns covered:
 *   1) Helper semantics: getValidRequiredFieldKeys + findInvalidRequiredFieldKeys
 *      return the right shape (null for un-allow-listed Specialists, [] for
 *      all-valid input, the bad keys otherwise).
 *   2) Source-of-truth alignment: the funding allow-list must match the
 *      keys of `CapitalRaiseInputs` (engine/watchdog/capitalRaiseEvaluator.ts);
 *      the revenue allow-list must match the saved-row keys the route
 *      handler reads in server/routes/global-assumptions.ts BEFORE the
 *      `?? DEFAULT_*` substitution. These are pinned so a future drift
 *      (rename/add/remove) breaks the test instead of silently making the
 *      gate ineffective again.
 */
import { describe, expect, it } from "vitest";
import {
  FUNDING_VALID_REQUIRED_FIELD_KEYS,
  REVENUE_FIELD_MAPPINGS,
  REVENUE_VALID_REQUIRED_FIELD_KEYS,
  findInvalidRequiredFieldKeys,
  getValidRequiredFieldKeys,
} from "@engine/analyst/registry/required-field-keys";
import type { CapitalRaiseInputs } from "@engine/watchdog/capitalRaiseEvaluator";
import type { RevenueInputs } from "@engine/watchdog/revenueEvaluator";

describe("getValidRequiredFieldKeys", () => {
  it("returns the funding allow-list for mgmt-co.funding", () => {
    expect(getValidRequiredFieldKeys("mgmt-co.funding")).toBe(
      FUNDING_VALID_REQUIRED_FIELD_KEYS,
    );
  });

  it("returns the revenue allow-list for mgmt-co.revenue", () => {
    expect(getValidRequiredFieldKeys("mgmt-co.revenue")).toBe(
      REVENUE_VALID_REQUIRED_FIELD_KEYS,
    );
  });

  it("returns null for Specialists without a wired allow-list", () => {
    expect(getValidRequiredFieldKeys("mgmt-co.icp-intelligence")).toBeNull();
    expect(getValidRequiredFieldKeys("portfolio-ops.watchdog")).toBeNull();
    expect(getValidRequiredFieldKeys("does-not-exist")).toBeNull();
  });
});

describe("findInvalidRequiredFieldKeys", () => {
  it("returns [] when every field is in the allow-list", () => {
    expect(
      findInvalidRequiredFieldKeys("mgmt-co.funding", [
        "runwayBufferMonths",
        "trancheGapMonths",
      ]),
    ).toEqual([]);
  });

  it("returns the offending keys when some are outside the allow-list", () => {
    expect(
      findInvalidRequiredFieldKeys("mgmt-co.revenue", [
        "defaultCostRateMarketing", // valid (saved-row key)
        "marketingRate", // invalid (dispatch-payload key, wrong namespace)
        "totallyMadeUp", // invalid (typo)
      ]),
    ).toEqual(["marketingRate", "totallyMadeUp"]);
  });

  it("returns [] for Specialists without a wired allow-list (accept any)", () => {
    expect(
      findInvalidRequiredFieldKeys("mgmt-co.icp-intelligence", [
        "anything",
        "the-admin",
        "wants",
      ]),
    ).toEqual([]);
  });

  it("returns [] for empty input regardless of allow-list state", () => {
    expect(findInvalidRequiredFieldKeys("mgmt-co.funding", [])).toEqual([]);
    expect(findInvalidRequiredFieldKeys("does-not-exist", [])).toEqual([]);
  });
});

describe("source-of-truth alignment (drift guards)", () => {
  // These tests pin the allow-list to the actual upstream namespace. If a
  // field is added or renamed in CapitalRaiseInputs / the saved-row schema
  // / the revenue dispatch transform, one of these tests breaks before the
  // gate silently becomes ineffective again.

  it("funding allow-list equals the keys of CapitalRaiseInputs", () => {
    // Build a structurally complete CapitalRaiseInputs literal so TS
    // enforces both directions (missing key here = TS error; extra key
    // here = TS error). Then assert the runtime allow-list matches.
    const witness: Required<{ [K in keyof CapitalRaiseInputs]-?: true }> = {
      runwayBufferMonths: true,
      sizingOvershootPct: true,
      trancheGapMonths: true,
      revenueRampDelayMonths: true,
      burnFlexDownPct: true,
    };
    const expectedKeys = Object.keys(witness).sort();
    expect([...FUNDING_VALID_REQUIRED_FIELD_KEYS].sort()).toEqual(expectedKeys);
  });

  it("revenue allow-list is derived from REVENUE_FIELD_MAPPINGS (single source of truth)", () => {
    // The route handler in server/routes/global-assumptions.ts iterates
    // REVENUE_FIELD_MAPPINGS to build the dispatch payload — the same map
    // the allow-list is derived from. So any drift would require editing
    // the map, which simultaneously updates both behaviors.
    expect([...REVENUE_VALID_REQUIRED_FIELD_KEYS].sort()).toEqual(
      REVENUE_FIELD_MAPPINGS.map((m) => m.savedRowKey).sort(),
    );
  });

  it("REVENUE_FIELD_MAPPINGS savedRowKey set is the agreed list of GA columns", () => {
    // The `satisfies … keyof GlobalAssumptionsRow` constraint on
    // REVENUE_FIELD_MAPPINGS already rejects typos / removed columns at
    // compile time. This runtime witness pins the *contents* — adding or
    // removing a saved-row entry without updating this test will fail,
    // which is the moment to also re-examine whether the route handler's
    // dispatch is still correct.
    const expectedSavedRowKeys = [
      "defaultCostRateMarketing",
      "defaultRevShareFb",
      "defaultRevShareEvents",
      "defaultRevShareOther",
      "defaultCateringBoostPct",
    ].sort();
    expect(
      REVENUE_FIELD_MAPPINGS.map((m) => m.savedRowKey as string).sort(),
    ).toEqual(expectedSavedRowKeys);
  });

  it("REVENUE_FIELD_MAPPINGS exhaustively covers every RevenueInputs dispatch key", () => {
    // The other half of the contract: if a new field is added to
    // RevenueInputs but the mapping isn't updated, this fails. Combined with
    // the `satisfies … keyof RevenueInputs` constraint in the registry
    // (which catches unknown dispatch keys), the mapping is bidirectionally
    // pinned to RevenueInputs.
    const witness: Required<{ [K in keyof RevenueInputs]-?: true }> = {
      marketingRate: true,
      fbRevenueShare: true,
      eventsRevenueShare: true,
      otherRevenueShare: true,
      cateringBoostPct: true,
    };
    const expectedDispatchKeys = Object.keys(witness).sort();
    expect(
      REVENUE_FIELD_MAPPINGS.map((m) => m.dispatchKey as string).sort(),
    ).toEqual(expectedDispatchKeys);
  });

  it("revenue allow-list does NOT contain dispatch-payload keys (would be a no-op gate)", () => {
    // Defensive: the post-default-substitution dispatch payload uses
    // RevenueInputs keys (marketingRate, fbRevenueShare, ...). If any of
    // those leaked into the admin allow-list, the route-level gate would
    // false-positive on every save (saved row doesn't contain them). Pin
    // the negative invariant.
    const dispatchPayloadKeys: ReadonlyArray<keyof RevenueInputs> = [
      "marketingRate",
      "fbRevenueShare",
      "eventsRevenueShare",
      "otherRevenueShare",
      "cateringBoostPct",
    ];
    for (const k of dispatchPayloadKeys) {
      expect(REVENUE_VALID_REQUIRED_FIELD_KEYS).not.toContain(k as string);
    }
  });
});
