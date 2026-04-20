import { describe, it, expect } from "vitest";
import { renderTemplate } from "../../server/document-ai/templates";
import type { Property, GlobalAssumptions } from "../../shared/schema";

const FALLBACK_EXIT_CAP = 0.08;

const baseProperty: Partial<Property> = {
  id: 1,
  userId: 1,
  name: "Test Boutique Hotel",
  location: "Miami, Florida, US",
  market: "South Florida",
  roomCount: 25,
  startAdr: 450,
  adrGrowthRate: 0.03,
  startOccupancy: 0.6,
  maxOccupancy: 0.85,
  occupancyRampMonths: 6,
  purchasePrice: 8_000_000,
  buildingImprovements: 1_000_000,
  preOpeningCosts: 250_000,
  operatingReserve: 500_000,
  taxRate: 0.25,
  dispositionCommission: 0.02,
  baseManagementFeeRate: 0.03,
  incentiveManagementFeeRate: 0.1,
  operationsStartDate: "2026-01-01",
  revShareFB: 0.3,
  revShareEvents: 0.1,
  revShareOther: 0.05,
  costRateRooms: 0.25,
  costRateFB: 0.35,
  costRateAdmin: 0.08,
  costRateMarketing: 0.04,
  costRatePropertyOps: 0.05,
  costRateUtilities: 0.03,
  costRateTaxes: 0.02,
  costRateIT: 0.01,
  costRateFFE: 0.04,
  exitCapRate: null as unknown as number,
};

const baseGa: Partial<GlobalAssumptions> = {
  id: 1,
  userId: 1,
  companyName: "Hospitality Business Group",
  projectionYears: 10,
};

describe("document template defaults fallback", () => {
  for (const templateId of ["loi", "investment-memo", "management-agreement"] as const) {
    it(`${templateId}: uses defaultExitCapRate when property.exitCapRate is null, no NaN%`, () => {
      const { html } = renderTemplate(
        templateId,
        baseProperty as Property,
        baseGa as GlobalAssumptions,
        "Sender",
        "Recipient",
        FALLBACK_EXIT_CAP,
      );

      expect(html).not.toContain("NaN");
      expect(html).toContain("8.0%");
    });
  }

  it("LOI: display cap rate and NOI are computed from the same effective value", () => {
    const { html } = renderTemplate(
      "loi",
      baseProperty as Property,
      baseGa as GlobalAssumptions,
      "Sender",
      "Recipient",
      FALLBACK_EXIT_CAP,
    );

    const expectedNoi = 8_000_000 * FALLBACK_EXIT_CAP;
    const expectedNoiFormatted = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(expectedNoi);

    expect(html).toContain("8.0%");
    expect(html).toContain(expectedNoiFormatted);
  });

  it("honors explicit property.exitCapRate when set (no fallback substitution)", () => {
    const withExitCap = { ...baseProperty, exitCapRate: 0.065 } as Property;
    const { html } = renderTemplate(
      "investment-memo",
      withExitCap,
      baseGa as GlobalAssumptions,
      "Sender",
      "Recipient",
      FALLBACK_EXIT_CAP,
    );

    expect(html).toContain("Exit Cap Rate</td><td>6.5%</td>");
    expect(html).not.toContain("Exit Cap Rate</td><td>8.0%</td>");
  });
});
