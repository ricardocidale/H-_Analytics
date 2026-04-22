/**
 * Audit #319 R4 — Constants registry migration regression test.
 *
 * Two layers of coverage:
 *
 * (A) Static parity invariants
 *     - Migrated "safe" keys (depreciationYears, daysPerMonth,
 *       inflationRate) must yield identical numeric values via
 *       getFactoryNumber() and via the legacy shared/constants exports.
 *     - The two intentionally-skipped keys (DEFAULT_COMPANY_TAX_RATE,
 *       DEFAULT_COST_RATE_TAXES) MUST still diverge from their registry
 *       counterparts so the next audit pass is a deliberate
 *       reconciliation, not an accidental flip.
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
  DEFAULT_COMPANY_TAX_RATE,
  DEFAULT_COST_RATE_TAXES,
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

  describe("documented divergences (deliberate non-migration)", () => {
    it("taxRate registry US baseline ≠ DEFAULT_COMPANY_TAX_RATE (concept mismatch)", () => {
      expect(getFactoryNumber("taxRate", "United States")).not.toBe(
        DEFAULT_COMPANY_TAX_RATE,
      );
    });

    it("costRateTaxes registry US baseline ≠ DEFAULT_COST_RATE_TAXES (locality vs flat estimate)", () => {
      expect(getFactoryNumber("costRateTaxes", "United States")).not.toBe(
        DEFAULT_COST_RATE_TAXES,
      );
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
