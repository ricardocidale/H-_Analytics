/**
 * Task #442 — guarantees that the recompute pipeline stamps
 * `properties.financials_computed_at` atomically with engine output.
 *
 * The thin async wrappers in `server/finance/recompute.ts` are the only
 * server-side seam where engine output meets the DB freshness column. If
 * any future contributor reaches around them and calls the raw engine
 * functions directly from a route or report builder, the
 * `all-properties-financials-computed` Specialist prerequisite goes
 * silent. These tests pin the contract so that regression is loud.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const { stampSpy } = vi.hoisted(() => ({
  stampSpy: vi.fn(async (_ids: readonly number[]) => {}),
}));

vi.mock("../../server/storage", () => ({
  storage: {
    markPropertiesFinancialsComputed: stampSpy,
  },
}));

vi.mock("../../server/finance/service", () => ({
  computePortfolioProjection: vi.fn(() => ({
    engineVersion: "1.0.0",
    computedAt: new Date().toISOString(),
    perPropertyYearly: {},
    perPropertyMonthly: {},
    consolidatedYearly: [],
    companyMonthly: [],
    companyYearly: [],
    outputHash: "h",
    propertyCount: 0,
    projectionYears: 1,
    validationSummary: { opinion: "UNQUALIFIED", identityChecks: 0, passed: 0, failed: 0 },
  })),
  computePortfolioProjectionWithAudit: vi.fn(() => ({
    result: {
      engineVersion: "1.0.0",
      computedAt: new Date().toISOString(),
      perPropertyYearly: {},
      perPropertyMonthly: {},
      consolidatedYearly: [],
      companyMonthly: [],
      companyYearly: [],
      outputHash: "h",
      propertyCount: 0,
      projectionYears: 1,
      validationSummary: { opinion: "UNQUALIFIED", identityChecks: 0, passed: 0, failed: 0 },
    },
    auditTrails: [],
  })),
  computeSingleProperty: vi.fn(() => ({
    engineVersion: "1.0.0",
    computedAt: new Date().toISOString(),
    monthly: [],
    yearly: [],
    outputHash: "h",
    projectionYears: 1,
    validationSummary: { opinion: "UNQUALIFIED", identityChecks: 0, passed: 0, failed: 0 },
  })),
  computeCompanyProjection: vi.fn(() => ({
    engineVersion: "1.0.0",
    computedAt: new Date().toISOString(),
    companyMonthly: [],
    companyYearly: [],
    outputHash: "h",
    projectionYears: 1,
  })),
}));

import {
  recomputePortfolioAndStamp,
  recomputePortfolioWithAuditAndStamp,
  recomputeSinglePropertyAndStamp,
  recomputeCompanyAndStamp,
} from "../../server/finance/recompute";

const fakeGlobal = {} as never;

describe("recompute-with-stamp wrappers (Task #442)", () => {
  beforeEach(() => {
    stampSpy.mockClear();
  });

  it("recomputeSinglePropertyAndStamp stamps the single property id", async () => {
    await recomputeSinglePropertyAndStamp({
      property: { id: 17 } as never,
      globalAssumptions: fakeGlobal,
    });
    expect(stampSpy).toHaveBeenCalledTimes(1);
    expect(stampSpy).toHaveBeenCalledWith([17]);
  });

  it("recomputeCompanyAndStamp stamps every property id in the roll-up", async () => {
    await recomputeCompanyAndStamp({
      properties: [{ id: 1 }, { id: 2 }, { id: 3 }] as never,
      globalAssumptions: fakeGlobal,
    });
    expect(stampSpy).toHaveBeenCalledTimes(1);
    expect(stampSpy).toHaveBeenCalledWith([1, 2, 3]);
  });

  it("recomputePortfolioAndStamp stamps every property id in the portfolio", async () => {
    await recomputePortfolioAndStamp({
      properties: [{ id: 11 }, { id: 22 }] as never,
      globalAssumptions: fakeGlobal,
    });
    expect(stampSpy).toHaveBeenCalledTimes(1);
    expect(stampSpy).toHaveBeenCalledWith([11, 22]);
  });

  it("recomputePortfolioWithAuditAndStamp stamps every property id and forwards the audit flag", async () => {
    const out = await recomputePortfolioWithAuditAndStamp(
      {
        properties: [{ id: 5 }] as never,
        globalAssumptions: fakeGlobal,
      },
      true,
    );
    expect(out.result.engineVersion).toBe("1.0.0");
    expect(stampSpy).toHaveBeenCalledTimes(1);
    expect(stampSpy).toHaveBeenCalledWith([5]);
  });

  it("ignores property entries with no numeric id (e.g. unsaved drafts) instead of stamping garbage", async () => {
    await recomputeCompanyAndStamp({
      properties: [{ id: 1 }, { name: "draft" }, { id: NaN }, { id: "x" }, { id: 9 }] as never,
      globalAssumptions: fakeGlobal,
    });
    expect(stampSpy).toHaveBeenCalledTimes(1);
    expect(stampSpy).toHaveBeenCalledWith([1, 9]);
  });

  it("propagates DB stamp failures (no silent swallow — the freshness contract MUST fail loud)", async () => {
    stampSpy.mockRejectedValueOnce(new Error("db down"));
    await expect(
      recomputeSinglePropertyAndStamp({
        property: { id: 1 } as never,
        globalAssumptions: fakeGlobal,
      }),
    ).rejects.toThrow("db down");
  });
});
