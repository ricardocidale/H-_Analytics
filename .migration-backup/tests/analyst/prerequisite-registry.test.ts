/**
 * Tests for the prerequisite evaluator registry.
 *
 * Contracts under test:
 *   1. A toggled-on prerequisite with no registered evaluator fails loudly
 *      (never silently passes).
 *   2. Each of the four catalog prerequisites has a registered evaluator
 *      that exercises real storage-backed checks:
 *       - all-properties-financials-computed → reads the per-property
 *         `financialsComputedAt` timestamp (not just property presence).
 *       - all-properties-required-fields-complete → reads the union of
 *         hard-required field keys for property-subject Specialists and
 *         checks every property satisfies them.
 *       - company-profile-saved → reads
 *         `storage.hasManagementCompanyProfile()`.
 *       - constants-refreshed-within-cadence → reads the latest successful
 *         research run per (key, US baseline) and compares against the
 *         effective cadence (admin override → catalog default).
 *   3. Evaluator throws are caught and reported as failures (one bad
 *      evaluator can't break the whole gate).
 */
import { describe, it, expect } from "vitest";
import {
  evaluatePrerequisites,
  registerPrerequisiteEvaluator,
  type PrereqProperty,
  type PrereqResearchRun,
  type PrerequisiteStorage,
} from "../../engine/analyst/registry/prerequisite-registry";

interface FakeStorageInit {
  properties?: PrereqProperty[];
  hasMgmtCo?: boolean;
  requiredFieldKeys?: string[];
  /** Map "<key>::<country>::<subdivision>" → research run. */
  latestRuns?: Record<string, PrereqResearchRun | undefined>;
  /** Per-Specialist refresh-cadence overrides keyed by specialist id. */
  cadenceOverrides?: Record<string, number>;
}

function makeStorage(init: FakeStorageInit = {}): PrerequisiteStorage {
  return {
    async getAllProperties() {
      return init.properties ?? [];
    },
    async hasManagementCompanyProfile() {
      return init.hasMgmtCo ?? false;
    },
    async getLatestSuccessfulRunForConstant(key, country, subdivision) {
      const k = `${key}::${country ?? ""}::${subdivision ?? ""}`;
      return init.latestRuns?.[k];
    },
    async listHardRequiredFieldKeysForSpecialists() {
      return init.requiredFieldKeys ?? [];
    },
    async getRefreshCadenceOverrides() {
      return new Map(Object.entries(init.cadenceOverrides ?? {}));
    },
  };
}

describe("evaluatePrerequisites", () => {
  it("reports a failure for a toggled-on prerequisite with no registered evaluator", async () => {
    const failures = await evaluatePrerequisites(
      ["definitely-not-a-real-prereq-id"],
      { storage: makeStorage(), userId: 1 },
    );
    expect(failures).toHaveLength(1);
    expect(failures[0].id).toBe("definitely-not-a-real-prereq-id");
    expect(failures[0].reason).toMatch(/no evaluator is registered/i);
  });

  it("returns no failures when no prereqs are toggled on", async () => {
    const failures = await evaluatePrerequisites([], {
      storage: makeStorage(),
      userId: 1,
    });
    expect(failures).toEqual([]);
  });

  describe("all-properties-financials-computed", () => {
    it("fails when the user has zero properties", async () => {
      const failures = await evaluatePrerequisites(
        ["all-properties-financials-computed"],
        { storage: makeStorage({ properties: [] }), userId: 1 },
      );
      expect(failures).toHaveLength(1);
      expect(failures[0].reason).toMatch(/no properties in scope/i);
    });

    it("fails when at least one property is missing financialsComputedAt", async () => {
      const failures = await evaluatePrerequisites(
        ["all-properties-financials-computed"],
        {
          storage: makeStorage({
            properties: [
              { id: 1, name: "Alpha", financialsComputedAt: new Date() },
              { id: 2, name: "Beta", financialsComputedAt: null },
            ],
          }),
          userId: 1,
        },
      );
      expect(failures).toHaveLength(1);
      expect(failures[0].reason).toMatch(/Beta/);
      expect(failures[0].reason).toMatch(/no computed financial statement/i);
    });

    it("passes when every property has a financialsComputedAt timestamp", async () => {
      const failures = await evaluatePrerequisites(
        ["all-properties-financials-computed"],
        {
          storage: makeStorage({
            properties: [
              { id: 1, name: "Alpha", financialsComputedAt: new Date() },
              { id: 2, name: "Beta", financialsComputedAt: new Date() },
            ],
          }),
          userId: 1,
        },
      );
      expect(failures).toEqual([]);
    });
  });

  describe("all-properties-required-fields-complete", () => {
    it("fails when the user has zero properties", async () => {
      const failures = await evaluatePrerequisites(
        ["all-properties-required-fields-complete"],
        { storage: makeStorage({ properties: [] }), userId: 1 },
      );
      expect(failures).toHaveLength(1);
      expect(failures[0].reason).toMatch(/no properties in scope/i);
    });

    it("passes when no property-subject Specialist has any hard requirements", async () => {
      const failures = await evaluatePrerequisites(
        ["all-properties-required-fields-complete"],
        {
          storage: makeStorage({
            properties: [{ id: 1, name: "Alpha", roomCount: 50 }],
            requiredFieldKeys: [],
          }),
          userId: 1,
        },
      );
      expect(failures).toEqual([]);
    });

    it("fails when at least one property is missing a required field", async () => {
      const failures = await evaluatePrerequisites(
        ["all-properties-required-fields-complete"],
        {
          storage: makeStorage({
            properties: [
              { id: 1, name: "Alpha", roomCount: 50, startAdr: 200 },
              { id: 2, name: "Beta", roomCount: 30, startAdr: null },
            ],
            requiredFieldKeys: ["roomCount", "startAdr"],
          }),
          userId: 1,
        },
      );
      expect(failures).toHaveLength(1);
      expect(failures[0].reason).toMatch(/Beta/);
      expect(failures[0].reason).toMatch(/missing/i);
    });

    it("passes when every property satisfies every required field", async () => {
      const failures = await evaluatePrerequisites(
        ["all-properties-required-fields-complete"],
        {
          storage: makeStorage({
            properties: [
              { id: 1, name: "Alpha", roomCount: 50, startAdr: 200 },
              { id: 2, name: "Beta", roomCount: 30, startAdr: 150 },
            ],
            requiredFieldKeys: ["roomCount", "startAdr"],
          }),
          userId: 1,
        },
      );
      expect(failures).toEqual([]);
    });
  });

  describe("company-profile-saved", () => {
    it("fails when no management-company profile is saved", async () => {
      const failures = await evaluatePrerequisites(
        ["company-profile-saved"],
        { storage: makeStorage({ hasMgmtCo: false }), userId: 1 },
      );
      expect(failures).toHaveLength(1);
      expect(failures[0].reason).toMatch(/management-company profile/i);
    });

    it("passes when a management-company profile exists", async () => {
      const failures = await evaluatePrerequisites(
        ["company-profile-saved"],
        { storage: makeStorage({ hasMgmtCo: true }), userId: 1 },
      );
      expect(failures).toEqual([]);
    });
  });

  describe("constants-refreshed-within-cadence", () => {
    it("fails when at least one owned constant has never been refreshed", async () => {
      const failures = await evaluatePrerequisites(
        ["constants-refreshed-within-cadence"],
        { storage: makeStorage({ latestRuns: {} }), userId: 1 },
      );
      expect(failures).toHaveLength(1);
      expect(failures[0].reason).toMatch(/never refreshed/i);
    });

    it("fails when a refresh exists but is older than the catalog cadence", async () => {
      // Build latestRuns covering every registered key with a fresh
      // timestamp, then deliberately stale ONE key so the gate has a
      // single, predictable failure to report.
      const { REGISTERED_CONSTANT_KEYS } = await import(
        "../../shared/model-constants-registry"
      );
      const fresh = new Date();
      const ancient = new Date(Date.now() - 1000 * 60 * 60 * 24 * 400);
      const latestRuns: Record<string, PrereqResearchRun> = {};
      for (const key of REGISTERED_CONSTANT_KEYS) {
        latestRuns[`${key}::United States::`] = { completedAt: fresh };
      }
      // Find a key that has a positive cadence so this assertion isn't
      // skipped silently when it lands on an admin-on-demand-only key.
      const { getRefreshCadenceDaysForConstant } = await import(
        "../../engine/analyst/registry/specialist-catalog"
      );
      const staleKey = REGISTERED_CONSTANT_KEYS.find(
        (k) => getRefreshCadenceDaysForConstant(k) != null,
      );
      if (!staleKey) throw new Error("no constant has a positive cadence");
      latestRuns[`${staleKey}::United States::`] = { completedAt: ancient };

      const failures = await evaluatePrerequisites(
        ["constants-refreshed-within-cadence"],
        { storage: makeStorage({ latestRuns }), userId: 1 },
      );
      expect(failures).toHaveLength(1);
      expect(failures[0].reason).toMatch(new RegExp(staleKey));
    });

    it("passes when every owned constant has a fresh successful refresh", async () => {
      const { REGISTERED_CONSTANT_KEYS } = await import(
        "../../shared/model-constants-registry"
      );
      const fresh = new Date();
      const latestRuns: Record<string, PrereqResearchRun> = {};
      for (const key of REGISTERED_CONSTANT_KEYS) {
        latestRuns[`${key}::United States::`] = { completedAt: fresh };
      }
      const failures = await evaluatePrerequisites(
        ["constants-refreshed-within-cadence"],
        { storage: makeStorage({ latestRuns }), userId: 1 },
      );
      expect(failures).toEqual([]);
    });

    it("uses the admin override cadence when one is set (tighter than catalog)", async () => {
      // Pick a constant whose owning Specialist has a catalog cadence we can
      // shrink, then prove that a tighter admin override turns a refresh
      // that WOULD have been fresh under the catalog into a stale failure.
      const { REGISTERED_CONSTANT_KEYS } = await import(
        "../../shared/model-constants-registry"
      );
      const {
        getRefreshCadenceDaysForConstant,
        getSpecialistForConstant,
      } = await import("../../engine/analyst/registry/specialist-catalog");
      const targetKey = REGISTERED_CONSTANT_KEYS.find((k) => {
        const c = getRefreshCadenceDaysForConstant(k);
        return c != null && c >= 14;
      });
      if (!targetKey) {
        throw new Error("no constant with cadence ≥ 14d to test override");
      }
      const owner = getSpecialistForConstant(targetKey);
      if (!owner) throw new Error("no owning Specialist for target constant");
      const catalogCadence = getRefreshCadenceDaysForConstant(targetKey)!;

      // Refresh is half the catalog cadence old — fresh under catalog,
      // stale under a 1-day admin override.
      const halfCatalog = new Date(
        Date.now() - 1000 * 60 * 60 * 24 * (catalogCadence / 2),
      );
      const fresh = new Date();
      const latestRuns: Record<string, PrereqResearchRun> = {};
      for (const key of REGISTERED_CONSTANT_KEYS) {
        latestRuns[`${key}::United States::`] = { completedAt: fresh };
      }
      latestRuns[`${targetKey}::United States::`] = { completedAt: halfCatalog };

      // Sanity: with no override, this passes (catalog cadence accommodates the age).
      const passUnderCatalog = await evaluatePrerequisites(
        ["constants-refreshed-within-cadence"],
        { storage: makeStorage({ latestRuns }), userId: 1 },
      );
      expect(passUnderCatalog).toEqual([]);

      // With a 1-day override, the half-catalog-old refresh is stale.
      const failUnderOverride = await evaluatePrerequisites(
        ["constants-refreshed-within-cadence"],
        {
          storage: makeStorage({
            latestRuns,
            cadenceOverrides: { [owner.id]: 1 },
          }),
          userId: 1,
        },
      );
      expect(failUnderOverride).toHaveLength(1);
      expect(failUnderOverride[0].reason).toMatch(new RegExp(targetKey));
      expect(failUnderOverride[0].reason).toMatch(/cadence 1d/);
    });

    it("uses the admin override cadence when one is set (looser than catalog)", async () => {
      // The mirror of the previous test: a refresh older than the catalog
      // cadence passes once an admin loosens the cadence to accommodate it.
      const { REGISTERED_CONSTANT_KEYS } = await import(
        "../../shared/model-constants-registry"
      );
      const {
        getRefreshCadenceDaysForConstant,
        getSpecialistForConstant,
      } = await import("../../engine/analyst/registry/specialist-catalog");
      const targetKey = REGISTERED_CONSTANT_KEYS.find(
        (k) => getRefreshCadenceDaysForConstant(k) != null,
      );
      if (!targetKey) throw new Error("no cadenced constant available");
      const owner = getSpecialistForConstant(targetKey);
      if (!owner) throw new Error("no owning Specialist for target constant");
      const catalogCadence = getRefreshCadenceDaysForConstant(targetKey)!;

      // Refresh is two cadence periods old — stale under catalog, fresh
      // under an override that triples the catalog cadence.
      const ancient = new Date(
        Date.now() - 1000 * 60 * 60 * 24 * (catalogCadence * 2),
      );
      const fresh = new Date();
      const latestRuns: Record<string, PrereqResearchRun> = {};
      for (const key of REGISTERED_CONSTANT_KEYS) {
        latestRuns[`${key}::United States::`] = { completedAt: fresh };
      }
      latestRuns[`${targetKey}::United States::`] = { completedAt: ancient };

      const failUnderCatalog = await evaluatePrerequisites(
        ["constants-refreshed-within-cadence"],
        { storage: makeStorage({ latestRuns }), userId: 1 },
      );
      expect(failUnderCatalog).toHaveLength(1);
      expect(failUnderCatalog[0].reason).toMatch(new RegExp(targetKey));

      const passUnderOverride = await evaluatePrerequisites(
        ["constants-refreshed-within-cadence"],
        {
          storage: makeStorage({
            latestRuns,
            cadenceOverrides: { [owner.id]: catalogCadence * 3 },
          }),
          userId: 1,
        },
      );
      expect(passUnderOverride).toEqual([]);
    });
  });

  it("catches evaluator throws and reports them as failures", async () => {
    // Register a one-off evaluator that throws.
    registerPrerequisiteEvaluator(
      "all-properties-financials-computed",
      async () => {
        throw new Error("boom");
      },
    );
    const failures = await evaluatePrerequisites(
      ["all-properties-financials-computed"],
      { storage: makeStorage(), userId: 1 },
    );
    expect(failures).toHaveLength(1);
    expect(failures[0].reason).toMatch(/threw: boom/);

    // Restore the original evaluator so the rest of the suite stays clean.
    registerPrerequisiteEvaluator(
      "all-properties-financials-computed",
      async ({ storage, userId }) => {
        const props = await storage.getAllProperties(userId);
        if (props.length === 0) {
          return {
            ok: false,
            reason: "No properties in scope. Add at least one property before running this Specialist.",
          };
        }
        const uncomputed = props.filter((p) => !p.financialsComputedAt);
        if (uncomputed.length > 0) {
          return {
            ok: false,
            reason: `${uncomputed.length} property(ies) have no computed financial statement.`,
          };
        }
        return { ok: true };
      },
    );
  });
});
