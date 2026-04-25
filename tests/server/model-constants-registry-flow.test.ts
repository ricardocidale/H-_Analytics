/**
 * Audit #319 R4 — Constants registry migration regression test.
 *
 * Two layers of coverage:
 *
 * (A) Static parity invariants
 *     - Migrated "safe" keys (depreciationYears, daysPerMonth,
 *       inflationRate) must yield identical numeric values via
 *       getFactoryNumber() and via the legacy shared/constants exports.
 *     - Audit #406 reconciliation: the previously-divergent keys
 *       (taxRate / costRateTaxes) are now the SINGLE SOURCE OF TRUTH —
 *       the legacy DEFAULT_COMPANY_TAX_RATE (0.30) and
 *       DEFAULT_COST_RATE_TAXES (0.03) constants have been deleted and
 *       all callers migrated to the registry. Parity MUST hold.
 *     - getFactoryNumber() is locality-aware: US ≠ MX inflationRate.
 *
 * (B) End-to-end apply-proposal flow
 *     Exercises the real HTTP endpoint that admins call to apply a
 *     Specialist proposal:
 *       POST /api/admin/model-constants/:key/apply-proposal
 *     Then verifies the persisted override row, when fed back through
 *     getEffectiveConstant (the runtime resolver every consumer reads
 *     through), wins over the factory baseline. This is the regression
 *     the migration depends on: write a Specialist override → fresh
 *     read returns the new value, NOT the factory.
 *
 * The HTTP layer is mocked the same way as
 * tests/server/model-constants-refresh.test.ts (storage + auth + logger
 * mocks) because that's the established convention in this repo for
 * route-level tests. The override row captured by the storage mock is
 * then handed to the real getEffectiveConstant resolver — that's the
 * piece that was missing from a static-only test.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import request from "supertest";

import {
  DEPRECIATION_YEARS,
  DAYS_PER_MONTH,
  DEFAULT_PROPERTY_INFLATION_RATE,
  DEFAULT_COMPANY_INFLATION_RATE,
} from "../../shared/constants";
import {
  getFactoryNumber,
  getFactoryValue,
  MODEL_CONSTANTS_REGISTRY,
} from "../../shared/model-constants-registry";
import { getEffectiveConstant } from "../../shared/get-effective-constant";
import type {
  InsertModelConstantOverride,
  ModelConstantOverride,
} from "../../shared/schema";

// ─── (B) Apply-proposal HTTP setup — mirrors model-constants-refresh.test.ts ──

const sampleRun = {
  id: 777,
  startedAt: new Date("2026-04-22T00:00:00Z"),
  completedAt: new Date("2026-04-22T00:00:05Z"),
  status: "completed",
  durationMs: 5000,
  metadata: {
    specialistId: "constants.tax-research",
    specialistLetter: "H",
    constant: { key: "taxRate", country: "United States", subdivision: null },
    proposal: {
      // Pick a value distinct from BOTH the US factory baseline (0.21) AND
      // the legacy DEFAULT_COMPANY_TAX_RATE (0.30) so the assertion can't
      // silently match either source.
      value: 0.27,
      authority: "IRS Notice 2026-XX",
      referenceUrl: "https://example.test/irs",
      reasoning: "Hypothetical statutory change for test.",
      isDifferentFromCurrent: true,
    },
    sources: [{ title: "IRS Notice", url: "https://example.test/irs-notice" }],
  },
};

// Capture the row the route layer would persist so we can re-read it
// through the real resolver.
let capturedOverride: ModelConstantOverride | null = null;

vi.mock("../../server/storage", () => ({
  storage: {
    upsertModelConstantOverride: vi.fn(
      async (data: InsertModelConstantOverride): Promise<ModelConstantOverride> => {
        const row: ModelConstantOverride = {
          id: 1,
          constantKey: data.constantKey,
          country: data.country ?? null,
          countrySubdivision: data.countrySubdivision ?? null,
          value: data.value,
          source: data.source,
          authority: data.authority ?? null,
          referenceUrl: data.referenceUrl ?? null,
          researchRunId: data.researchRunId ?? null,
          overrideNote: data.overrideNote ?? null,
          createdAt: new Date("2026-04-22T00:00:00Z"),
          createdBy: data.createdBy ?? null,
        };
        capturedOverride = row;
        return row;
      },
    ),
    deleteModelConstantOverride: vi.fn(async () => undefined),
    listModelConstantOverrides: vi.fn(async () => []),
    getRefreshCadenceOverrides: vi.fn(async () => new Map<string, number>()),
    listCanonicals: vi.fn(async () => []),
    getResearchRunsForConstant: vi.fn(async () => [sampleRun]),
    getLatestSuccessfulRunForConstant: vi.fn(async () => null),
  },
}));

vi.mock("../../server/auth", () => ({
  requireAdmin: (req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { user: { id: number } }).user = { id: 42 };
    next();
  },
}));

vi.mock("../../server/routes/helpers", () => ({
  logActivity: vi.fn(),
  logAndSendError: (res: Response, msg: string, err: unknown) => {
    res.status(500).json({ error: msg, detail: String(err) });
  },
}));

vi.mock("../../server/ai/regenerate-constants", () => ({
  proposeConstantRegeneration: vi.fn(),
}));

vi.mock("../../server/logger", () => ({
  log: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { registerModelConstantsRoutes } from "../../server/routes/admin/model-constants";

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  registerModelConstantsRoutes(app);
  return app;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Audit #319 R4 — constants registry migration invariants", () => {
  describe("safe-value parity (registry baseline === legacy export)", () => {
    it("depreciationYears: registry US baseline matches DEPRECIATION_YEARS", () => {
      expect(getFactoryNumber("depreciationYears")).toBe(DEPRECIATION_YEARS);
      expect(getFactoryNumber("depreciationYears", "United States")).toBe(
        DEPRECIATION_YEARS,
      );
    });

    it("daysPerMonth: registry universal value matches DAYS_PER_MONTH", () => {
      expect(getFactoryNumber("daysPerMonth")).toBe(DAYS_PER_MONTH);
    });

    it("inflationRate: registry US baseline matches DEFAULT_PROPERTY_INFLATION_RATE", () => {
      expect(getFactoryNumber("inflationRate")).toBe(
        DEFAULT_PROPERTY_INFLATION_RATE,
      );
      expect(getFactoryNumber("inflationRate", "United States")).toBe(
        DEFAULT_PROPERTY_INFLATION_RATE,
      );
    });

    it("inflationRate: registry US baseline also matches DEFAULT_COMPANY_INFLATION_RATE", () => {
      expect(getFactoryNumber("inflationRate")).toBe(
        DEFAULT_COMPANY_INFLATION_RATE,
      );
    });
  });

  describe("Audit #406 reconciliation — parity MUST hold", () => {
    it("taxRate registry US baseline = 0.21 (federal corporate, single source of truth)", () => {
      expect(getFactoryNumber("taxRate", "United States")).toBe(0.21);
    });

    it("costRateTaxes registry US baseline = 0.012 (single source of truth)", () => {
      expect(getFactoryNumber("costRateTaxes", "United States")).toBe(0.012);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Task #403 — company-level income tax decision lock
  //
  // The "blended company tax rate" reconciliation question (should the
  // management-company tax rate get its own `companyTaxRate` registry key, or
  // share the existing `taxRate` key with the property SPVs?) was formally
  // resolved in Task #403: SHARE the `taxRate` key. The legacy
  // `DEFAULT_COMPANY_TAX_RATE` (0.30 blended) export was deleted in Audit
  // #406; per-company override is preserved via the `globalAssumptions.
  // companyTaxRate` column. These tests lock that decision so a future PR
  // can't quietly re-introduce the split.
  // ─────────────────────────────────────────────────────────────────────────────
  describe("Task #403 — company tax decision lock", () => {
    it("there is NO `companyTaxRate` entry in MODEL_CONSTANTS_REGISTRY", () => {
      // The form-field name `companyTaxRate` is reused on the
      // globalAssumptions table and on the analyst candidateFields, but it
      // must NOT be a registered constant key — otherwise we'd have two
      // independent sources of truth for the same statutory tax rate.
      expect(MODEL_CONSTANTS_REGISTRY).not.toHaveProperty("companyTaxRate");
    });

    it("legacy DEFAULT_COMPANY_TAX_RATE export is gone from shared/constants", async () => {
      // Dynamic import keeps this test self-contained — if anyone re-adds
      // the export, this assertion will fail (and the deprecated-constants
      // guard will need its allow-list re-considered).
      const constants = await import("../../shared/constants");
      expect(
        (constants as Record<string, unknown>).DEFAULT_COMPANY_TAX_RATE,
      ).toBeUndefined();
    });

    it("company tax rate resolves through the same `taxRate` registry key as property income tax", () => {
      // The engine's company fallback (Task #597 made it locality-aware via
      // `getFactoryNumber('taxRate', global.companyCountry, …)` in
      // engine/company/company-engine.ts) and the seeded
      // `globalAssumptions.companyTaxRate` value both compute exactly
      // `getFactoryNumber('taxRate', 'United States')` = 0.21 for a US
      // management company. Locking the numeric identity here documents
      // the shared source of truth.
      const us = getFactoryNumber("taxRate", "United States");
      expect(us).toBe(0.21);
      // No silent drift to the legacy 0.30 blended estimate.
      expect(us).not.toBe(0.3);
    });

    it("locality-aware: a non-US management company picks up its own country's `taxRate`", () => {
      // Free benefit of NOT introducing a US-only `companyTaxRate` key —
      // a Mexican management company resolves to Mexico's statutory rate,
      // not the US 0.21 baseline. Asserting real numeric divergence (not
      // just "both are numbers") catches a future PR that flattens the
      // country table back to a single global value, which would silently
      // re-create the original problem this task fixed.
      const us = getFactoryNumber("taxRate", "United States");
      const mx = getFactoryNumber("taxRate", "Mexico");
      expect(Number.isFinite(us)).toBe(true);
      expect(Number.isFinite(mx)).toBe(true);
      expect(us).toBe(0.21);
      // Mexico's federal corporate ISR is 30%, materially distinct from US.
      // If this seed value is ever updated, update the assertion here and
      // record the source in the PR; the inequality below is the primary
      // invariant.
      expect(mx).not.toBe(us);
    });

    // ─────────────────────────────────────────────────────────────────────
    // Task #597 — engine fallback uses the management company's own country
    //
    // Locks the actual engine call path: `generateCompanyProForma` no
    // longer hard-codes 'United States' when `global.companyTaxRate` is
    // undefined. With a non-US `companyCountry` the recovered effective
    // tax rate (`companyIncomeTax / preTaxIncome`) must equal that
    // country's `taxRate` registry baseline — NOT the US 0.21.
    // ─────────────────────────────────────────────────────────────────────
    it("Task #597: engine falls back to the management company's own country, not US", async () => {
      const { generateCompanyProForma } = await import(
        "../../engine/company/company-engine"
      );
      const { makePropertyInput } = await import("../fixtures/factories");
      type GlobalInput = import("../../engine/types").GlobalInput;

      // Mirror the overhead-free fixture used in card-engine-parity:
      // zero out partner comp + staffing + variable costs so EBITDA > 0
      // with one small property, guaranteeing positive preTaxIncome that
      // we can divide back through to recover the engine's effective rate.
      // companyTaxRate is intentionally left undefined — this test
      // exercises the fallback path, not the override.
      const baseGlobal: GlobalInput = {
        modelStartDate: "2026-01-01",
        companyOpsStartDate: "2026-01-01",
        capitalRaise1Date: "2026-01-01",
        capitalRaise1Amount: 0,
        capitalRaise2Amount: 0,
        fundingInterestRate: 0,
        inflationRate: 0,
        fixedCostEscalationRate: 0,
        marketingRate: 0,
        miscOpsRate: 0,
        partnerCompYear1: 0, partnerCompYear2: 0, partnerCompYear3: 0,
        partnerCompYear4: 0, partnerCompYear5: 0, partnerCompYear6: 0,
        partnerCompYear7: 0, partnerCompYear8: 0, partnerCompYear9: 0,
        partnerCompYear10: 0,
        staffSalary: 0,
        officeLeaseStart: 0,
        professionalServicesStart: 0,
        techInfraStart: 0,
        businessInsuranceStart: 0,
        travelCostPerClient: 0,
        itLicensePerClient: 0,
      };

      const property = {
        ...makePropertyInput({
          operationsStartDate: "2026-01-01",
          acquisitionDate: "2026-01-01",
          roomCount: 50,
          startAdr: 200,
          startOccupancy: 0.7,
          maxOccupancy: 0.7,
          occupancyRampMonths: 1,
          occupancyGrowthStep: 0,
        }),
        baseManagementFeeRate: 0.20,
        incentiveManagementFeeRate: 0,
      };

      const recoverEffectiveRate = (months: ReturnType<typeof generateCompanyProForma>) => {
        const good = months.find(
          (m) => m.preTaxIncome > 1 && m.companyIncomeTax > 0,
        );
        if (!good) {
          throw new Error(
            "Task #597 regression: overhead-free company fixture produced no " +
            "positive-preTax month — the FIXTURE is broken, not the engine.",
          );
        }
        return good.companyIncomeTax / good.preTaxIncome;
      };

      // 1. US baseline (companyCountry undefined → resolves to US through
      //    the `country ?? null` fallback inside `getFactoryNumber`). The
      //    existing 0.21 golden value must be preserved exactly.
      const usOut = generateCompanyProForma([property], baseGlobal, 24);
      const usEffective = recoverEffectiveRate(usOut);
      expect(usEffective).toBeCloseTo(
        getFactoryNumber("taxRate", "United States"),
        12,
      );

      // 2. Same scenario but the management company is in Mexico. The
      //    effective rate must now be Mexico's `taxRate` baseline — and
      //    must NOT silently collapse back to the US 0.21. This is the
      //    actual regression Task #597 fixes.
      const mxOut = generateCompanyProForma(
        [property],
        { ...baseGlobal, companyCountry: "Mexico" },
        24,
      );
      const mxEffective = recoverEffectiveRate(mxOut);
      expect(mxEffective).toBeCloseTo(
        getFactoryNumber("taxRate", "Mexico"),
        12,
      );
      expect(mxEffective).not.toBeCloseTo(
        getFactoryNumber("taxRate", "United States"),
        4,
      );
    });
  });

  describe("Task #404 reconciliation — costRateTaxes is locality-aware everywhere", () => {
    // The legacy flat 3% `DEFAULT_COST_RATE_TAXES` is gone; remaining UI
    // fallbacks (Property Edit, Yearly Income Statement, PP&E Schedule) now
    // resolve through `getFactoryNumber('costRateTaxes', country, state)`
    // using the property's own locality. These assertions pin the baselines
    // those fallbacks rely on so a future locality edit can't silently
    // drift the user-visible defaults.
    //
    // (Admin Model Defaults → PropertyUnderwritingTab is the documented
    // exception: it edits a country-agnostic template and intentionally
    // pins the placeholder to the US registry baseline. See the comment in
    // that file.)

    it("US baseline (no state) = 0.012", () => {
      expect(getFactoryNumber("costRateTaxes", "United States")).toBe(0.012);
    });

    it("Texas overlay = 0.018 (high-property-tax state)", () => {
      expect(getFactoryNumber("costRateTaxes", "United States", "Texas"))
        .toBe(0.018);
    });

    it("California overlay = 0.008 (Prop 13)", () => {
      expect(getFactoryNumber("costRateTaxes", "United States", "California"))
        .toBe(0.008);
    });

    // Task #605 — high-volume hospitality states added to the overlay so
    // they no longer silently fall back to the US 1.2% baseline.
    it("New Jersey overlay = 0.019 (highest effective property tax in U.S.)", () => {
      expect(getFactoryNumber("costRateTaxes", "United States", "New Jersey"))
        .toBe(0.019);
    });

    it("Massachusetts overlay = 0.012 (commercial-classified hospitality)", () => {
      expect(getFactoryNumber("costRateTaxes", "United States", "Massachusetts"))
        .toBe(0.012);
    });

    it("Illinois overlay = 0.019 (second-highest effective property tax)", () => {
      expect(getFactoryNumber("costRateTaxes", "United States", "Illinois"))
        .toBe(0.019);
    });

    it("Georgia overlay = 0.009 (locked-in baseline)", () => {
      expect(getFactoryNumber("costRateTaxes", "United States", "Georgia"))
        .toBe(0.009);
    });

    it("United Kingdom = 0.012 (Council Tax / Business Rates)", () => {
      expect(getFactoryNumber("costRateTaxes", "United Kingdom")).toBe(0.012);
    });

    it("Costa Rica = 0.0025 (IBI — meaningfully different from the legacy flat 3%)", () => {
      const cr = getFactoryNumber("costRateTaxes", "Costa Rica");
      expect(cr).toBe(0.0025);
      // The whole point of the reconciliation: the locality-aware value
      // must NOT collapse to the deleted legacy flat 0.03 estimate.
      expect(cr).not.toBe(0.03);
    });

    it("country fallback returns US baseline when country is unknown", () => {
      expect(getFactoryNumber("costRateTaxes", null)).toBe(0.012);
      expect(getFactoryNumber("costRateTaxes", "Atlantis"))
        .toBe(getFactoryNumber("costRateTaxes", "United States"));
    });
  });

  describe("locality awareness", () => {
    it("country override changes registry output for inflationRate (US 0.03 ≠ MX 0.04)", () => {
      const us = getFactoryNumber("inflationRate", "United States");
      const mx = getFactoryNumber("inflationRate", "Mexico");
      expect(Number.isFinite(us)).toBe(true);
      expect(Number.isFinite(mx)).toBe(true);
      expect(us).not.toBe(mx);
    });

    it("getFactoryNumber throws if a key resolves to a non-number", () => {
      expect(() => getFactoryNumber("not-a-real-key" as never)).toThrow();
    });
  });

  describe("registry contract", () => {
    it("all 7 R4 migration keys are registered", () => {
      const expected = [
        "depreciationYears",
        "daysPerMonth",
        "taxRate",
        "costRateTaxes",
        "countryRiskPremium",
        "inflationRate",
        "capitalGainsRate",
      ];
      for (const k of expected) {
        expect(MODEL_CONSTANTS_REGISTRY[k]).toBeDefined();
        expect(typeof getFactoryValue(k, "United States")).toBe("number");
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // (B) End-to-end: apply-proposal HTTP flow → resolver picks up the override
  // ─────────────────────────────────────────────────────────────────────────────
  describe("apply-proposal flow → fresh read returns override, not factory", () => {
    let app: Express;

    beforeEach(() => {
      capturedOverride = null;
      vi.clearAllMocks();
      app = buildApp();
    });

    it("admin-applied Specialist proposal for taxRate/US persists and overrides factory", async () => {
      // 1. Pre-condition: factory baseline is the US registry value.
      const factoryUs = getFactoryNumber("taxRate", "United States");
      expect(factoryUs).not.toBe(0.27); // sanity: chosen value is genuinely new

      // 2. Drive the actual route the admin UI hits.
      const res = await request(app)
        .post("/api/admin/model-constants/taxRate/apply-proposal?country=United%20States")
        .send({ researchRunId: 777 });

      expect(res.status).toBe(200);
      expect(res.body.appliedFromResearchRunId).toBe(777);
      expect(res.body.wasFactoryEqual).toBe(false);

      // 3. The route persisted exactly the Specialist's value (not anything
      // the admin could have injected) at the right locality, with the
      // right source.
      expect(capturedOverride).not.toBeNull();
      const row = capturedOverride!;
      expect(row.constantKey).toBe("taxRate");
      expect(row.country).toBe("United States");
      expect(row.countrySubdivision).toBeNull();
      expect(row.value).toBe(0.27);
      expect(row.source).toBe("analyst");
      expect(row.authority).toBe("IRS Notice 2026-XX");
      expect(row.researchRunId).toBe(777);

      // 4. Fresh read through the runtime resolver (the path every
      // engine/calc/server/client consumer eventually reads through):
      // the override wins, the factory does not leak through.
      const resolved = getEffectiveConstant<number>({
        key: "taxRate",
        country: "United States",
        subdivision: null,
        overrides: [row],
        canonicals: [],
      });
      expect(resolved.value).toBe(0.27);
      expect(resolved.source).toBe("analyst");
      expect(resolved.authority).toBe("IRS Notice 2026-XX");

      // 5. Sibling localities are unaffected — Mexico still resolves to its
      // own factory because no MX override row was written.
      const mxResolved = getEffectiveConstant<number>({
        key: "taxRate",
        country: "Mexico",
        subdivision: null,
        overrides: [row],
        canonicals: [],
      });
      expect(mxResolved.source).toBe("factory");
      expect(mxResolved.value).toBe(getFactoryNumber("taxRate", "Mexico"));
    });
  });
});
