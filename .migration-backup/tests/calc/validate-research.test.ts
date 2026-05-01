import { describe, it, expect } from "vitest";
import { validateResearchValues } from "../../calc/research/validate-research";

const BASE_PROPERTY = {
  roomCount: 20,
  startAdr: 330,
  maxOccupancy: 0.85,
  purchasePrice: 2300000,
  costRateRooms: 0.36,
  costRateFB: 0.32,
};

function entry(display: string, mid: number) {
  return { display, mid, source: "ai" as const };
}

describe("validateResearchValues", () => {
  it("passes reasonable ADR", () => {
    const result = validateResearchValues(
      { adr: entry("$300-$360", 330) },
      BASE_PROPERTY
    );
    expect(result.values.adr.validation?.status).toBe("pass");
    expect(result.summary.passed).toBe(1);
    expect(result.summary.warned).toBe(0);
  });

  it("warns on extremely low ADR", () => {
    const result = validateResearchValues(
      { adr: entry("$30-$40", 35) },
      BASE_PROPERTY
    );
    expect(result.values.adr.validation?.status).toBe("warn");
    expect(result.values.adr.validation?.reason).toContain("below typical minimum");
  });

  it("warns on extremely high ADR", () => {
    const result = validateResearchValues(
      { adr: entry("$2500-$3000", 2750) },
      BASE_PROPERTY
    );
    expect(result.values.adr.validation?.status).toBe("warn");
    expect(result.values.adr.validation?.reason).toContain("above typical maximum");
  });

  it("cross-validates ADR against NOI margin", () => {
    // With percentage-based costs, NOI margin stays proportional to ADR.
    // A reasonable ADR should pass the NOI margin cross-check.
    const result = validateResearchValues(
      { adr: entry("$300-$360", 330) },
      BASE_PROPERTY
    );
    expect(result.values.adr.validation?.status).toBe("pass");
  });

  it("passes reasonable occupancy", () => {
    const result = validateResearchValues(
      { occupancy: entry("80-90%", 85) },
      BASE_PROPERTY
    );
    expect(result.values.occupancy.validation?.status).toBe("pass");
  });

  it("warns on occupancy over 100%", () => {
    const result = validateResearchValues(
      { occupancy: entry("105%", 105) },
      BASE_PROPERTY
    );
    expect(result.values.occupancy.validation?.status).toBe("warn");
  });

  it("warns when start occupancy >= stabilized", () => {
    const result = validateResearchValues(
      {
        occupancy: entry("80%", 80),
        startOccupancy: entry("85%", 85),
      },
      BASE_PROPERTY
    );
    expect(result.values.startOccupancy.validation?.status).toBe("warn");
    expect(result.values.startOccupancy.validation?.reason).toContain(">=");
  });

  it("passes reasonable cap rate", () => {
    const result = validateResearchValues(
      { capRate: entry("8-9%", 8.5) },
      BASE_PROPERTY
    );
    expect(result.values.capRate.validation?.status).toBe("pass");
  });

  it("warns on cap rate outside bounds", () => {
    const result = validateResearchValues(
      { capRate: entry("1-2%", 1.5) },
      BASE_PROPERTY
    );
    expect(result.values.capRate.validation?.status).toBe("warn");
    expect(result.values.capRate.validation?.reason).toContain("below typical minimum");
  });

  it("warns when cap rate implies extreme valuation vs purchase price", () => {
    // Very low cap rate → very high implied value
    const result = validateResearchValues(
      { capRate: entry("3-4%", 3.5) },
      BASE_PROPERTY
    );
    expect(result.values.capRate.validation?.status).toBe("warn");
    expect(result.values.capRate.validation?.reason).toContain("purchase price");
  });

  it("passes reasonable cost rates", () => {
    const result = validateResearchValues(
      {
        costHousekeeping: entry("36%", 36),
        costFB: entry("32%", 32),
        costAdmin: entry("8%", 8),
      },
      BASE_PROPERTY
    );
    expect(result.summary.passed).toBe(3);
    expect(result.summary.warned).toBe(0);
  });

  it("warns on very high cost rate", () => {
    const result = validateResearchValues(
      { costHousekeeping: entry("65%", 65) },
      BASE_PROPERTY
    );
    expect(result.values.costHousekeeping.validation?.status).toBe("warn");
    expect(result.values.costHousekeeping.validation?.reason).toContain("above typical maximum");
  });

  it("passes reasonable catering boost", () => {
    const result = validateResearchValues(
      { catering: entry("30%", 30) },
      BASE_PROPERTY
    );
    expect(result.values.catering.validation?.status).toBe("pass");
  });

  it("warns on extreme catering boost", () => {
    const result = validateResearchValues(
      { catering: entry("95%", 95) },
      BASE_PROPERTY
    );
    expect(result.values.catering.validation?.status).toBe("warn");
  });

  it("passes reasonable land value", () => {
    const result = validateResearchValues(
      { landValue: entry("25%", 25) },
      BASE_PROPERTY
    );
    expect(result.values.landValue.validation?.status).toBe("pass");
  });

  it("warns on extreme land value", () => {
    const result = validateResearchValues(
      { landValue: entry("75%", 75) },
      BASE_PROPERTY
    );
    expect(result.values.landValue.validation?.status).toBe("warn");
  });

  it("passes reasonable income tax rate", () => {
    const result = validateResearchValues(
      { incomeTax: entry("25%", 25) },
      BASE_PROPERTY
    );
    expect(result.values.incomeTax.validation?.status).toBe("pass");
  });

  it("passes reasonable service fees", () => {
    const result = validateResearchValues(
      {
        svcFeeMarketing: entry("2%", 2),
        svcFeeIT: entry("1.5%", 1.5),
      },
      BASE_PROPERTY
    );
    expect(result.summary.passed).toBe(2);
  });

  it("warns on very high service fee", () => {
    const result = validateResearchValues(
      { svcFeeMarketing: entry("15%", 15) },
      BASE_PROPERTY
    );
    expect(result.values.svcFeeMarketing.validation?.status).toBe("warn");
  });

  it("passes unknown keys through without validation", () => {
    const result = validateResearchValues(
      { unknownMetric: entry("some value", 42) },
      BASE_PROPERTY
    );
    expect(result.values.unknownMetric).toBeDefined();
    expect(result.values.unknownMetric.validation).toBeUndefined();
    expect(result.summary.passed).toBe(1);
  });

  it("produces correct summary counts", () => {
    const result = validateResearchValues(
      {
        adr: entry("$300-$360", 330),        // pass
        occupancy: entry("105%", 105),        // warn (>100)
        catering: entry("30%", 30),           // pass
        landValue: entry("75%", 75),          // warn (>60)
      },
      BASE_PROPERTY
    );
    expect(result.summary.total).toBe(4);
    expect(result.summary.passed).toBe(2);
    expect(result.summary.warned).toBe(2);
    expect(result.summary.failed).toBe(0);
  });

  it("handles empty input", () => {
    const result = validateResearchValues({}, BASE_PROPERTY);
    expect(result.summary.total).toBe(0);
    expect(Object.keys(result.values)).toHaveLength(0);
  });

  it("validates ramp months", () => {
    const pass = validateResearchValues(
      { rampMonths: entry("12 mo", 12) },
      BASE_PROPERTY
    );
    expect(pass.values.rampMonths.validation?.status).toBe("pass");

    const warn = validateResearchValues(
      { rampMonths: entry("48 mo", 48) },
      BASE_PROPERTY
    );
    expect(warn.values.rampMonths.validation?.status).toBe("warn");
  });

  it("validates revenue shares", () => {
    const result = validateResearchValues(
      {
        revShareEvents: entry("30%", 30),     // pass
        revShareFB: entry("70%", 70),          // warn (>60)
      },
      BASE_PROPERTY
    );
    expect(result.values.revShareEvents.validation?.status).toBe("pass");
    expect(result.values.revShareFB.validation?.status).toBe("warn");
  });
});
