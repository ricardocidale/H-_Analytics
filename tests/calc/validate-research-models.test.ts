import { describe, it, expect } from "vitest";
import { validateResearchValues } from "../../calc/research/validate-research";

const BASE_HOTEL = {
  roomCount: 50,
  startAdr: 250,
  maxOccupancy: 0.85,
  purchasePrice: 5_000_000,
  costRateRooms: 0.20,
  costRateFB: 0.09,
  businessModel: "hotel",
};

const BASE_LODGE = {
  roomCount: 8,
  startAdr: 400,
  maxOccupancy: 0.75,
  purchasePrice: 2_000_000,
  costRateRooms: 0.25,
  costRateFB: 0.15,
  businessModel: "lodge",
};

const BASE_VRBO = {
  roomCount: 3,
  startAdr: 350,
  maxOccupancy: 0.70,
  purchasePrice: 800_000,
  costRateRooms: 0.30,
  costRateFB: 0,
  businessModel: "vrbo",
};

function entry(display: string, mid: number) {
  return { display, mid, source: "ai" as const };
}

describe("validateResearchValues — hotel bounds (default)", () => {
  it("accepts hotel ADR within $50-$2000", () => {
    const pass = validateResearchValues({ adr: entry("$250", 250) }, BASE_HOTEL);
    expect(pass.values.adr.validation?.status).toBe("pass");
  });

  it("warns on hotel ADR below $50", () => {
    const result = validateResearchValues({ adr: entry("$30", 30) }, BASE_HOTEL);
    expect(result.values.adr.validation?.status).toBe("warn");
    expect(result.values.adr.validation?.reason).toContain("below typical minimum");
  });

  it("hotel platform fee bounds: 0-5%", () => {
    const pass = validateResearchValues({ platformFee: entry("2%", 2) }, BASE_HOTEL);
    expect(pass.values.platformFee.validation?.status).toBe("pass");

    const warn = validateResearchValues({ platformFee: entry("10%", 10) }, BASE_HOTEL);
    expect(warn.values.platformFee.validation?.status).toBe("warn");
  });

  it("hotel ramp months bounds: 3-36", () => {
    const pass = validateResearchValues({ rampMonths: entry("12 mo", 12) }, BASE_HOTEL);
    expect(pass.values.rampMonths.validation?.status).toBe("pass");

    const warn = validateResearchValues({ rampMonths: entry("48 mo", 48) }, BASE_HOTEL);
    expect(warn.values.rampMonths.validation?.status).toBe("warn");
  });
});

describe("validateResearchValues — lodge bounds", () => {
  it("accepts lodge ADR within $100-$3000", () => {
    const pass = validateResearchValues({ adr: entry("$400", 400) }, BASE_LODGE);
    expect(pass.values.adr.validation?.status).toBe("pass");
  });

  it("warns on lodge ADR below $100", () => {
    const result = validateResearchValues({ adr: entry("$60", 60) }, BASE_LODGE);
    expect(result.values.adr.validation?.status).toBe("warn");
  });

  it("lodge allows higher cap rate ceiling (18%) than hotel (15%)", () => {
    const lodgePass = validateResearchValues({ capRate: entry("16%", 16) }, BASE_LODGE);
    expect(lodgePass.values.capRate.validation?.status).toBe("pass");

    const hotelWarn = validateResearchValues({ capRate: entry("16%", 16) }, BASE_HOTEL);
    expect(hotelWarn.values.capRate.validation?.status).toBe("warn");
  });

  it("lodge has no catering above 10%", () => {
    const pass = validateResearchValues({ catering: entry("5%", 5) }, BASE_LODGE);
    expect(pass.values.catering.validation?.status).toBe("pass");

    const warn = validateResearchValues({ catering: entry("15%", 15) }, BASE_LODGE);
    expect(warn.values.catering.validation?.status).toBe("warn");
  });

  it("lodge ramp months max is 24 (shorter than hotel)", () => {
    const pass = validateResearchValues({ rampMonths: entry("20 mo", 20) }, BASE_LODGE);
    expect(pass.values.rampMonths.validation?.status).toBe("pass");

    const warn = validateResearchValues({ rampMonths: entry("30 mo", 30) }, BASE_LODGE);
    expect(warn.values.rampMonths.validation?.status).toBe("warn");
  });

  it("lodge platform fee bounds: 0-5%", () => {
    const pass = validateResearchValues({ platformFee: entry("0%", 0) }, BASE_LODGE);
    expect(pass.values.platformFee.validation?.status).toBe("pass");
  });
});

describe("validateResearchValues — vrbo bounds", () => {
  it("accepts vrbo ADR within $75-$5000", () => {
    const pass = validateResearchValues({ adr: entry("$3500", 3500) }, BASE_VRBO);
    expect(pass.values.adr.validation?.status).toBe("pass");
  });

  it("vrbo ADR ceiling ($5000) is higher than hotel ($2000)", () => {
    const vrboPass = validateResearchValues({ adr: entry("$4000", 4000) }, BASE_VRBO);
    expect(vrboPass.values.adr.validation?.status).toBe("pass");

    const hotelWarn = validateResearchValues(
      { adr: entry("$4000", 4000) },
      { ...BASE_HOTEL }
    );
    expect(hotelWarn.values.adr.validation?.status).toBe("warn");
  });

  it("vrbo platform fee bounds: 3-25%", () => {
    const pass = validateResearchValues({ platformFee: entry("14%", 14) }, BASE_VRBO);
    expect(pass.values.platformFee.validation?.status).toBe("pass");

    const warnLow = validateResearchValues({ platformFee: entry("1%", 1) }, BASE_VRBO);
    expect(warnLow.values.platformFee.validation?.status).toBe("warn");

    const warnHigh = validateResearchValues({ platformFee: entry("30%", 30) }, BASE_VRBO);
    expect(warnHigh.values.platformFee.validation?.status).toBe("warn");
  });

  it("vrbo has no catering above 5%", () => {
    const warn = validateResearchValues({ catering: entry("8%", 8) }, BASE_VRBO);
    expect(warn.values.catering.validation?.status).toBe("warn");
  });

  it("vrbo ramp months max is 12 (shortest)", () => {
    const pass = validateResearchValues({ rampMonths: entry("6 mo", 6) }, BASE_VRBO);
    expect(pass.values.rampMonths.validation?.status).toBe("pass");

    const warn = validateResearchValues({ rampMonths: entry("15 mo", 15) }, BASE_VRBO);
    expect(warn.values.rampMonths.validation?.status).toBe("warn");
  });

  it("vrbo service fee bounds are wider (0.5-30%)", () => {
    const pass = validateResearchValues({ svcFeeMarketing: entry("20%", 20) }, BASE_VRBO);
    expect(pass.values.svcFeeMarketing.validation?.status).toBe("pass");

    const hotelWarn = validateResearchValues({ svcFeeMarketing: entry("20%", 20) }, BASE_HOTEL);
    expect(hotelWarn.values.svcFeeMarketing.validation?.status).toBe("warn");
  });

  it("vrbo revenue share max is 15% (vs hotel 60%)", () => {
    const warnVrbo = validateResearchValues({ revShareEvents: entry("20%", 20) }, BASE_VRBO);
    expect(warnVrbo.values.revShareEvents.validation?.status).toBe("warn");

    const passHotel = validateResearchValues({ revShareEvents: entry("20%", 20) }, BASE_HOTEL);
    expect(passHotel.values.revShareEvents.validation?.status).toBe("pass");
  });
});

describe("validateResearchValues — default businessModel fallback", () => {
  it("uses hotel bounds when businessModel is undefined", () => {
    const prop = { ...BASE_HOTEL, businessModel: undefined };
    const result = validateResearchValues({ adr: entry("$250", 250) }, prop);
    expect(result.values.adr.validation?.status).toBe("pass");
  });

  it("uses hotel bounds for unknown businessModel", () => {
    const prop = { ...BASE_HOTEL, businessModel: "unknown" };
    const result = validateResearchValues({ adr: entry("$250", 250) }, prop);
    expect(result.values.adr.validation?.status).toBe("pass");
  });
});
